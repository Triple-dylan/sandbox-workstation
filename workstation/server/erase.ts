import { InputError, type Store } from './store.ts';
import { atomically, wipeSpace } from './purge.ts';
import type { Id } from '../shared/types.ts';

/** What a person who deleted their data is shown as, where their shared work stays. */
export const DELETED_NAME = 'Deleted person';

/**
 * A person deletes their data. Gone at once, with no grace period: their own space and everything
 * in it, their agents and all those agents did, every message they wrote anywhere, their private
 * pages in shared workspaces, their sign-ins and linked accounts, and workspaces only they were in.
 *
 * What they shared with a workspace stays with it, as the work of "Deleted person": its pages
 * and their history are the team's. A workspace they started that others are still in is not
 * theirs alone to remove, so they delete it first (there is no handing one over yet).
 */
export function deleteMyData(store: Store, userId: Id, confirm: string) {
  const db = store.db;
  const me = store.user(userId);
  if (!me || me.kind !== 'human') throw new InputError('Unknown person.');
  if (confirm.trim() !== me.name) throw new InputError(`Type ${me.name} exactly to delete it all.`);
  const ids = (sql: string, ...args: (string | null)[]) =>
    (db.prepare(sql).all(...args) as { id: Id }[]).map((r) => r.id);

  const owned = db
    .prepare(
      `select s.id, s.name, s.deleted_at,
        (select count(*) from members m join users u on u.id = m.user_id
         where m.space_id = s.id and u.kind = 'human' and u.id != ?) others
       from spaces s where s.kind = 'project' and s.owner_id = ? order by s.created_at`,
    )
    .all(userId, userId) as { id: Id; name: string; deleted_at: string | null; others: number }[];
  const shared = owned.filter((s) => !s.deleted_at && s.others > 0);
  if (shared.length) {
    const names = shared.map((s) => s.name).join(', ');
    throw new InputError(
      `You started ${names}, and others are still in ${shared.length > 1 ? 'them' : 'it'}. Delete ${shared.length > 1 ? 'them' : 'it'} in People first.`,
    );
  }

  atomically(db, () => {
    // Spaces that are theirs alone, including any they deleted that have not been purged yet.
    const personal = ids(`select id from spaces where kind = 'personal' and owner_id = ?`, userId);
    for (const spaceId of [...personal, ...owned.map((s) => s.id)]) wipeSpace(db, spaceId);

    // Their agents: their own, and any other they made that answers to them.
    const agents = ids(`select id from users where kind = 'agent' and owner_id = ?`, userId);
    const people = JSON.stringify([userId, ...agents]);
    const agentList = JSON.stringify(agents);
    const each = '(select value from json_each(?))';

    // Their private pages in shared workspaces, with anything on them, and chats about them.
    const pages = ids(
      `with recursive gone(id) as (
         select id from resources where owner_id = ? and visibility = 'private'
         union select r.id from resources r join gone g on r.parent_id = g.id
       ) select id from gone`,
      userId,
    );
    const pageList = JSON.stringify(pages);
    const discussions = JSON.stringify(
      ids(`select id from conversations where resource_id in ${each}`, pageList),
    );
    // Every message they or their agents wrote, wherever it is.
    const written = JSON.stringify(
      ids(
        `select id from messages where author_id in ${each} or conversation_id in ${each}`,
        people,
        discussions,
      ),
    );

    const steps: [string, ...string[]][] = [
      [`delete from reactions where message_id in ${each} or user_id in ${each}`, written, people],
      // Others' replies stay; they just no longer point at a message that is gone.
      [`update messages set reply_to = null where reply_to in ${each}`, written],
      [`delete from messages where id in ${each}`, written],
      [
        `delete from reads where conversation_id in ${each} or user_id in ${each}`,
        discussions,
        people,
      ],
      [`delete from participants where conversation_id in ${each}`, discussions],
      [
        `delete from channel_pins where conversation_id in ${each} or resource_id in ${each}`,
        discussions,
        pageList,
      ],
      [`delete from conversations where id in ${each}`, discussions],
      [`delete from revisions where resource_id in ${each}`, pageList],
      [
        `delete from placements where resource_id in ${each} or user_id in ${each}`,
        pageList,
        people,
      ],
      [`delete from grants where resource_id in ${each} or user_id in ${each}`, pageList, people],
      [`delete from passage_vectors where resource_id in ${each}`, pageList],
      [`delete from doc_states where resource_id in ${each}`, pageList],
      [
        `delete from watches where resource_id in ${each} or agent_id in ${each} or set_by = ?`,
        pageList,
        agentList,
        userId,
      ],
      [`delete from resources where id in ${each}`, pageList],
      // What their agents were doing, and what they set other agents to do.
      [
        `delete from approvals where agent_id in ${each} or job_id in (select id from jobs where agent_id in ${each})`,
        agentList,
        agentList,
      ],
      [`delete from jobs where agent_id in ${each}`, agentList],
      [`delete from assignments where agent_id in ${each} or created_by = ?`, agentList, userId],
      [`delete from routines where agent_id in ${each} or created_by = ?`, agentList, userId],
      [
        `delete from agent_requests where from_user = ? or to_user = ? or from_agent in ${each}`,
        userId,
        userId,
        agentList,
      ],
      [`delete from agent_skills where agent_id in ${each}`, agentList],
      [`update goals set owner_id = null where owner_id = ?`, userId],
      [`update goals set agent_id = null where agent_id in ${each}`, agentList],
      [`delete from agent_usage where scope = 'person' and key = ?`, userId],
      // Their agents leave every chat and workspace; one-to-one chats keep the other person's side.
      [`delete from participants where user_id in ${each}`, agentList],
      [`delete from members where user_id in ${each}`, people],
      [`delete from users where id in ${each}`, agentList],
      // Every way of signing in as them, and the accounts they linked.
      ['delete from sessions where user_id = ?', userId],
      ['delete from identities where user_id = ?', userId],
      ['delete from signin_links where user_id = ?', userId],
      ['delete from connections where user_id = ?', userId],
      // What stays shows as a deleted person, who can never be signed in as or messaged.
      [
        `update users set name = ?, color = '#8a8a8a', kind = 'deleted', character = null,
           purpose = null, instructions = null where id = ?`,
        DELETED_NAME,
        userId,
      ],
    ];
    for (const [sql, ...args] of steps) db.prepare(sql).run(...args);
    // Tokens for agents that run elsewhere, where that table exists.
    if (
      db.prepare(`select 1 from sqlite_master where type = 'table' and name = 'agent_tokens'`).get()
    )
      db.prepare(`delete from agent_tokens where agent_id in ${each}`).run(agentList);
  });
  store.changed();
}

import type { Db } from './db.ts';
import type { Id } from '../shared/types.ts';

/**
 * Deleting a workspace closes it at once (`Store.deleteProject`), but its rows stay so a mistake
 * can still be looked into. After a grace period the purge removes them for good: every page,
 * chat, message, job and agent that belonged to it, and everything hanging off those.
 */

/** Days a deleted workspace's rows are kept before they are purged. */
export const PURGE_AFTER_DAYS = 30;
/** How often the server looks for workspaces past their grace period. */
export const PURGE_EVERY_MS = 6 * 60 * 60 * 1000;

/** The grace period from the environment: `PURGE_AFTER_DAYS`, a whole number of days, 0 or more. */
export function purgeAfterDays(env: NodeJS.ProcessEnv) {
  const raw = env.PURGE_AFTER_DAYS?.trim();
  if (!raw) return PURGE_AFTER_DAYS;
  const days = Number(raw);
  return Number.isInteger(days) && days >= 0 ? days : PURGE_AFTER_DAYS;
}

/** Purges every deleted workspace whose grace period is over. Returns the ids it purged. */
export function purgeDeletedWorkspaces(
  db: Db,
  options: { afterDays?: number; now?: Date } = {},
): Id[] {
  const afterDays = options.afterDays ?? PURGE_AFTER_DAYS;
  const cutoff = new Date((options.now ?? new Date()).getTime() - afterDays * 86_400_000);
  const due = db
    .prepare(
      `select id from spaces where kind = 'project' and deleted_at is not null and deleted_at <= ?`,
    )
    .all(cutoff.toISOString()) as { id: Id }[];
  for (const { id } of due) wipeSpace(db, id);
  return due.map((r) => r.id);
}

/**
 * Removes a space and everything in it, all or nothing. Also removes the agents that
 * belonged to it and any one-to-one chats people had with them.
 */
export function wipeSpace(db: Db, spaceId: Id) {
  const ids = (sql: string, ...args: (string | null)[]) =>
    (db.prepare(sql).all(...args) as { id: Id }[]).map((r) => r.id);
  const agents = ids(
    `select id from users where kind = 'agent' and role = 'project' and space_id = ?`,
    spaceId,
  );
  const conversations = [
    ...ids('select id from conversations where space_id = ?', spaceId),
    ...ids(
      `select distinct c.id from conversations c join participants p on p.conversation_id = c.id
       where c.kind = 'dm' and p.user_id in (select value from json_each(?))`,
      JSON.stringify(agents),
    ),
  ];
  const resources = ids('select id from resources where space_id = ?', spaceId);
  const messages = ids(
    'select id from messages where conversation_id in (select value from json_each(?))',
    JSON.stringify(conversations),
  );
  const skills = ids('select id from skills where space_id = ?', spaceId);
  const each = '(select value from json_each(?))';
  const steps: [string, ...string[]][] = [
    [`delete from reactions where message_id in ${each}`, JSON.stringify(messages)],
    [`delete from messages where conversation_id in ${each}`, JSON.stringify(conversations)],
    [`delete from participants where conversation_id in ${each}`, JSON.stringify(conversations)],
    [`delete from reads where conversation_id in ${each}`, JSON.stringify(conversations)],
    [
      `delete from channel_pins where conversation_id in ${each} or resource_id in ${each}`,
      JSON.stringify(conversations),
      JSON.stringify(resources),
    ],
    [`delete from conversations where id in ${each}`, JSON.stringify(conversations)],
    [`delete from revisions where resource_id in ${each}`, JSON.stringify(resources)],
    [`delete from placements where resource_id in ${each}`, JSON.stringify(resources)],
    [`delete from grants where resource_id in ${each}`, JSON.stringify(resources)],
    [`delete from passage_vectors where resource_id in ${each}`, JSON.stringify(resources)],
    [`delete from doc_states where resource_id in ${each}`, JSON.stringify(resources)],
    [
      `delete from watches where resource_id in ${each} or agent_id in ${each}`,
      JSON.stringify(resources),
      JSON.stringify(agents),
    ],
    ['delete from resources where space_id = ?', spaceId],
    [
      `delete from agent_skills where skill_id in ${each} or agent_id in ${each}`,
      JSON.stringify(skills),
      JSON.stringify(agents),
    ],
    ['delete from skills where space_id = ?', spaceId],
    ['delete from approvals where space_id = ?', spaceId],
    ['delete from jobs where space_id = ?', spaceId],
    ['delete from assignments where space_id = ?', spaceId],
    ['delete from routines where space_id = ?', spaceId],
    ['delete from agent_requests where space_id = ?', spaceId],
    ['delete from goals where space_id = ?', spaceId],
    ['delete from browser_states where space_id = ?', spaceId],
    [`delete from agent_usage where scope = 'space' and key = ?`, spaceId],
    ['delete from invites where space_id = ?', spaceId],
    [
      `delete from members where space_id = ? or user_id in ${each}`,
      spaceId,
      JSON.stringify(agents),
    ],
    [`delete from users where id in ${each}`, JSON.stringify(agents)],
    ['delete from spaces where id = ?', spaceId],
  ];
  atomically(db, () => {
    for (const [sql, ...args] of steps) db.prepare(sql).run(...args);
  });
}

/** Runs the changes all or nothing. A savepoint, so it can sit inside a larger change. */
export function atomically(db: Db, change: () => void) {
  const name = `change_${Math.random().toString(36).slice(2)}`;
  db.exec(`savepoint ${name}`);
  try {
    change();
    db.exec(`release ${name}`);
  } catch (error) {
    db.exec(`rollback to ${name}`);
    db.exec(`release ${name}`);
    throw error;
  }
}

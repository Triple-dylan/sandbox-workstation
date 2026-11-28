import { AccessError, InputError, type Store } from './store.ts';
import type { Id } from '../shared/types.ts';

/**
 * The person who started a workspace hands it to someone else in it. The new owner can then rename
 * it, remove people and delete it; the old owner stays in it as an ordinary member and can leave.
 * Typing the workspace's name confirms it, since only the new owner can hand it back.
 */
export function handOverProject(store: Store, actorId: Id, spaceId: Id, toId: Id, confirm: string) {
  const space = store.requireMember(actorId, spaceId);
  if (space.kind !== 'project') throw new InputError('Your private space cannot be handed over.');
  if (space.ownerId !== actorId)
    throw new AccessError(`Only the person who started ${space.name} can do that.`);
  if (toId === actorId) throw new InputError(`You already own ${space.name}.`);
  const to = store.user(toId);
  if (!to || to.kind !== 'human' || !store.isMember(toId, spaceId))
    throw new InputError(`Choose someone who is in ${space.name}.`);
  if (confirm.trim() !== space.name)
    throw new InputError(`Type ${space.name} exactly to hand it to ${to.name}.`);
  const db = store.db;
  // All three together, or none: a workspace always has exactly one owner.
  db.exec('savepoint hand_over');
  try {
    db.prepare('update spaces set owner_id = ? where id = ?').run(toId, spaceId);
    db.prepare(`update members set role = 'member' where space_id = ? and user_id = ?`).run(
      spaceId,
      actorId,
    );
    db.prepare(`update members set role = 'owner' where space_id = ? and user_id = ?`).run(
      spaceId,
      toId,
    );
    db.exec('release hand_over');
  } catch (error) {
    db.exec('rollback to hand_over');
    db.exec('release hand_over');
    throw error;
  }
  store.changed();
  return store.space(spaceId)!;
}

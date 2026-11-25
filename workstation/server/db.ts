import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const schema = `
create table if not exists users (
  id text primary key, name text not null, color text not null, kind text not null,
  character text, owner_id text, space_id text, role text, created_at text not null
);
create table if not exists sessions (token text primary key, user_id text not null);
create table if not exists identities (subject text primary key, user_id text not null, email text);
create table if not exists invites (
  token text primary key, space_id text not null, created_by text not null, created_at text not null,
  expires_at text not null, revoked integer not null default 0, uses integer not null default 0
);
create table if not exists signin_links (
  token_hash text primary key, user_id text not null, expires_at text not null, used integer not null default 0
);
create table if not exists spaces (
  id text primary key, kind text not null, name text not null, owner_id text not null, created_at text not null
);
create table if not exists members (
  space_id text not null, user_id text not null, role text not null, primary key (space_id, user_id)
);
create table if not exists resources (
  id text primary key, space_id text not null, parent_id text, kind text not null, title text not null,
  body text not null, visibility text not null, owner_id text not null, placement text, role text,
  deleted integer not null default 0, created_at text not null, updated_at text not null, updated_by text not null
);
create table if not exists revisions (
  id text primary key, resource_id text not null, title text not null, body text not null,
  author_id text not null, created_at text not null
);
create table if not exists conversations (
  id text primary key, kind text not null, space_id text, title text not null, resource_id text, created_at text not null
);
create table if not exists participants (
  conversation_id text not null, user_id text not null, primary key (conversation_id, user_id)
);
create table if not exists messages (
  id text primary key, conversation_id text not null, author_id text not null, text text not null,
  anchor text, addressed_to text, reply_to text, job_id text, approval_id text, runtime text, created_at text not null,
  delegated integer not null default 0
);
create index if not exists messages_by_conversation on messages (conversation_id, created_at);
create table if not exists jobs (
  id text primary key, agent_id text not null, space_id text not null, conversation_id text, kind text not null,
  status text not null, request text not null, target_resource_id text, runtime text not null, error text,
  created_at text not null, updated_at text not null
);
create table if not exists assignments (
  id text primary key, agent_id text not null, space_id text not null, conversation_id text not null,
  instruction text not null, created_by text not null, active integer not null, last_run_at text, created_at text not null
);
create table if not exists approvals (
  id text primary key, job_id text not null, space_id text not null, agent_id text not null, proposal text not null,
  status text not null, decided_by text, result_resource_id text, created_at text not null
);
create table if not exists reads (
  user_id text not null, conversation_id text not null, last_read_at text not null, primary key (user_id, conversation_id)
);
create table if not exists placements (
  user_id text not null, resource_id text not null, placement text not null, primary key (user_id, resource_id)
);
create table if not exists channel_pins (
  conversation_id text not null, resource_id text not null, primary key (conversation_id, resource_id)
);
create table if not exists grants (
  resource_id text not null, user_id text not null, primary key (resource_id, user_id)
);
create table if not exists reactions (
  message_id text not null, user_id text not null, emoji text not null, primary key (message_id, user_id, emoji)
);
create table if not exists skills (
  id text primary key, space_id text not null, owner_id text not null, name text not null,
  description text not null, body text not null, deleted integer not null default 0, updated_at text not null
);
create table if not exists agent_skills (
  agent_id text not null, skill_id text not null, primary key (agent_id, skill_id)
);
create table if not exists goals (
  id text primary key, space_id text not null, title text not null, owner_id text, agent_id text, due text,
  done integer not null default 0, position integer not null, source_message_id text, created_by text not null,
  created_at text not null
);
create table if not exists usage (day text primary key, tokens integer not null);
create table if not exists agent_usage (
  day text not null, scope text not null, key text not null, tokens integer not null,
  primary key (day, scope, key)
);
`;

export type Db = DatabaseSync;

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('pragma journal_mode = wal; pragma foreign_keys = on;');
  db.exec(schema);
  // Added after the first databases were created; ignore the error where the column already exists.
  for (const column of ['purpose text', 'instructions text', 'retired integer not null default 0'])
    try {
      db.exec(`alter table users add column ${column}`);
    } catch {
      // Already there.
    }
  for (const change of [
    'alter table resources add column style text',
    'alter table resources add column source text',
    'alter table resources add column archived integer not null default 0',
    'alter table messages add column resolved integer not null default 0',
    'alter table messages add column embed text',
    'alter table messages add column sources text',
    'alter table messages add column context text',
    'alter table messages add column shared_from text',
  ])
    try {
      db.exec(change);
    } catch {
      // Already there.
    }
  return db;
}

import { randomBytes, randomUUID } from 'node:crypto';
import type { Db } from './db.ts';
import type {
  Anchor,
  Approval,
  Assignment,
  Character,
  Conversation,
  Id,
  Job,
  JobKind,
  JobStatus,
  Member,
  Message,
  Placement,
  Presence,
  Proposal,
  Resource,
  SendRequest,
  Snapshot,
  Space,
  User,
} from '../shared/types.ts';

export class AccessError extends Error {
  status = 403;
}
export class InputError extends Error {
  status = 400;
}

const now = () => new Date().toISOString();
const id = () => randomUUID();
const json = (value: unknown) => (value == null ? null : JSON.stringify(value));
export const titleFrom = (body: string) =>
  body.trim().split('\n')[0].trim().slice(0, 60) || 'Untitled';
const parse = <T>(value: unknown): T | null =>
  typeof value === 'string' ? JSON.parse(value) : null;

const humanColors = ['#b4443c', '#2f6fb3', '#2f8a57', '#8a55b5', '#b86a1f', '#1f8a8a', '#b03f7c'];
const shapes: Character['shape'][] = ['round', 'tall', 'wide'];
const eyes: Character['eyes'][] = ['dot', 'arc'];

type Row = Record<string, any>;

const toUser = (r: Row): User => ({
  id: r.id,
  name: r.name,
  color: r.color,
  kind: r.kind,
  ...(r.character ? { character: parse<Character>(r.character)! } : {}),
  ...(r.owner_id ? { ownerId: r.owner_id } : {}),
  ...(r.space_id ? { spaceId: r.space_id } : {}),
  ...(r.role ? { role: r.role } : {}),
});
const toResource = (r: Row): Resource => ({
  id: r.id,
  spaceId: r.space_id,
  parentId: r.parent_id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  visibility: r.visibility,
  ownerId: r.owner_id,
  placement: parse<Placement>(r.placement),
  ...(r.role ? { role: r.role } : {}),
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
});
const toMessage = (r: Row): Message => ({
  id: r.id,
  conversationId: r.conversation_id,
  authorId: r.author_id,
  text: r.text,
  anchor: parse<Anchor>(r.anchor),
  addressedTo: r.addressed_to,
  delegated: !!r.delegated,
  replyTo: r.reply_to,
  jobId: r.job_id,
  approvalId: r.approval_id,
  runtime: r.runtime,
  createdAt: r.created_at,
});
const toJob = (r: Row): Job => ({
  id: r.id,
  agentId: r.agent_id,
  spaceId: r.space_id,
  conversationId: r.conversation_id,
  kind: r.kind,
  status: r.status,
  request: r.request,
  targetResourceId: r.target_resource_id,
  runtime: r.runtime,
  error: r.error,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const toAssignment = (r: Row): Assignment => ({
  id: r.id,
  agentId: r.agent_id,
  spaceId: r.space_id,
  conversationId: r.conversation_id,
  instruction: r.instruction,
  createdBy: r.created_by,
  active: !!r.active,
  lastRunAt: r.last_run_at,
  createdAt: r.created_at,
});
const toApproval = (r: Row): Approval => ({
  id: r.id,
  jobId: r.job_id,
  spaceId: r.space_id,
  agentId: r.agent_id,
  proposal: parse<Proposal>(r.proposal)!,
  status: r.status,
  decidedBy: r.decided_by,
  resultResourceId: r.result_resource_id,
  createdAt: r.created_at,
});

export type ChangeEvent =
  | { type: 'message'; message: Message }
  | { type: 'resource'; resource: Resource; actorId: Id }
  | { type: 'other' };

export class Store {
  version = 0;
  private listeners = new Set<(event: ChangeEvent) => void>();
  readonly db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  onChange(listener: (event: ChangeEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  changed(event: ChangeEvent = { type: 'other' }) {
    this.version++;
    for (const listener of this.listeners) listener(event);
  }

  private get(sql: string, ...args: any[]) {
    return this.db.prepare(sql).get(...args) as Row | undefined;
  }
  private all(sql: string, ...args: any[]) {
    return this.db.prepare(sql).all(...args) as Row[];
  }
  private run(sql: string, ...args: any[]) {
    this.db.prepare(sql).run(...args);
  }

  // ---------- identity ----------

  profiles() {
    return this.all(`select * from users where kind = 'human' order by created_at`).map(toUser);
  }
  user(userId: Id) {
    const row = this.get('select * from users where id = ?', userId);
    return row ? toUser(row) : null;
  }
  createHuman(rawName: string) {
    const name = rawName.trim().slice(0, 40);
    if (!name) throw new InputError('A name is required.');
    if (this.get(`select 1 from users where kind = 'human' and lower(name) = lower(?)`, name))
      throw new InputError('That name is already on this server. Continue as that person instead.');
    const count = Number(this.get(`select count(*) n from users where kind = 'human'`)!.n);
    const userId = id();
    const at = now();
    this.run(
      'insert into users (id, name, color, kind, created_at) values (?, ?, ?, ?, ?)',
      userId,
      name,
      humanColors[count % humanColors.length],
      'human',
      at,
    );
    const spaceId = id();
    this.run(
      'insert into spaces (id, kind, name, owner_id, created_at) values (?, ?, ?, ?, ?)',
      spaceId,
      'personal',
      'Personal',
      userId,
      at,
    );
    this.run('insert into members values (?, ?, ?)', spaceId, userId, 'owner');
    const agentId = this.createAgent(`${name}'s agent`, { ownerId: userId, role: 'personal' });
    this.run('insert into members values (?, ?, ?)', spaceId, agentId, 'agent');
    const conversationId = this.createConversation('agent-private', spaceId, 'Your agent', null, [
      userId,
      agentId,
    ]);
    void conversationId;
    this.changed();
    return this.user(userId)!;
  }
  createAgent(name: string, scope: { ownerId?: Id; spaceId?: Id; role: 'personal' | 'project' }) {
    const agentId = id();
    const character: Character = {
      hue: Math.floor(Math.random() * 360),
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      eyes: eyes[Math.floor(Math.random() * eyes.length)],
    };
    this.run(
      'insert into users (id, name, color, kind, character, owner_id, space_id, role, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      agentId,
      name,
      `hsl(${character.hue} 35% 45%)`,
      'agent',
      json(character),
      scope.ownerId ?? null,
      scope.spaceId ?? null,
      scope.role,
      now(),
    );
    return agentId;
  }
  createSession(userId: Id) {
    if (!this.user(userId) || this.user(userId)!.kind !== 'human')
      throw new InputError('Unknown person.');
    const token = randomBytes(24).toString('base64url');
    this.run('insert into sessions values (?, ?)', token, userId);
    return token;
  }
  userForToken(token: string | undefined) {
    if (!token) return null;
    const row = this.get('select user_id from sessions where token = ?', token);
    return row ? this.user(row.user_id) : null;
  }

  // ---------- access ----------

  /** Personal agents act with their owner's access; project agents with their own membership. */
  principal(userId: Id) {
    const user = this.user(userId);
    return user?.kind === 'agent' && user.role === 'personal' && user.ownerId
      ? user.ownerId
      : userId;
  }
  isMember(userId: Id, spaceId: Id | null) {
    if (!spaceId) return false;
    return !!this.get(
      'select 1 from members where space_id = ? and user_id = ?',
      spaceId,
      this.principal(userId),
    );
  }
  canReadResource(userId: Id, resource: Resource) {
    const who = this.principal(userId);
    return (
      this.isMember(userId, resource.spaceId) &&
      (resource.visibility === 'space' || resource.ownerId === who || resource.ownerId === userId)
    );
  }
  canReadConversation(userId: Id, conversation: Conversation) {
    const who = this.principal(userId);
    if (conversation.kind === 'channel') return this.isMember(userId, conversation.spaceId);
    if (conversation.kind === 'discussion') {
      const resource = conversation.resourceId && this.resource(conversation.resourceId);
      return !!resource && this.canReadResource(userId, resource);
    }
    return (
      conversation.participantIds.includes(userId) || conversation.participantIds.includes(who)
    );
  }
  space(spaceId: Id) {
    const row = this.get('select * from spaces where id = ?', spaceId);
    return row
      ? ({ id: row.id, kind: row.kind, name: row.name, ownerId: row.owner_id } as Space)
      : null;
  }
  requireMember(userId: Id, spaceId: Id) {
    if (!this.isMember(userId, spaceId)) throw new AccessError('Not a member of this space.');
    return this.space(spaceId)!;
  }

  // ---------- spaces ----------

  createProject(actorId: Id, rawName: string) {
    const name = rawName.trim().slice(0, 60);
    if (!name) throw new InputError('A project name is required.');
    const spaceId = id();
    const at = now();
    this.run(
      'insert into spaces (id, kind, name, owner_id, created_at) values (?, ?, ?, ?, ?)',
      spaceId,
      'project',
      name,
      actorId,
      at,
    );
    this.run('insert into members values (?, ?, ?)', spaceId, actorId, 'owner');
    const agentId = this.createAgent(`${name} agent`, { spaceId, role: 'project' });
    this.run('insert into members values (?, ?, ?)', spaceId, agentId, 'agent');
    this.insertResource(agentId, {
      spaceId,
      kind: 'folder',
      title: 'Resources & context',
      body: '',
      visibility: 'space',
      role: 'resources',
    });
    this.insertResource(agentId, {
      spaceId,
      kind: 'doc',
      title: 'Orientation',
      body: `# ${name}\n\nThe project agent keeps this orientation up to date as work happens.`,
      visibility: 'space',
      role: 'orientation',
    });
    this.createConversation('channel', spaceId, 'general', null, []);
    this.changed();
    return this.space(spaceId)!;
  }
  addMember(actorId: Id, spaceId: Id, userId: Id) {
    const space = this.requireMember(actorId, spaceId);
    if (space.kind !== 'project') throw new InputError('Only projects can be shared.');
    const user = this.user(userId);
    if (!user || user.kind !== 'human') throw new InputError('Unknown person.');
    this.run('insert or ignore into members values (?, ?, ?)', spaceId, userId, 'member');
    this.changed();
  }
  projectAgent(spaceId: Id) {
    const row = this.get(
      `select * from users where kind = 'agent' and role = 'project' and space_id = ?`,
      spaceId,
    );
    return row ? toUser(row) : null;
  }
  personalSpace(userId: Id) {
    const row = this.get(`select id from spaces where kind = 'personal' and owner_id = ?`, userId);
    return row ? (row.id as Id) : null;
  }
  memberSpaces(userId: Id) {
    return this.all('select space_id from members where user_id = ?', this.principal(userId)).map(
      (r) => r.space_id as Id,
    );
  }
  personalAgent(userId: Id) {
    const row = this.get(
      `select * from users where kind = 'agent' and role = 'personal' and owner_id = ?`,
      userId,
    );
    return row ? toUser(row) : null;
  }

  // ---------- resources ----------

  resource(resourceId: Id) {
    const row = this.get('select * from resources where id = ? and deleted = 0', resourceId);
    return row ? toResource(row) : null;
  }
  resourcesIn(spaceId: Id) {
    return this.all(
      'select * from resources where space_id = ? and deleted = 0 order by created_at',
      spaceId,
    ).map(toResource);
  }
  readableResources(userId: Id, spaceId: Id) {
    return this.resourcesIn(spaceId).filter((r) => this.canReadResource(userId, r));
  }
  private insertResource(
    actorId: Id,
    input: {
      spaceId: Id;
      kind: Resource['kind'];
      title: string;
      body: string;
      visibility: Resource['visibility'];
      parentId?: Id | null;
      placement?: Placement | null;
      role?: Resource['role'];
    },
  ) {
    const resourceId = id();
    const at = now();
    this.run(
      `insert into resources (id, space_id, parent_id, kind, title, body, visibility, owner_id, placement, role, created_at, updated_at, updated_by)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      resourceId,
      input.spaceId,
      input.parentId ?? null,
      input.kind,
      input.title,
      input.body,
      input.visibility,
      actorId,
      json(input.placement ?? null),
      input.role ?? null,
      at,
      at,
      actorId,
    );
    this.run(
      'insert into revisions values (?, ?, ?, ?, ?, ?)',
      id(),
      resourceId,
      input.title,
      input.body,
      actorId,
      at,
    );
    return this.resource(resourceId)!;
  }
  createResource(
    actorId: Id,
    input: {
      spaceId: Id;
      kind: 'note' | 'doc';
      title?: string;
      body: string;
      visibility?: Resource['visibility'];
      parentId?: Id | null;
      placement?: Placement | null;
    },
  ) {
    const space = this.requireMember(actorId, input.spaceId);
    if (input.parentId) {
      const parent = this.resource(input.parentId);
      if (!parent || parent.spaceId !== space.id || parent.kind !== 'folder')
        throw new InputError('Unknown folder.');
    }
    const body = String(input.body ?? '').slice(0, 50_000);
    const title = (input.title ?? '').trim().slice(0, 120) || titleFrom(body);
    const resource = this.insertResource(actorId, {
      spaceId: space.id,
      kind: input.kind,
      title,
      body,
      visibility: space.kind === 'personal' ? 'private' : (input.visibility ?? 'space'),
      parentId: input.parentId ?? null,
      placement: input.placement ?? null,
    });
    this.changed({ type: 'resource', resource, actorId });
    return resource;
  }
  updateResource(
    actorId: Id,
    resourceId: Id,
    patch: {
      title?: string;
      body?: string;
      placement?: Placement | null;
      visibility?: Resource['visibility'];
    },
  ) {
    const resource = this.resource(resourceId);
    if (!resource || !this.canReadResource(actorId, resource))
      throw new AccessError('Not available.');
    if (resource.kind === 'folder') throw new InputError('Folders cannot be edited.');
    if (patch.visibility && patch.visibility !== resource.visibility) {
      if (resource.ownerId !== actorId) throw new AccessError('Only the owner can change sharing.');
      if (this.space(resource.spaceId)!.kind === 'personal')
        throw new InputError('Personal space items are always private.');
    }
    const body = patch.body !== undefined ? patch.body.slice(0, 50_000) : resource.body;
    // A note keeps following its first line until someone gives it a title of its own.
    const followsBody = resource.kind === 'note' && resource.title === titleFrom(resource.body);
    const next = {
      title:
        patch.title !== undefined
          ? patch.title.trim().slice(0, 120) || titleFrom(body)
          : followsBody
            ? titleFrom(body)
            : resource.title,
      body,
      placement: patch.placement !== undefined ? patch.placement : resource.placement,
      visibility: patch.visibility ?? resource.visibility,
    };
    const at = now();
    this.run(
      'update resources set title = ?, body = ?, placement = ?, visibility = ?, updated_at = ?, updated_by = ? where id = ?',
      next.title,
      next.body,
      json(next.placement),
      next.visibility,
      at,
      actorId,
      resourceId,
    );
    if (next.title !== resource.title || next.body !== resource.body) {
      const last = this.get(
        'select * from revisions where resource_id = ? order by created_at desc limit 1',
        resourceId,
      );
      if (
        last &&
        last.author_id === actorId &&
        Date.parse(at) - Date.parse(last.created_at) < 60_000
      )
        this.run(
          'update revisions set title = ?, body = ? where id = ?',
          next.title,
          next.body,
          last.id,
        );
      else
        this.run(
          'insert into revisions values (?, ?, ?, ?, ?, ?)',
          id(),
          resourceId,
          next.title,
          next.body,
          actorId,
          at,
        );
    }
    const updated = this.resource(resourceId)!;
    this.changed({ type: 'resource', resource: updated, actorId });
    return updated;
  }
  deleteResource(actorId: Id, resourceId: Id) {
    const resource = this.resource(resourceId);
    if (!resource || !this.canReadResource(actorId, resource))
      throw new AccessError('Not available.');
    if (resource.role) throw new InputError('Project structure cannot be removed.');
    this.run(
      'update resources set deleted = 1, updated_at = ?, updated_by = ? where id = ?',
      now(),
      actorId,
      resourceId,
    );
    this.changed();
  }
  revisions(actorId: Id, resourceId: Id) {
    const resource = this.resource(resourceId);
    if (!resource || !this.canReadResource(actorId, resource))
      throw new AccessError('Not available.');
    return this.all(
      'select * from revisions where resource_id = ? order by created_at desc',
      resourceId,
    ).map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      authorId: r.author_id,
      createdAt: r.created_at,
    }));
  }

  // ---------- conversations ----------

  conversation(conversationId: Id) {
    const row = this.get('select * from conversations where id = ?', conversationId);
    if (!row) return null;
    return {
      id: row.id,
      kind: row.kind,
      spaceId: row.space_id,
      title: row.title,
      resourceId: row.resource_id,
      participantIds: this.all(
        'select user_id from participants where conversation_id = ?',
        row.id,
      ).map((p) => p.user_id),
    } as Conversation;
  }
  private createConversation(
    kind: Conversation['kind'],
    spaceId: Id | null,
    title: string,
    resourceId: Id | null,
    participantIds: Id[],
  ) {
    const conversationId = id();
    this.run(
      'insert into conversations values (?, ?, ?, ?, ?, ?)',
      conversationId,
      kind,
      spaceId,
      title,
      resourceId,
      now(),
    );
    for (const userId of participantIds)
      this.run('insert into participants values (?, ?)', conversationId, userId);
    return conversationId;
  }
  createChannel(actorId: Id, spaceId: Id, rawTitle: string) {
    const space = this.requireMember(actorId, spaceId);
    if (space.kind !== 'project') throw new InputError('Channels belong to projects.');
    const title = rawTitle
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .slice(0, 40);
    if (!title) throw new InputError('A channel name is required.');
    const conversationId = this.createConversation('channel', spaceId, title, null, []);
    this.changed();
    return this.conversation(conversationId)!;
  }
  openDm(actorId: Id, otherId: Id) {
    const other = this.user(otherId);
    if (!other || other.kind !== 'human' || otherId === actorId)
      throw new InputError('Choose another person.');
    const existing = this.get(
      `select c.id from conversations c where c.kind = 'dm'
       and (select count(*) from participants p where p.conversation_id = c.id) = 2
       and exists (select 1 from participants p where p.conversation_id = c.id and p.user_id = ?)
       and exists (select 1 from participants p where p.conversation_id = c.id and p.user_id = ?)`,
      actorId,
      otherId,
    );
    if (existing) return this.conversation(existing.id)!;
    const conversationId = this.createConversation('dm', null, '', null, [actorId, otherId]);
    this.changed();
    return this.conversation(conversationId)!;
  }
  openDiscussion(actorId: Id, resourceId: Id) {
    const resource = this.resource(resourceId);
    if (!resource || !this.canReadResource(actorId, resource))
      throw new AccessError('Not available.');
    const existing = this.get(
      `select id from conversations where kind = 'discussion' and resource_id = ?`,
      resourceId,
    );
    if (existing) return this.conversation(existing.id)!;
    const conversationId = this.createConversation(
      'discussion',
      resource.spaceId,
      resource.title,
      resourceId,
      [],
    );
    this.changed();
    return this.conversation(conversationId)!;
  }
  /** Agents that may be addressed in this conversation. */
  addressableAgents(userId: Id, conversation: Conversation) {
    const agents: User[] = [];
    if (conversation.kind === 'agent-private')
      for (const p of conversation.participantIds) {
        const u = this.user(p);
        if (u?.kind === 'agent') agents.push(u);
      }
    if (
      (conversation.kind === 'channel' || conversation.kind === 'discussion') &&
      conversation.spaceId
    ) {
      const agent = this.projectAgent(conversation.spaceId);
      if (agent && this.isMember(userId, conversation.spaceId)) agents.push(agent);
    }
    return agents;
  }
  postMessage(
    actorId: Id,
    request: SendRequest,
    extra: { jobId?: Id; approvalId?: Id; runtime?: string } = {},
  ) {
    const conversation = this.conversation(request.conversationId);
    if (!conversation || !this.canReadConversation(actorId, conversation))
      throw new AccessError('Not available.');
    const text = String(request.text ?? '')
      .trim()
      .slice(0, 8000);
    if (!text) throw new InputError('Message is empty.');
    const actor = this.user(actorId)!;
    if (request.addressedTo && actor.kind === 'human') {
      if (!this.addressableAgents(actorId, conversation).some((a) => a.id === request.addressedTo))
        throw new InputError('That agent is not part of this conversation.');
    }
    const delegated = !!request.delegate && actor.kind === 'human';
    if (delegated && !request.addressedTo && conversation.kind !== 'agent-private')
      throw new InputError('Choose an agent to delegate to.');
    if (request.anchor) {
      const resource = this.resource(request.anchor.resourceId);
      if (!resource || !this.canReadResource(actorId, resource))
        throw new AccessError('Not available.');
      if (
        resource.visibility === 'private' &&
        conversation.kind !== 'agent-private' &&
        conversation.kind !== 'discussion'
      )
        throw new InputError('Share this item before discussing it with others.');
    }
    if (request.replyTo) {
      const parent = this.get('select conversation_id from messages where id = ?', request.replyTo);
      if (!parent || parent.conversation_id !== conversation.id)
        throw new InputError('Unknown thread.');
    }
    const messageId = id();
    this.run(
      'insert into messages values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      messageId,
      conversation.id,
      actorId,
      text,
      json(
        request.anchor
          ? { resourceId: request.anchor.resourceId, quote: request.anchor.quote.slice(0, 280) }
          : null,
      ),
      request.addressedTo ?? null,
      request.replyTo ?? null,
      extra.jobId ?? null,
      extra.approvalId ?? null,
      extra.runtime ?? null,
      now(),
      delegated ? 1 : 0,
    );
    const message = toMessage(this.get('select * from messages where id = ?', messageId)!);
    if (actor.kind === 'human') this.markRead(actorId, conversation.id);
    this.changed({ type: 'message', message });
    return message;
  }
  messages(conversationId: Id, limit = 300) {
    return this.all(
      'select * from (select * from messages where conversation_id = ? order by created_at desc limit ?) order by created_at',
      conversationId,
      limit,
    ).map(toMessage);
  }
  markRead(userId: Id, conversationId: Id) {
    const conversation = this.conversation(conversationId);
    if (!conversation || !this.canReadConversation(userId, conversation))
      throw new AccessError('Not available.');
    this.run(
      'insert into reads values (?, ?, ?) on conflict (user_id, conversation_id) do update set last_read_at = excluded.last_read_at',
      userId,
      conversationId,
      now(),
    );
  }

  // ---------- agent work ----------

  createJob(input: {
    agentId: Id;
    spaceId: Id;
    conversationId: Id | null;
    kind: JobKind;
    request: string;
    targetResourceId?: Id | null;
    runtime: string;
  }) {
    const jobId = id();
    const at = now();
    this.run(
      'insert into jobs values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      jobId,
      input.agentId,
      input.spaceId,
      input.conversationId,
      input.kind,
      'queued',
      input.request.slice(0, 2000),
      input.targetResourceId ?? null,
      input.runtime,
      null,
      at,
      at,
    );
    this.changed();
    return this.job(jobId)!;
  }
  job(jobId: Id) {
    const row = this.get('select * from jobs where id = ?', jobId);
    return row ? toJob(row) : null;
  }
  setJob(
    jobId: Id,
    status: JobStatus,
    patch: { error?: string | null; targetResourceId?: Id | null } = {},
  ) {
    const job = this.job(jobId)!;
    this.run(
      'update jobs set status = ?, error = ?, target_resource_id = ?, updated_at = ? where id = ?',
      status,
      patch.error !== undefined ? patch.error : job.error,
      patch.targetResourceId !== undefined ? patch.targetResourceId : job.targetResourceId,
      now(),
      jobId,
    );
    this.changed();
  }
  createAssignment(input: {
    agentId: Id;
    spaceId: Id;
    conversationId: Id;
    instruction: string;
    createdBy: Id;
  }) {
    const assignmentId = id();
    this.run(
      'insert into assignments values (?, ?, ?, ?, ?, ?, 1, null, ?)',
      assignmentId,
      input.agentId,
      input.spaceId,
      input.conversationId,
      input.instruction.slice(0, 1000),
      input.createdBy,
      now(),
    );
    this.changed();
    return toAssignment(this.get('select * from assignments where id = ?', assignmentId)!);
  }
  activeAssignments(spaceId: Id) {
    return this.all('select * from assignments where space_id = ? and active = 1', spaceId).map(
      toAssignment,
    );
  }
  assignment(assignmentId: Id) {
    const row = this.get('select * from assignments where id = ?', assignmentId);
    return row ? toAssignment(row) : null;
  }
  touchAssignment(assignmentId: Id) {
    this.run('update assignments set last_run_at = ? where id = ?', now(), assignmentId);
  }
  stopAssignment(actorId: Id, assignmentId: Id) {
    const assignment = this.assignment(assignmentId);
    const conversation = assignment && this.conversation(assignment.conversationId);
    if (!assignment || !conversation || !this.canReadConversation(actorId, conversation))
      throw new AccessError('Not available.');
    this.run('update assignments set active = 0 where id = ?', assignmentId);
    this.changed();
  }
  createApproval(job: Job, proposal: Proposal) {
    const approvalId = id();
    this.run(
      'insert into approvals values (?, ?, ?, ?, ?, ?, null, null, ?)',
      approvalId,
      job.id,
      job.spaceId,
      job.agentId,
      json(proposal),
      'pending',
      now(),
    );
    this.changed();
    return this.approval(approvalId)!;
  }
  approval(approvalId: Id) {
    const row = this.get('select * from approvals where id = ?', approvalId);
    return row ? toApproval(row) : null;
  }
  decideApproval(actorId: Id, approvalId: Id, decision: 'approved' | 'declined') {
    const approval = this.approval(approvalId);
    if (!approval) throw new AccessError('Not available.');
    const space = this.requireMember(actorId, approval.spaceId);
    if (this.user(actorId)?.kind !== 'human') throw new AccessError('People decide approvals.');
    if (approval.status !== 'pending') throw new InputError('Already decided.');
    let resultResourceId: Id | null = null;
    if (decision === 'approved' && approval.proposal.kind === 'create-doc') {
      const resource = this.insertResource(approval.agentId, {
        spaceId: space.id,
        kind: 'doc',
        title: approval.proposal.title.slice(0, 120) || 'Untitled',
        body: approval.proposal.body.slice(0, 50_000),
        visibility: space.kind === 'personal' ? 'private' : 'space',
      });
      resultResourceId = resource.id;
    }
    this.run(
      'update approvals set status = ?, decided_by = ?, result_resource_id = ? where id = ?',
      decision,
      actorId,
      resultResourceId,
      approvalId,
    );
    this.setJob(approval.jobId, decision === 'approved' ? 'done' : 'failed', {
      error: decision === 'declined' ? 'Declined' : null,
      targetResourceId: resultResourceId,
    });
    return this.approval(approvalId)!;
  }
  /** Agent-side resource write: routine context upkeep (orientation) needs no approval. */
  agentWriteOrientation(agentId: Id, spaceId: Id, body: string) {
    const orientation = this.resourcesIn(spaceId).find((r) => r.role === 'orientation');
    if (!orientation || !this.isMember(agentId, spaceId)) throw new AccessError('Not available.');
    return this.updateResource(agentId, orientation.id, { body });
  }
  usageToday() {
    const day = now().slice(0, 10);
    return Number(this.get('select tokens from usage where day = ?', day)?.tokens ?? 0);
  }
  addUsage(tokens: number) {
    this.run(
      'insert into usage values (?, ?) on conflict (day) do update set tokens = tokens + excluded.tokens',
      now().slice(0, 10),
      Math.max(0, Math.round(tokens)),
    );
  }

  // ---------- snapshot ----------

  snapshot(userId: Id, presence: Presence[], runtime: Snapshot['runtime']): Snapshot {
    const me = this.user(userId)!;
    const spaces = this.all(
      'select s.* from spaces s join members m on m.space_id = s.id where m.user_id = ? order by s.kind desc, s.created_at',
      userId,
    ).map((r) => ({ id: r.id, kind: r.kind, name: r.name, ownerId: r.owner_id }) as Space);
    const spaceIds = new Set(spaces.map((s) => s.id));
    const members = this.all('select * from members')
      .filter((m) => spaceIds.has(m.space_id))
      .map((m) => ({ spaceId: m.space_id, userId: m.user_id, role: m.role }) as Member);
    const resources = spaces.flatMap((s) => this.readableResources(userId, s.id));
    const conversations = this.all('select id from conversations order by created_at')
      .map((r) => this.conversation(r.id)!)
      .filter((c) => this.canReadConversation(userId, c));
    const conversationIds = new Set(conversations.map((c) => c.id));
    const messages = conversations.flatMap((c) => this.messages(c.id));
    const visibleUserIds = new Set<Id>([
      ...members.map((m) => m.userId),
      ...conversations.flatMap((c) => c.participantIds),
    ]);
    const users = this.all('select * from users')
      .map(toUser)
      .filter((u) => u.kind === 'human' || visibleUserIds.has(u.id));
    const jobs = this.all('select * from jobs order by created_at desc limit 500')
      .map(toJob)
      .filter(
        (j) =>
          spaceIds.has(j.spaceId) && (!j.conversationId || conversationIds.has(j.conversationId)),
      );
    const resourceIds = new Set(resources.map((r) => r.id));
    for (const job of jobs)
      if (job.targetResourceId && !resourceIds.has(job.targetResourceId))
        job.targetResourceId = null;
    const assignments = this.all('select * from assignments')
      .map(toAssignment)
      .filter((a) => conversationIds.has(a.conversationId));
    const approvals = this.all('select * from approvals order by created_at desc limit 200')
      .map(toApproval)
      .filter((a) => spaceIds.has(a.spaceId));
    const lastRead = Object.fromEntries(
      this.all('select conversation_id, last_read_at from reads where user_id = ?', userId).map(
        (r) => [r.conversation_id, r.last_read_at],
      ),
    );
    const visiblePresence = presence
      .filter((p) => p.userId !== userId && (!p.spaceId || spaceIds.has(p.spaceId)))
      .map((p) => ({
        ...p,
        spaceId: p.spaceId && spaceIds.has(p.spaceId) ? p.spaceId : null,
        resourceId: p.resourceId && resourceIds.has(p.resourceId) ? p.resourceId : null,
      }));
    return {
      version: this.version,
      me,
      users,
      spaces,
      members,
      resources,
      conversations,
      messages,
      jobs,
      assignments,
      approvals,
      presence: visiblePresence,
      lastRead,
      runtime,
    };
  }
}

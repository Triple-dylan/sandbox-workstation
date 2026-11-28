import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { scriptedRuntime } from '../server/agents/scripted.ts';
import type { AgentResult, AgentRuntime } from '../server/agents/runtime.ts';

const opened: ReturnType<typeof createApp>[] = [];
after(async () => {
  for (const app of opened) await app.close();
});

function setup(runtime: AgentRuntime = scriptedRuntime) {
  const app = createApp({ dbPath: ':memory:', staticDir: null, runtime, maintenanceDelayMs: 5 });
  opened.push(app);
  const { store, seats, engine } = app;
  const dylan = store.createHuman('Dylan');
  const maya = store.createHuman('Maya');
  const sam = store.createHuman('Sam');
  const launch = store.createProject(dylan.id, 'Launch');
  store.addMember(dylan.id, launch.id, maya.id);
  const other = store.createProject(sam.id, 'Other');
  const snap = (userId: string) =>
    store.snapshot(userId, [], { id: runtime.id, label: runtime.label });
  const general = snap(dylan.id).conversations.find(
    (c) => c.kind === 'channel' && c.spaceId === launch.id,
  )!;
  return { app, store, seats, engine, dylan, maya, sam, launch, other, snap, general };
}

test('seats: a token is shown once, only its hash is kept, and it stops when revoked or retired', () => {
  const { store, seats, dylan, maya } = setup();
  const { seat, token } = seats.create(dylan.id, { name: 'Claude Code', purpose: 'Codes' });
  assert.equal(seat.agent.role, 'outside');
  assert.equal(seat.agent.ownerId, dylan.id);
  assert.match(token.token, /^sbx_[\w-]{40,}$/);
  assert.equal(seats.agentForToken(token.token)?.id, seat.agent.id);
  const stored = store.db.prepare('select * from agent_tokens').all() as any[];
  assert.equal(stored.length, 1);
  assert.ok(!JSON.stringify(stored).includes(token.token), 'the token itself is never stored');
  assert.equal(seats.agentForToken('sbx_not-a-real-token'), null);
  assert.equal(seats.agentForToken(undefined), null);
  // Listing never shows a token again; it notes when one was last used.
  const listed = seats.mine(dylan.id)[0];
  assert.ok(!JSON.stringify(listed).includes(token.token));
  assert.ok(listed.tokens[0].lastUsedAt);
  // Only the owner makes or revokes tokens.
  assert.throws(() => seats.newToken(maya.id, seat.agent.id, 'mine'), /Not available/);
  const second = seats.newToken(dylan.id, seat.agent.id, 'Laptop');
  assert.throws(() => seats.revokeToken(maya.id, seat.agent.id, second.id), /Not available/);
  seats.revokeToken(dylan.id, seat.agent.id, second.id);
  assert.equal(seats.agentForToken(second.token), null);
  assert.equal(seats.agentForToken(token.token)?.id, seat.agent.id);
  // Retiring stops every token.
  assert.throws(() => seats.retire(maya.id, seat.agent.id));
  seats.retire(dylan.id, seat.agent.id);
  assert.equal(seats.agentForToken(token.token), null);
  assert.throws(() => seats.newToken(dylan.id, seat.agent.id, 'again'), /retired/);
});

test('seats: a seat reads what its workspaces share, like a member, and nothing private', () => {
  const { store, seats, dylan, maya, sam, launch, other, snap } = setup();
  const { seat } = seats.create(dylan.id, { name: 'Codex', spaceId: launch.id });
  const codex = seat.agent.id;
  assert.deepEqual(seats.seat(codex).spaceIds, [launch.id]);
  const shared = store.createResource(maya.id, { spaceId: launch.id, kind: 'doc', body: 'Plan' });
  const mayaDraft = store.createResource(maya.id, {
    spaceId: launch.id,
    kind: 'doc',
    body: 'Draft',
    visibility: 'private',
  });
  const dylanDraft = store.createResource(dylan.id, {
    spaceId: launch.id,
    kind: 'doc',
    body: 'Mine',
    visibility: 'private',
  });
  const personal = snap(dylan.id).spaces.find((s) => s.kind === 'personal')!;
  const diary = store.createResource(dylan.id, { spaceId: personal.id, kind: 'doc', body: 'x' });
  const elsewhere = store.createResource(sam.id, { spaceId: other.id, kind: 'doc', body: 'y' });
  assert.ok(store.canReadResource(codex, shared));
  // Unlike a personal agent, a seat does not act with its owner's access.
  assert.equal(store.canReadResource(codex, dylanDraft), false);
  assert.equal(store.canReadResource(codex, mayaDraft), false);
  assert.equal(store.canReadResource(codex, diary), false);
  assert.equal(store.canReadResource(codex, elsewhere), false);
  // A private page can be opened to it by name, as to a person.
  store.setGrant(dylan.id, dylanDraft.id, codex, true);
  assert.ok(store.canReadResource(codex, dylanDraft));
  // Teammates see it as a member of the workspace.
  assert.ok(snap(maya.id).users.some((u) => u.id === codex));
  assert.ok(snap(maya.id).members.some((m) => m.userId === codex && m.spaceId === launch.id));
  assert.ok(!snap(sam.id).users.some((u) => u.id === codex));
});

test('seats: only the owner brings a seat into spaces they are in; the owner or space owner takes it out', () => {
  const { store, seats, dylan, maya, sam, launch, other, snap } = setup();
  const personal = snap(dylan.id).spaces.find((s) => s.kind === 'personal')!;
  assert.throws(
    () => seats.create(dylan.id, { name: 'X', spaceId: other.id }),
    /Not a member/,
    'not into a workspace the owner is not in',
  );
  assert.throws(() => seats.create(dylan.id, { name: 'X', spaceId: personal.id }), /shared/);
  assert.throws(() => seats.create(dylan.id, { name: '  ' }), /name/);
  const mine = seats.create(maya.id, { name: 'Hermes' }).seat.agent.id;
  assert.deepEqual(seats.seat(mine).spaceIds, []);
  assert.throws(() => seats.join(dylan.id, mine, launch.id), /Not available/);
  seats.join(maya.id, mine, launch.id);
  assert.ok(store.isMember(mine, launch.id));
  assert.throws(() => seats.leave(sam.id, mine, launch.id), /Only its owner/);
  // The workspace's owner can take someone else's seat out.
  seats.leave(dylan.id, mine, launch.id);
  assert.equal(store.isMember(mine, launch.id), false);
  seats.join(maya.id, mine, launch.id);
  seats.leave(maya.id, mine, launch.id);
  assert.equal(store.isMember(mine, launch.id), false);
  // Its owner edits its name and purpose; nobody else does.
  assert.equal(store.updateAgent(maya.id, mine, { name: 'Hermes 2' }).name, 'Hermes 2');
  assert.throws(() => store.updateAgent(dylan.id, mine, { name: 'Taken' }));
});

test('seats: a message to a seat waits for it; Sandbox never answers in its place', async () => {
  const ranAs: string[] = [];
  const counting: AgentRuntime = {
    ...scriptedRuntime,
    async run(task): Promise<AgentResult> {
      ranAs.push(task.agent.name);
      return scriptedRuntime.run(task);
    },
  };
  const { store, seats, engine, dylan, maya, launch, general, snap } = setup(counting);
  const grok = seats.create(dylan.id, { name: 'Grok', spaceId: launch.id }).seat.agent;
  assert.ok(store.addressableAgents(maya.id, general).some((a) => a.id === grok.id));
  store.postMessage(maya.id, {
    conversationId: general.id,
    text: '@Grok what changed today?',
    addressedTo: grok.id,
  });
  await engine.idle();
  const after = snap(maya.id).messages.filter((m) => m.conversationId === general.id);
  assert.equal(after.at(-1)?.addressedTo, grok.id);
  assert.equal(after.at(-1)?.authorId, maya.id, 'nothing answered for the seat');
  assert.ok(!ranAs.includes('Grok'), 'the model never ran as the seat');
  assert.equal(
    snap(maya.id).jobs.filter((j) => j.agentId === grok.id).length,
    0,
    'no job runs as the seat',
  );
  // The seat writes as itself, where it is a member.
  const reply = store.postMessage(grok.id, { conversationId: general.id, text: 'Two merges.' });
  assert.equal(reply.authorId, grok.id);
});

test('http: seat routes need the owner signed in and the app header', async () => {
  const app = createApp({ dbPath: ':memory:', staticDir: null, runtime: scriptedRuntime });
  opened.push(app);
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const h = { 'content-type': 'application/json', 'x-workstation': '1' };
  assert.equal((await fetch(`${base}/api/seats`)).status, 401);
  const join = await fetch(`${base}/api/join`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'Dylan' }),
  });
  const cookie = join.headers.get('set-cookie')!.split(';')[0];
  const forged = await fetch(`${base}/api/seats`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Codex' }),
  });
  assert.equal(forged.status, 403);
  const made = await (
    await fetch(`${base}/api/seats`, {
      method: 'POST',
      headers: { ...h, cookie },
      body: JSON.stringify({ name: 'Codex' }),
    })
  ).json();
  assert.match(made.token.token, /^sbx_/);
  const listed = await (await fetch(`${base}/api/seats`, { headers: { cookie } })).json();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].agent.name, 'Codex');
  const extra = await (
    await fetch(`${base}/api/seats/${made.seat.agent.id}/tokens`, {
      method: 'POST',
      headers: { ...h, cookie },
      body: JSON.stringify({ label: 'Laptop' }),
    })
  ).json();
  assert.equal(extra.label, 'Laptop');
  // The new-agent form gives a seat its look, as it does any agent.
  const looked = await fetch(`${base}/api/agents/${made.seat.agent.id}`, {
    method: 'PATCH',
    headers: { ...h, cookie },
    body: JSON.stringify({ form: 'weaving' }),
  });
  assert.equal(looked.status, 200);
  assert.equal(app.store.user(made.seat.agent.id)?.character?.form, 'weaving');
  const revoked = await fetch(`${base}/api/seats/${made.seat.agent.id}/tokens/${extra.id}`, {
    method: 'DELETE',
    headers: { ...h, cookie },
  });
  assert.equal(revoked.status, 200);
  assert.equal(app.seats.agentForToken(extra.token), null);
  await app.close();
});

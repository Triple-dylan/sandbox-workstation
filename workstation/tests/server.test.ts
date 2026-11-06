import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.ts';
import { scriptedRuntime } from '../server/agents/scripted.ts';
import { createOpenAIRuntime } from '../server/agents/openai.ts';
import type { AgentRuntime } from '../server/agents/runtime.ts';

const PLACEHOLDER_KEY = 'placeholder-key-for-tests';

function setup(runtime: AgentRuntime = scriptedRuntime) {
  const app = createApp({ dbPath: ':memory:', staticDir: null, runtime, maintenanceDelayMs: 5 });
  const { store, engine } = app;
  const dylan = store.createHuman('Dylan');
  const maya = store.createHuman('Maya');
  const sam = store.createHuman('Sam');
  const project = store.createProject(dylan.id, 'Launch');
  store.addMember(dylan.id, project.id, maya.id);
  const snap = (userId: string) =>
    store.snapshot(userId, [], { id: runtime.id, label: runtime.label });
  const general = snap(dylan.id).conversations.find(
    (c) => c.kind === 'channel' && c.spaceId === project.id,
  )!;
  const agent = store.projectAgent(project.id)!;
  return { app, store, engine, dylan, maya, sam, project, general, agent, snap };
}

test('privacy: private notes, project membership and DMs are only visible to the right people', async () => {
  const { app, store, dylan, maya, sam, project, snap } = setup();
  const personal = snap(dylan.id).spaces.find((s) => s.kind === 'personal')!;
  const diary = store.createResource(dylan.id, {
    spaceId: personal.id,
    kind: 'note',
    body: 'pricing idea',
  });
  assert.equal(diary.visibility, 'private');
  const shared = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'note',
    body: 'Launch checklist',
  });
  const privateInProject = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'note',
    body: 'draft only for me',
    visibility: 'private',
  });
  const mayaIds = snap(maya.id).resources.map((r) => r.id);
  assert.ok(mayaIds.includes(shared.id));
  assert.ok(!mayaIds.includes(diary.id));
  assert.ok(!mayaIds.includes(privateInProject.id));
  assert.equal(
    snap(sam.id).spaces.some((s) => s.id === project.id),
    false,
  );
  assert.throws(() => store.updateResource(maya.id, diary.id, { body: 'x' }), /Not available/);
  assert.throws(
    () => store.updateResource(maya.id, privateInProject.id, { visibility: 'space' }),
    /Not available/,
  );
  store.updateResource(dylan.id, privateInProject.id, { visibility: 'space' });
  assert.ok(
    snap(maya.id).resources.some((r) => r.id === privateInProject.id),
    'sharing keeps the original identity',
  );

  const dm = store.openDm(dylan.id, maya.id);
  store.postMessage(dylan.id, { conversationId: dm.id, text: 'Lunch?' });
  assert.equal(store.openDm(maya.id, dylan.id).id, dm.id);
  assert.ok(snap(maya.id).messages.some((m) => m.text === 'Lunch?'));
  assert.ok(!snap(sam.id).messages.some((m) => m.text === 'Lunch?'));
  assert.throws(
    () => store.postMessage(sam.id, { conversationId: dm.id, text: 'hi' }),
    /Not available/,
  );
  await app.close();
});

test('situation 1: a workspace instruction runs a job and proposes shared work for approval', async () => {
  const { app, store, engine, dylan, maya, general, agent, snap } = setup();
  const ask = store.postMessage(dylan.id, {
    conversationId: general.id,
    text: 'Create a doc called Launch brief',
    addressedTo: agent.id,
  });
  await engine.idle();
  const view = snap(maya.id);
  const reply = view.messages.find((m) => m.authorId === agent.id && m.replyTo === ask.id)!;
  assert.ok(reply, 'agent replies in the thread of the instruction');
  assert.equal(reply.runtime, 'scripted');
  const approval = view.approvals.find((a) => a.id === reply.approvalId)!;
  assert.equal(approval.status, 'pending');
  assert.equal(view.jobs.find((j) => j.id === reply.jobId)!.status, 'awaiting_approval');
  assert.ok(
    !view.resources.some((r) => r.title === 'Launch brief'),
    'nothing changes before approval',
  );
  store.decideApproval(maya.id, approval.id, 'approved');
  const doc = snap(dylan.id).resources.find((r) => r.title === 'Launch brief')!;
  assert.equal(doc.visibility, 'space');
  assert.equal(doc.ownerId, agent.id);
  assert.throws(() => store.decideApproval(dylan.id, approval.id, 'declined'), /Already decided/);
  await app.close();
});

test('situation 2: a private ask is answered privately using what the asker can see', async () => {
  const { app, store, engine, dylan, maya, snap } = setup();
  const personal = snap(dylan.id).spaces.find((s) => s.kind === 'personal')!;
  store.createResource(dylan.id, {
    spaceId: personal.id,
    kind: 'note',
    body: 'Pricing experiment: tiered plans',
  });
  const mine = snap(dylan.id).conversations.find((c) => c.kind === 'agent-private')!;
  store.postMessage(dylan.id, { conversationId: mine.id, text: 'find pricing' });
  await engine.idle();
  const reply = snap(dylan.id)
    .messages.filter((m) => m.conversationId === mine.id)
    .at(-1)!;
  assert.match(reply.text, /Pricing experiment/);
  assert.ok(!snap(maya.id).conversations.some((c) => c.id === mine.id));
  assert.ok(!snap(maya.id).messages.some((m) => m.id === reply.id));
  await app.close();
});

test('situation 4: discussing selected work anchors to the resource and respects its audience', async () => {
  const { app, store, dylan, maya, sam, project, general, snap } = setup();
  const note = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'note',
    body: 'Ship on Friday',
  });
  const discussion = store.openDiscussion(dylan.id, note.id);
  assert.equal(store.openDiscussion(maya.id, note.id).id, discussion.id);
  store.postMessage(maya.id, {
    conversationId: discussion.id,
    text: 'Friday is tight',
    anchor: { resourceId: note.id, quote: 'Ship on Friday' },
  });
  const message = snap(dylan.id).messages.find((m) => m.text === 'Friday is tight')!;
  assert.deepEqual(message.anchor, { resourceId: note.id, quote: 'Ship on Friday' });
  assert.ok(!snap(sam.id).conversations.some((c) => c.id === discussion.id));
  const mine = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'note',
    body: 'mine',
    visibility: 'private',
  });
  assert.throws(
    () =>
      store.postMessage(dylan.id, {
        conversationId: general.id,
        text: 'see',
        anchor: { resourceId: mine.id, quote: 'mine' },
      }),
    /Share this item/,
  );
  await app.close();
});

test('situation 5: delegating ongoing work creates an assignment that keeps context current', async () => {
  const { app, store, engine, dylan, maya, general, agent, snap } = setup();
  store.postMessage(dylan.id, {
    conversationId: general.id,
    text: 'Keep the orientation up to date',
    addressedTo: agent.id,
    delegate: true,
  });
  await engine.idle();
  const view = snap(maya.id);
  const assignment = view.assignments.find((a) => a.agentId === agent.id)!;
  assert.ok(assignment.active);
  assert.ok(view.messages.some((m) => m.authorId === agent.id && /On it/.test(m.text)));
  store.postMessage(maya.id, { conversationId: general.id, text: 'We decided to launch in March' });
  await engine.idle();
  const orientation = snap(dylan.id).resources.find((r) => r.role === 'orientation')!;
  assert.match(orientation.body, /We decided to launch in March — Maya/);
  assert.equal(orientation.updatedBy, agent.id);
  store.stopAssignment(dylan.id, assignment.id);
  assert.equal(snap(dylan.id).assignments[0].active, false);
  await app.close();
});

test('unsolicited replies: the project agent may chip in on a relevant question, throttled', async () => {
  const { app, store, engine, dylan, maya, project, general, agent, snap } = setup();
  store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'doc',
    title: 'Pricing research',
    body: 'Tiers',
  });
  store.postMessage(maya.id, { conversationId: general.id, text: 'Where did we land on pricing?' });
  await engine.idle();
  const proactive = snap(dylan.id).messages.filter((m) => m.authorId === agent.id);
  assert.equal(proactive.length, 1);
  assert.match(proactive[0].text, /Pricing research/);
  store.postMessage(maya.id, { conversationId: general.id, text: 'And the pricing deadline?' });
  await engine.idle();
  assert.equal(
    snap(dylan.id).messages.filter((m) => m.authorId === agent.id).length,
    1,
    'cooldown holds',
  );
  await app.close();
});

test('openai runtime: parses replies, records usage and falls back to scripted past the daily budget', async () => {
  const calls: any[] = [];
  const headers: string[] = [];
  let usage = 0;
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)));
    headers.push(String((init.headers as Record<string, string>).authorization));
    return new Response(
      JSON.stringify({
        usage: { total_tokens: 120 },
        choices: [{ message: { content: JSON.stringify({ reply: 'Real model answer' }) } }],
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  const runtime = createOpenAIRuntime({
    apiKey: PLACEHOLDER_KEY,
    model: 'test-model',
    dailyTokenLimit: 150,
    usageToday: () => usage,
    addUsage: (t) => (usage += t),
    fetch: fakeFetch,
  });
  const { app, store, engine, dylan, snap } = setup(runtime);
  const mine = snap(dylan.id).conversations.find((c) => c.kind === 'agent-private')!;
  store.postMessage(dylan.id, { conversationId: mine.id, text: 'hello' });
  await engine.idle();
  let last = snap(dylan.id)
    .messages.filter((m) => m.conversationId === mine.id)
    .at(-1)!;
  assert.equal(last.text, 'Real model answer');
  assert.equal(last.runtime, 'openai');
  assert.equal(calls[0].model, 'test-model');
  assert.equal(headers[0], `Bearer ${PLACEHOLDER_KEY}`);
  assert.ok(
    !JSON.stringify(calls[0]).includes(PLACEHOLDER_KEY),
    'the key only travels in the auth header',
  );
  usage = 1000;
  store.postMessage(dylan.id, { conversationId: mine.id, text: 'summarize' });
  await engine.idle();
  last = snap(dylan.id)
    .messages.filter((m) => m.conversationId === mine.id)
    .at(-1)!;
  assert.equal(last.runtime, 'scripted');
  assert.match(last.text, /Daily token budget of 150 reached/);
  assert.equal(calls.length, 1);
  await app.close();
});

test('http: sessions, CSRF header, auth and static path traversal', async () => {
  const app = createApp({
    dbPath: ':memory:',
    staticDir: fileURLToPath(new URL('../shared/', import.meta.url)),
    runtime: scriptedRuntime,
  });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const h = { 'content-type': 'application/json', 'x-workstation': '1' };
  assert.equal((await fetch(`${base}/api/snapshot`)).status, 401);
  const forged = await fetch(`${base}/api/join`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Eve' }),
  });
  assert.equal(forged.status, 403, 'state-changing requests need the app header');
  const join = await fetch(`${base}/api/join`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'Dylan' }),
  });
  const setCookie = join.headers.get('set-cookie')!;
  assert.match(setCookie, /HttpOnly/);
  const cookie = setCookie.split(';')[0];
  const snapshot = await (await fetch(`${base}/api/snapshot`, { headers: { cookie } })).json();
  assert.equal(snapshot.me.name, 'Dylan');
  assert.equal(snapshot.runtime.id, 'scripted');
  const traversal = await fetch(`${base}/..%2f..%2fpackage.json`);
  assert.ok(!(await traversal.text()).includes('devDependencies'));
  await app.close();
});

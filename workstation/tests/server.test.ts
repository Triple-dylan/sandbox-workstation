import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createApp, type GoogleAccount } from '../server/app.ts';
import { scriptedRuntime } from '../server/agents/scripted.ts';
import { createOpenAIRuntime } from '../server/agents/openai.ts';
import type { AgentResult, AgentRuntime, AgentTask } from '../server/agents/runtime.ts';

const PLACEHOLDER_KEY = 'placeholder-key-for-tests';

const opened: ReturnType<typeof createApp>[] = [];
after(async () => {
  for (const app of opened) await app.close();
});

function setup(runtime: AgentRuntime = scriptedRuntime, env: NodeJS.ProcessEnv = {}) {
  const app = createApp({
    dbPath: ':memory:',
    staticDir: null,
    runtime,
    maintenanceDelayMs: 5,
    env,
  });
  opened.push(app);
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
    kind: 'doc',
    body: 'pricing idea',
  });
  assert.equal(diary.visibility, 'private');
  const shared = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'doc',
    body: 'Launch checklist',
  });
  const privateInProject = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'doc',
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
    kind: 'doc',
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
    kind: 'doc',
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
    kind: 'doc',
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
  assert.equal(calls[0].model, 'gpt-6-luna', 'every agent uses gpt-6-luna');
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
  opened.push(app);
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

test('roster: project agents are shared, personal agents stay with their owner, and both can be edited', async () => {
  const { store, dylan, maya, sam, project, general, snap } = setup();
  const scout = store.newAgent(dylan.id, {
    name: 'Scout',
    purpose: 'Compare vendors',
    spaceId: project.id,
  });
  const mine = store.newAgent(dylan.id, { name: 'Notebook', purpose: 'My own notes' });
  assert.equal(scout.role, 'project');
  assert.equal(mine.role, 'personal');
  // A teammate sees the shared agent and may address it; the private one is invisible to them.
  const mayaView = snap(maya.id);
  assert.ok(mayaView.users.some((u) => u.id === scout.id));
  assert.ok(!mayaView.users.some((u) => u.id === mine.id));
  assert.ok(store.addressableAgents(maya.id, general).some((a) => a.id === scout.id));
  assert.ok(
    snap(dylan.id).conversations.some(
      (c) => c.kind === 'agent-private' && c.participantIds.includes(mine.id),
    ),
  );
  // Any member edits a project agent; only the owner edits a personal one; outsiders edit neither.
  assert.equal(store.updateAgent(maya.id, scout.id, { name: 'Scout 2', hue: 400 }).name, 'Scout 2');
  assert.equal(store.user(scout.id)!.character!.hue, 40);
  assert.throws(() => store.updateAgent(maya.id, mine.id, { name: 'Taken' }));
  assert.throws(() => store.updateAgent(sam.id, scout.id, { name: 'Taken' }));
  assert.equal(
    store.updateAgent(dylan.id, mine.id, { instructions: 'Be brief.' }).instructions,
    'Be brief.',
  );
});

test('an agent asked for in conversation joins the roster only after a person approves it', async () => {
  const { store, engine, dylan, project, general, agent, snap } = setup();
  store.postMessage(dylan.id, {
    conversationId: general.id,
    text: 'create an agent called Courier to track deliveries',
    addressedTo: agent.id,
  });
  await engine.idle();
  const approval = snap(dylan.id).approvals.find((a) => a.proposal.kind === 'create-agent')!;
  assert.equal(approval.proposal.title, 'Courier');
  assert.equal(store.projectAgents(project.id).length, 1);
  store.decideApproval(dylan.id, approval.id, 'approved');
  const added = store.projectAgents(project.id).find((a) => a.name === 'Courier')!;
  assert.equal(added.purpose, 'track deliveries');
});

test('goals: lightweight steps that only members can see or change', async () => {
  const { store, dylan, maya, sam, project, agent, snap } = setup();
  const goal = store.createGoal(dylan.id, { spaceId: project.id, title: 'Choose packaging' });
  const updated = store.updateGoal(maya.id, goal.id, {
    ownerId: maya.id,
    agentId: agent.id,
    due: '2027-05-30',
    done: true,
  });
  assert.deepEqual(
    [updated.ownerId, updated.agentId, updated.due, updated.done],
    [maya.id, agent.id, '2027-05-30', true],
  );
  // People outside the project cannot be made owners, and cannot touch or see the goal.
  assert.equal(store.updateGoal(dylan.id, goal.id, { ownerId: sam.id }).ownerId, null);
  assert.throws(() => store.updateGoal(sam.id, goal.id, { done: false }));
  assert.equal(snap(sam.id).goals.length, 0);
  assert.equal(snap(maya.id).goals.length, 1);
});

test('pins point at a message; a pin of a private conversation never becomes shared', async () => {
  const { store, dylan, maya, sam, project, general, snap } = setup();
  const canvas = store.createResource(dylan.id, { spaceId: project.id, kind: 'canvas', body: '' });
  const said = store.postMessage(maya.id, {
    conversationId: general.id,
    text: 'Deposit due Friday',
  });
  const pin = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'pin',
    parentId: canvas.id,
    body: JSON.stringify({ messageId: said.id }),
  });
  assert.equal(pin.visibility, 'space');
  assert.equal(JSON.parse(pin.body).quote, 'Deposit due Friday');
  // A direct message pinned onto a shared canvas stays visible to its pinner only.
  const dm = store.openDm(maya.id, dylan.id);
  const whisper = store.postMessage(maya.id, { conversationId: dm.id, text: 'between us' });
  const privatePin = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'pin',
    parentId: canvas.id,
    body: JSON.stringify({ messageId: whisper.id }),
    visibility: 'space',
  });
  assert.equal(privatePin.visibility, 'private');
  assert.ok(!snap(maya.id).resources.some((r) => r.id === privatePin.id));
  assert.ok(snap(maya.id).resources.some((r) => r.id === pin.id));
  // Someone who cannot read the conversation cannot pin from it, and it cannot feed a shared plan.
  const samSpace = snap(sam.id).spaces[0].id;
  const samCanvas = store.createResource(sam.id, { spaceId: samSpace, kind: 'canvas', body: '' });
  assert.throws(() =>
    store.createResource(sam.id, {
      spaceId: samSpace,
      kind: 'pin',
      parentId: samCanvas.id,
      body: JSON.stringify({ messageId: whisper.id }),
    }),
  );
  const step = store.createGoal(dylan.id, {
    spaceId: project.id,
    title: 'between us',
    sourceMessageId: whisper.id,
  });
  assert.equal(step.sourceMessageId, null);
});

test('pages: documents, sheets, decks and canvases live in folders; a canvas has one plan', async () => {
  const { store, dylan, maya, project } = setup();
  const folder = store.createFolder(dylan.id, { spaceId: project.id, title: 'Vendors' });
  const doc = store.createResource(maya.id, {
    spaceId: project.id,
    kind: 'doc',
    title: 'Shortlist',
    body: '# Shortlist',
    parentId: folder.id,
  });
  assert.equal(doc.parentId, folder.id);
  const sheet = store.createResource(dylan.id, { spaceId: project.id, kind: 'sheet', body: '' });
  assert.equal(JSON.parse(sheet.body).rows.length, 8);
  const deck = store.createResource(dylan.id, { spaceId: project.id, kind: 'deck', body: '' });
  assert.equal(JSON.parse(deck.body).slides.length, 1);
  const canvas = store.createResource(dylan.id, { spaceId: project.id, kind: 'canvas', body: '' });
  // Pages move between folders; canvas pieces need a canvas.
  assert.equal(
    store.updateResource(dylan.id, sheet.id, { parentId: folder.id }).parentId,
    folder.id,
  );
  assert.throws(
    () => store.createResource(dylan.id, { spaceId: project.id, kind: 'sticky', body: 'x' }),
    /canvas/,
  );
  assert.throws(
    () =>
      store.createResource(dylan.id, {
        spaceId: project.id,
        kind: 'sticky',
        body: 'x',
        parentId: folder.id,
      }),
    /canvas/,
  );
  const first = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'plan',
    body: '',
    parentId: canvas.id,
  });
  const second = store.createResource(maya.id, {
    spaceId: project.id,
    kind: 'plan',
    body: '',
    parentId: canvas.id,
    placement: { x: 24, y: 24, width: 384, height: 312 },
  });
  assert.equal(second.id, first.id);
  assert.equal(second.placement?.x, 24);
  // Renaming a folder is allowed; nothing else about it is.
  assert.equal(
    store.updateResource(dylan.id, folder.id, { title: 'Suppliers' }).title,
    'Suppliers',
  );
});

test('a canvas is arranged together, and its pieces follow who can open it', async () => {
  const { store, dylan, maya, project, snap } = setup();
  const canvas = store.createResource(dylan.id, { spaceId: project.id, kind: 'canvas', body: '' });
  const piece = (kind: 'sticky' | 'shape' | 'frame' | 'note', body: string, style?: string) =>
    store.createResource(dylan.id, {
      spaceId: project.id,
      kind,
      body,
      style,
      parentId: canvas.id,
      placement: { x: 96, y: 96, width: 168, height: 96 },
    });
  const sticky = piece('sticky', 'Ask Jon', 'pink');
  const shape = piece('shape', 'Decide', 'diamond');
  assert.equal(sticky.style, 'pink');
  assert.equal(shape.style, 'diamond');
  assert.equal(piece('sticky', 'x', 'nonsense').style, 'yellow');
  const seen = (userId: string, id: string) => snap(userId).resources.find((r) => r.id === id);
  // Moving a piece moves it for everyone.
  store.updateResource(maya.id, sticky.id, {
    placement: { x: 480, y: 240, width: 168, height: 96 },
  });
  assert.equal(seen(dylan.id, sticky.id)!.placement?.x, 480);
  // Arrows join two pieces on the same canvas, and go when either end goes.
  const arrow = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'arrow',
    parentId: canvas.id,
    body: JSON.stringify({ from: sticky.id, to: shape.id }),
  });
  const other = store.createResource(dylan.id, { spaceId: project.id, kind: 'canvas', body: '' });
  assert.throws(() =>
    store.createResource(dylan.id, {
      spaceId: project.id,
      kind: 'arrow',
      parentId: other.id,
      body: JSON.stringify({ from: sticky.id, to: shape.id }),
    }),
  );
  store.deleteResource(dylan.id, shape.id);
  assert.equal(seen(dylan.id, arrow.id), undefined);
  // A page placed on the canvas as a live card: a private page gives a private card.
  const mine = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'doc',
    title: 'Draft',
    body: 'secret',
    visibility: 'private',
  });
  const card = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'embed',
    parentId: canvas.id,
    body: JSON.stringify({ resourceId: mine.id }),
  });
  assert.equal(card.visibility, 'private');
  assert.equal(seen(maya.id, card.id), undefined);
  // Making the canvas private hides every piece on it.
  store.updateResource(dylan.id, canvas.id, { visibility: 'private' });
  assert.equal(seen(maya.id, sticky.id), undefined);
  assert.ok(seen(dylan.id, sticky.id));
  assert.throws(() => store.updateResource(maya.id, sticky.id, { body: 'x' }), /Not available/);
});

test('a private page can be opened to one person or agent without sharing it with everyone', async () => {
  const { store, dylan, maya, sam, project, agent, snap } = setup();
  const page = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'doc',
    title: 'Offer',
    body: 'numbers',
    visibility: 'private',
  });
  const can = (userId: string) => snap(userId).resources.some((r) => r.id === page.id);
  assert.equal(can(maya.id), false);
  assert.throws(() => store.setGrant(maya.id, page.id, maya.id, true), /owner/);
  assert.throws(() => store.setGrant(dylan.id, page.id, sam.id, true), /not in this space/);
  store.setGrant(dylan.id, page.id, maya.id, true);
  assert.equal(can(maya.id), true);
  assert.deepEqual(snap(dylan.id).resources.find((r) => r.id === page.id)!.grants, [maya.id]);
  assert.equal(store.canReadResource(agent.id, page), false);
  store.setGrant(dylan.id, page.id, agent.id, true);
  assert.equal(store.canReadResource(agent.id, page), true);
  store.setGrant(dylan.id, page.id, maya.id, false);
  assert.equal(can(maya.id), false);
});

test('channels: pinned pages, reactions, live pieces of a page, and sheet cells', async () => {
  const { store, dylan, maya, sam, project, general, snap } = setup();
  const sheet = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'sheet',
    title: 'Budget',
    body: JSON.stringify({
      rows: [
        ['Item', 'Cost'],
        ['Stall', '180'],
      ],
    }),
  });
  store.setPin(maya.id, general.id, sheet.id, true);
  assert.deepEqual(snap(dylan.id).conversations.find((c) => c.id === general.id)!.pinnedIds, [
    sheet.id,
  ]);
  const secret = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'doc',
    body: 'x',
    visibility: 'private',
  });
  assert.throws(() => store.setPin(dylan.id, general.id, secret.id, true), /shared/);
  assert.throws(() => store.setPin(sam.id, general.id, sheet.id, true), /Not available/);
  // Part of a page inside a message; never a private page in a shared conversation.
  const said = store.postMessage(dylan.id, {
    conversationId: general.id,
    text: 'Rows here',
    embed: { resourceId: sheet.id, from: 0, to: 1 },
  });
  assert.deepEqual(said.embed, { resourceId: sheet.id, from: 0, to: 1 });
  assert.throws(
    () =>
      store.postMessage(dylan.id, {
        conversationId: general.id,
        text: 'x',
        embed: { resourceId: secret.id },
      }),
    /Share this page/,
  );
  store.toggleReaction(maya.id, said.id, '👍');
  store.toggleReaction(dylan.id, said.id, '👍');
  const reacted = () => snap(dylan.id).messages.find((m) => m.id === said.id)!.reactions;
  assert.deepEqual(reacted(), [{ emoji: '👍', userIds: [maya.id, dylan.id] }]);
  store.toggleReaction(maya.id, said.id, '👍');
  assert.deepEqual(reacted(), [{ emoji: '👍', userIds: [dylan.id] }]);
  assert.throws(() => store.toggleReaction(sam.id, said.id, '👍'), /Not available/);
  // Two people changing different cells keep both changes; the sheet grows to fit.
  store.setCell(dylan.id, sheet.id, 1, 1, '200');
  store.setCell(maya.id, sheet.id, 2, 0, 'Clay');
  assert.deepEqual(JSON.parse(store.resource(sheet.id)!.body).rows, [
    ['Item', 'Cost'],
    ['Stall', '200'],
    ['Clay', ''],
  ]);
  assert.throws(() => store.setCell(sam.id, sheet.id, 0, 0, 'x'), /Not available/);
  // Removing the page takes its pin down.
  store.deleteResource(dylan.id, sheet.id);
  assert.deepEqual(snap(dylan.id).conversations.find((c) => c.id === general.id)!.pinnedIds, []);
});

test('comments on a page: an agent suggests an edit to the highlighted text, a person accepts it', async () => {
  const { store, engine, dylan, maya, project, agent, snap } = setup();
  const page = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'doc',
    title: 'Shortlist',
    body: '# Shortlist\n\nPaperie costs $58 for 50 boxes.',
  });
  const feed = store.openDiscussion(dylan.id, page.id);
  const comment = store.postMessage(dylan.id, {
    conversationId: feed.id,
    text: 'replace this with: Paperie costs $61 for 50 boxes.',
    addressedTo: agent.id,
    anchor: { resourceId: page.id, quote: 'Paperie costs $58 for 50 boxes.' },
  });
  await engine.idle();
  const reply = snap(maya.id).messages.find((m) => m.replyTo === comment.id)!;
  assert.ok(reply.approvalId);
  assert.deepEqual(reply.sourceIds, [page.id]);
  const approval = snap(maya.id).approvals.find((a) => a.id === reply.approvalId)!;
  assert.equal(approval.proposal.kind, 'edit-doc');
  assert.equal(approval.proposal.resourceId, page.id);
  store.decideApproval(maya.id, approval.id, 'approved');
  assert.match(store.resource(page.id)!.body, /\$61 for 50 boxes/);
  assert.equal(store.resource(page.id)!.updatedBy, agent.id);
  store.resolveMessage(maya.id, comment.id, true);
  assert.equal(snap(dylan.id).messages.find((m) => m.id === comment.id)!.resolved, true);
  // If the text has moved on, the suggestion says so instead of guessing.
  const again = store.postMessage(dylan.id, {
    conversationId: feed.id,
    text: 'replace this with: $70',
    addressedTo: agent.id,
    anchor: { resourceId: page.id, quote: '$61 for 50 boxes' },
  });
  await engine.idle();
  store.updateResource(dylan.id, page.id, { body: '# Shortlist\n\nAll change.' });
  const second = snap(dylan.id).messages.find((m) => m.replyTo === again.id)!;
  assert.throws(() => store.decideApproval(dylan.id, second.approvalId!, 'approved'), /changed/);
});

test('your own agent: answers from what you are looking at, hands work on, and keeps it private', async () => {
  const seenTasks: any[] = [];
  const runtime: AgentRuntime = {
    id: 'probe',
    label: 'Probe',
    async run(task) {
      seenTasks.push(task);
      if (task.agent.role === 'personal' && /vendors/.test(task.request))
        return {
          reply: 'I handed that to the project agent.',
          handoff: { to: task.context.colleagues[0].name, request: 'Compare the vendors' },
        };
      if (task.conversation.kind === 'handoff')
        return {
          reply: 'Paperie is cheapest.',
          sources: ['Shortlist'],
          proposal: { kind: 'create-doc', title: 'Vendor comparison', body: '# Comparison' },
        };
      if (task.kind === 'maintenance') return {};
      return { reply: 'ok', sources: task.context.focus.map((f) => f.title) };
    },
  };
  const { store, engine, dylan, maya, project, general, agent, snap } = setup(runtime);
  const page = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'doc',
    title: 'Shortlist',
    body: 'Paperie $58. Boxwell $74.',
  });
  store.postMessage(maya.id, { conversationId: general.id, text: 'We decided on Paperie' });
  const mine = snap(dylan.id).conversations.find((c) => c.kind === 'agent-private')!;
  store.postMessage(dylan.id, {
    conversationId: mine.id,
    text: 'what is this page',
    context: { resourceIds: [page.id], spaceId: project.id, conversationIds: [general.id] },
  });
  await engine.idle();
  const asked = seenTasks.find((t) => t.request === 'what is this page');
  assert.equal(asked.spaceName, 'Launch');
  assert.equal(asked.context.focus[0].body, 'Paperie $58. Boxwell $74.');
  assert.ok(asked.context.recent.some((m: any) => m.text === 'We decided on Paperie'));
  assert.equal(asked.context.colleagues[0].name, agent.name);
  assert.deepEqual(
    snap(dylan.id)
      .messages.filter((m) => m.conversationId === mine.id)
      .at(-1)!.sourceIds,
    [page.id],
  );

  store.postMessage(dylan.id, {
    conversationId: mine.id,
    text: 'compare the vendors',
    context: { resourceIds: [page.id], spaceId: project.id },
  });
  await engine.idle();
  const thread = snap(dylan.id).messages.filter((m) => m.conversationId === mine.id);
  const relayed = thread.at(-1)!;
  assert.equal(relayed.authorId, agent.id, 'the colleague answers in the private conversation');
  assert.equal(relayed.text, 'Paperie is cheapest.');
  // The colleague never saw the private conversation itself.
  const handed = seenTasks.find((t) => t.conversation.kind === 'handoff');
  assert.deepEqual(handed.context.recent, []);
  // Nobody else sees the conversation, the job or the suggestion that came out of it.
  const other = snap(maya.id);
  assert.ok(!other.messages.some((m) => m.conversationId === mine.id));
  assert.ok(!other.approvals.some((a) => a.id === relayed.approvalId));
  assert.throws(() => store.decideApproval(maya.id, relayed.approvalId!, 'approved'));
  // Accepting it makes a page that is private to the person who asked.
  const decided = store.decideApproval(dylan.id, relayed.approvalId!, 'approved');
  const made = store.resource(decided.resultResourceId!)!;
  assert.equal(made.visibility, 'private');
  assert.equal(made.ownerId, dylan.id);
  assert.ok(!snap(maya.id).resources.some((r) => r.id === made.id));
});

test('a removed item can be brought back by the person who removed it', async () => {
  const { store, dylan, maya, project, snap } = setup();
  const note = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'doc',
    body: 'Keep me',
  });
  store.deleteResource(dylan.id, note.id);
  assert.ok(!snap(dylan.id).resources.some((r) => r.id === note.id));
  assert.throws(() => store.restoreResource(maya.id, note.id));
  store.restoreResource(dylan.id, note.id);
  assert.ok(snap(maya.id).resources.some((r) => r.id === note.id));
});

test('retiring an agent stops its work and keeps its history', async () => {
  const { store, dylan, project, general, snap } = setup();
  const scout = store.newAgent(dylan.id, { name: 'Scout', spaceId: project.id });
  const goal = store.createGoal(dylan.id, { spaceId: project.id, title: 'Compare quotes' });
  store.updateGoal(dylan.id, goal.id, { agentId: scout.id });
  store.retireAgent(dylan.id, scout.id);
  assert.equal(snap(dylan.id).users.find((u) => u.id === scout.id)?.retired, true);
  assert.ok(!store.addressableAgents(dylan.id, general).some((a) => a.id === scout.id));
  assert.equal(snap(dylan.id).goals[0].agentId, null);
});

test('skills: written once, given to agents, shared ones stay with their space', async () => {
  const seen: any[] = [];
  const runtime: AgentRuntime = {
    id: 'probe',
    label: 'Probe',
    async run(task) {
      seen.push(task);
      if (/remember/.test(task.request))
        return {
          reply: 'Saved as a skill once approved.',
          proposal: { kind: 'create-skill', title: 'Price check', body: '1. Read the quotes.' },
        };
      return task.kind === 'maintenance' ? {} : { reply: 'ok' };
    },
  };
  const { store, engine, dylan, maya, sam, project, general, agent, snap } = setup(runtime);
  const skill = store.createSkill(maya.id, {
    spaceId: project.id,
    name: 'Launch copy',
    description: 'When asked to write announcement copy',
    body: 'Lead with the customer problem. No superlatives.',
  });
  assert.ok(
    snap(dylan.id).skills.some((s) => s.id === skill.id),
    'shared with the space',
  );
  assert.ok(!snap(sam.id).skills.some((s) => s.id === skill.id));
  assert.throws(() => store.updateSkill(sam.id, skill.id, { name: 'x' }), /Not available/);
  store.setAgentSkill(dylan.id, agent.id, skill.id, true);
  assert.deepEqual(snap(maya.id).users.find((u) => u.id === agent.id)!.skillIds, [skill.id]);
  // A private skill belongs to its owner and cannot be put on a shared agent.
  const personal = snap(dylan.id).spaces.find((s) => s.kind === 'personal')!;
  const own = store.createSkill(dylan.id, {
    spaceId: personal.id,
    name: 'My voice',
    body: 'Short.',
  });
  assert.ok(!snap(maya.id).skills.some((s) => s.id === own.id));
  assert.throws(
    () => store.setAgentSkill(dylan.id, agent.id, own.id, true),
    /shared with its space/,
  );
  const mine = snap(dylan.id).users.find((u) => u.role === 'personal' && u.ownerId === dylan.id)!;
  store.setAgentSkill(dylan.id, mine.id, own.id, true);
  assert.throws(() => store.setAgentSkill(maya.id, mine.id, skill.id, true), /Not available/);
  // The agent is told its skills when it works.
  store.postMessage(dylan.id, {
    conversationId: general.id,
    text: 'draft it',
    addressedTo: agent.id,
  });
  await engine.idle();
  assert.deepEqual(seen.find((t) => t.request === 'draft it').agent.skills, [
    {
      name: 'Launch copy',
      when: 'When asked to write announcement copy',
      steps: 'Lead with the customer problem. No superlatives.',
    },
  ]);
  // An agent can propose a skill for itself; a person says yes.
  const ask = store.postMessage(dylan.id, {
    conversationId: general.id,
    text: 'remember how to check prices',
    addressedTo: agent.id,
  });
  await engine.idle();
  const reply = snap(dylan.id).messages.find((m) => m.replyTo === ask.id)!;
  store.decideApproval(maya.id, reply.approvalId!, 'approved');
  const learned = snap(dylan.id).skills.find((s) => s.name === 'Price check')!;
  assert.equal(learned.spaceId, project.id);
  assert.ok(
    snap(dylan.id)
      .users.find((u) => u.id === agent.id)!
      .skillIds!.includes(learned.id),
  );
  store.deleteSkill(dylan.id, skill.id);
  assert.ok(
    !snap(dylan.id)
      .users.find((u) => u.id === agent.id)!
      .skillIds!.includes(skill.id),
  );
});

test('retrieval and caching: the right passage is found, and a repeated question is not paid for twice', async () => {
  let calls = 0;
  const seen: any[] = [];
  const runtime: AgentRuntime = {
    id: 'probe',
    label: 'Probe',
    async run(task) {
      if (task.kind === 'maintenance') return {};
      calls++;
      seen.push(task);
      return { reply: `answer ${calls}` };
    },
  };
  const { store, engine, dylan, project, general, agent } = setup(runtime);
  const filler = Array.from(
    { length: 30 },
    (_, i) => `Paragraph ${i} about onboarding and queues.`,
  ).join('\n\n');
  store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'doc',
    title: 'Long notes',
    body: `# Long notes\n\n${filler}\n\n## Refunds\n\nRefunds are issued within 14 days to the original card.\n\n${filler}`,
  });
  const pricing = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'sheet',
    title: 'Pricing',
    body: JSON.stringify({
      rows: [
        ['Plan', 'Price'],
        ['Team', '32'],
      ],
    }),
  });
  const ask = (text: string) =>
    store.postMessage(dylan.id, { conversationId: general.id, text, addressedTo: agent.id });
  ask('how long do refunds take');
  await engine.idle();
  const first = seen.at(-1);
  assert.match(
    first.context.passages[0].text,
    /within 14 days/,
    'the buried passage is ranked first',
  );
  assert.equal(first.context.passages[0].title, 'Long notes');
  assert.ok(first.context.resources.every((r: any) => r.excerpt.length <= 140));
  // The same question again: answered from the cache, no second model call.
  ask('how long do refunds take');
  await engine.idle();
  assert.equal(calls, 1);
  assert.equal(engine.answers.hits, 1);
  // Unchanged pages are not split again.
  assert.ok(engine.retriever.hits > 0);
  // When a page the answer could depend on changes, the cache no longer applies.
  ask('what is the team price');
  await engine.idle();
  store.setCell(dylan.id, pricing.id, 1, 1, '35');
  ask('what is the team price');
  await engine.idle();
  assert.equal(calls, 3);
  assert.match(seen.at(-1).context.passages[0].text, /35/);
});

test('hosting: a health check, an access code, and pages served with safe headers', async () => {
  const app = createApp({
    dbPath: ':memory:',
    staticDir: fileURLToPath(new URL('./', import.meta.url)),
    runtime: scriptedRuntime,
    env: { ACCESS_CODE: 'open-sesame' },
  });
  opened.push(app);
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-workstation': '1', ...headers },
      body: JSON.stringify(body),
    });
  assert.deepEqual(await (await fetch(`${base}/healthz`)).json(), { ok: true, version: 0 });
  assert.deepEqual(await (await fetch(`${base}/api/config`)).json(), {
    accessCode: true,
    mode: 'open',
    googleClientId: null,
  });
  assert.equal((await post('/api/join', { name: 'Dylan' })).status, 403);
  const joined = await post(
    '/api/join',
    { name: 'Dylan', code: 'open-sesame' },
    { 'x-forwarded-proto': 'https' },
  );
  assert.equal(joined.status, 200);
  assert.match(
    joined.headers.get('set-cookie')!,
    /HttpOnly; SameSite=Lax; Path=\/; Max-Age=\d+; Secure/,
  );
  // People are not listed to someone outside, and come back by name.
  assert.deepEqual(await (await fetch(`${base}/api/profiles`)).json(), []);
  assert.equal((await post('/api/join', { name: 'dylan', code: 'open-sesame' })).status, 200);
  assert.equal(app.store.profiles().length, 1);
  const file = await fetch(`${base}/server.test.ts`);
  assert.match(file.headers.get('cache-control')!, /immutable/);
});

test('agent activity: teammates see that an agent is working and where, never what was asked', async () => {
  let release: () => void = () => {};
  const runtime: AgentRuntime = {
    id: 'slow',
    label: 'Slow',
    async run(task) {
      if (task.kind === 'maintenance') return {};
      await new Promise<void>((resolve) => (release = resolve));
      return { reply: 'done' };
    },
  };
  const { store, engine, dylan, maya, sam, project, snap } = setup(runtime);
  const page = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'doc',
    title: 'Brief',
    body: 'x',
  });
  const secret = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'doc',
    title: 'Private',
    body: 'y',
    visibility: 'private',
  });
  // Everyone's own agent is known by name and look to the people they work with.
  const prime = snap(maya.id).users.find((u) => u.role === 'personal' && u.ownerId === dylan.id)!;
  assert.equal(prime.name, "Dylan's agent");
  assert.equal(prime.instructions, '');
  assert.ok(!snap(sam.id).users.some((u) => u.id === prime.id));
  const mine = snap(dylan.id).conversations.find((c) => c.kind === 'agent-private')!;
  store.postMessage(dylan.id, {
    conversationId: mine.id,
    text: 'rewrite the secret part',
    context: { resourceIds: [page.id], spaceId: project.id },
  });
  await new Promise((r) => setTimeout(r, 20));
  const seen = snap(maya.id).activity.find((a) => a.agentId === prime.id)!;
  assert.deepEqual(
    { resourceId: seen.resourceId, conversationId: seen.conversationId, status: seen.status },
    { resourceId: page.id, conversationId: null, status: 'working' },
  );
  assert.ok(!JSON.stringify(snap(maya.id)).includes('rewrite the secret part'));
  assert.equal(
    snap(dylan.id).activity.find((a) => a.agentId === prime.id)!.conversationId,
    mine.id,
  );
  release();
  await engine.idle();
  assert.equal(snap(maya.id).activity.length, 0);
  // Working on a page the teammate cannot open shows the work, not the page.
  store.postMessage(dylan.id, {
    conversationId: mine.id,
    text: 'again',
    context: { resourceIds: [secret.id], spaceId: project.id },
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(snap(maya.id).activity[0].resourceId, null);
  release();
  await engine.idle();
  // A channel can sit on a canvas as a live window.
  const canvas = store.createResource(dylan.id, { spaceId: project.id, kind: 'canvas', body: '' });
  const general = snap(dylan.id).conversations.find((c) => c.kind === 'channel')!;
  const win = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'embed',
    parentId: canvas.id,
    body: JSON.stringify({ conversationId: general.id }),
  });
  assert.equal(win.title, '#general');
  assert.throws(() =>
    store.createResource(dylan.id, {
      spaceId: project.id,
      kind: 'embed',
      parentId: canvas.id,
      body: JSON.stringify({ conversationId: mine.id }),
    }),
  );
});

test('the bar can put a question to one of the space agents privately', async () => {
  const seen: any[] = [];
  const runtime: AgentRuntime = {
    id: 'probe',
    label: 'Probe',
    async run(task) {
      if (task.kind === 'maintenance') return {};
      seen.push(task);
      return { reply: `from ${task.agent.name}` };
    },
  };
  const { store, engine, dylan, maya, project, agent, snap } = setup(runtime);
  const mine = snap(dylan.id).conversations.find((c) => c.kind === 'agent-private')!;
  store.postMessage(dylan.id, { conversationId: mine.id, text: 'earlier, private' });
  await engine.idle();
  store.postMessage(dylan.id, {
    conversationId: mine.id,
    text: 'compare the vendors',
    context: { resourceIds: [], spaceId: project.id, handTo: agent.id },
  });
  await engine.idle();
  const thread = snap(dylan.id).messages.filter((m) => m.conversationId === mine.id);
  assert.equal(thread.at(-1)!.authorId, agent.id);
  assert.equal(seen.length, 2, 'your own agent was not also called');
  assert.deepEqual(
    seen.at(-1).context.recent,
    [],
    'the space agent did not see the private conversation',
  );
  assert.ok(!snap(maya.id).messages.some((m) => m.text === 'from Launch agent'));
  // Someone else's agent, or an agent of a space you are not in, cannot be reached this way.
  const other = store.createProject(maya.id, 'Other');
  store.postMessage(dylan.id, {
    conversationId: mine.id,
    text: 'hello',
    context: { resourceIds: [], spaceId: project.id, handTo: store.projectAgent(other.id)!.id },
  });
  await engine.idle();
  assert.notEqual(
    snap(dylan.id)
      .messages.filter((m) => m.conversationId === mine.id)
      .at(-1)!.authorId,
    store.projectAgent(other.id)!.id,
  );
});

test('a space agent asked from the bar says so when it fails, instead of going silent', async () => {
  const runtime: AgentRuntime = {
    id: 'broken',
    label: 'Broken',
    async run(task) {
      if (task.kind === 'maintenance') return {};
      throw new Error('the model could not be reached');
    },
  };
  const { store, engine, dylan, project, agent, snap } = setup(runtime);
  const mine = snap(dylan.id).conversations.find((c) => c.kind === 'agent-private')!;
  store.postMessage(dylan.id, {
    conversationId: mine.id,
    text: 'anything',
    context: { resourceIds: [], spaceId: project.id, handTo: agent.id },
  });
  await engine.idle();
  const reply = snap(dylan.id)
    .messages.filter((m) => m.conversationId === mine.id)
    .at(-1)!;
  assert.equal(reply.authorId, agent.id);
  assert.match(reply.text, /could not be reached/);
});

test('hosted by invitation: invite links, sign-in links, and nobody visible outside your spaces', async () => {
  const app = createApp({
    dbPath: ':memory:',
    staticDir: null,
    runtime: scriptedRuntime,
    env: { SIGN_IN: 'invite', ACCESS_CODE: 'first-in' },
  });
  opened.push(app);
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const client = () => {
    let jar = '';
    const call = async (path: string, body?: unknown) => {
      const res = await fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json', 'x-workstation': '1', cookie: jar },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const set = res.headers.get('set-cookie');
      if (set) jar = set.split(';')[0];
      return { status: res.status, data: (await res.json().catch(() => ({}))) as any };
    };
    return call;
  };
  const dylan = client();
  assert.deepEqual((await dylan('/api/config')).data, {
    accessCode: true,
    mode: 'invite',
    googleClientId: null,
  });
  assert.equal((await dylan('/api/join', { name: 'Dylan' })).status, 403, 'no invite, no code');
  assert.equal((await dylan('/api/join', { name: 'Dylan', code: 'first-in' })).status, 200);
  const space = (await dylan('/api/projects', { name: 'Launch' })).data;
  const invite = (await dylan('/api/invites', { spaceId: space.id })).data;
  assert.equal(
    (await dylan('/api/invites', { spaceId: space.id })).data.token,
    invite.token,
    'same link until replaced',
  );
  // Someone with the link sees where it leads, joins, and lands in the space.
  const maya = client();
  assert.deepEqual((await maya(`/api/invite/${invite.token}`)).data, {
    spaceName: 'Launch',
    invitedBy: 'Dylan',
  });
  assert.equal((await maya('/api/join', { name: 'Maya', invite: invite.token })).status, 200);
  const mayaView = (await maya('/api/snapshot')).data;
  assert.ok(mayaView.spaces.some((s: any) => s.id === space.id));
  assert.equal(mayaView.signIn, 'invite');
  // Someone in no shared space is invisible to them, and cannot be messaged or added by id.
  const sam = client();
  assert.equal((await sam('/api/join', { name: 'Sam', code: 'first-in' })).status, 200);
  const samId = (await sam('/api/snapshot')).data.me.id;
  assert.ok(!mayaView.users.some((u: any) => u.name === 'Sam'));
  assert.equal((await maya('/api/dms', { userId: samId })).status, 400);
  assert.equal((await maya(`/api/projects/${space.id}/members`, { userId: samId })).status, 400);
  assert.deepEqual((await sam('/api/profiles')).data, []);
  // A replaced link stops working.
  const fresh = (await dylan('/api/invites', { spaceId: space.id, fresh: true })).data;
  assert.notEqual(fresh.token, invite.token);
  assert.equal((await client()('/api/join', { name: 'Late', invite: invite.token })).status, 403);
  // Signing in on another device: once, then never again.
  const link = (await maya('/api/signin-links', {})).data;
  const phone = client();
  assert.equal((await phone('/api/join', { signin: link.token })).status, 200);
  assert.equal((await phone('/api/snapshot')).data.me.name, 'Maya');
  assert.equal((await client()('/api/join', { signin: link.token })).status, 403);
  // Signing out ends that session only.
  await phone('/api/logout', {});
  assert.equal((await phone('/api/snapshot')).status, 401);
  assert.equal((await maya('/api/snapshot')).status, 200);
  // An existing person accepts an invite from inside.
  const other = (await sam('/api/projects', { name: 'Other' })).data;
  const samInvite = (await sam('/api/invites', { spaceId: other.id })).data;
  assert.equal((await maya('/api/invites/accept', { token: samInvite.token })).status, 200);
  assert.ok((await maya('/api/snapshot')).data.users.some((u: any) => u.name === 'Sam'));
});

test('agent guardrails: daily allowances per person and per space, and a per-minute rate', async () => {
  const model: AgentRuntime = {
    id: 'fake-model',
    label: 'Fake model',
    run: async () => ({ reply: 'Model answer', tokens: 100 }),
  };
  const ask = async (
    s: ReturnType<typeof setup>,
    who: string,
    conversationId: string,
    text: string,
    addressedTo?: string,
  ) => {
    s.store.postMessage(who, { conversationId, text, ...(addressedTo ? { addressedTo } : {}) });
    await s.engine.idle();
    return s
      .snap(who)
      .messages.filter((m) => m.conversationId === conversationId)
      .at(-1)!;
  };
  const privateChat = (s: ReturnType<typeof setup>, who: string) =>
    s.snap(who).conversations.find((c) => c.kind === 'agent-private')!.id;

  // One person's allowance: after it is used, the agent says so and the labelled stand-in answers.
  const a = setup(model, { AGENT_PERSON_DAILY_TOKENS: '150', AGENT_SPACE_DAILY_TOKENS: '10000' });
  const mine = privateChat(a, a.dylan.id);
  assert.equal((await ask(a, a.dylan.id, mine, 'first question')).runtime, 'fake-model');
  assert.equal((await ask(a, a.dylan.id, mine, 'second question')).runtime, 'fake-model');
  const over = await ask(a, a.dylan.id, mine, 'third question');
  assert.equal(over.runtime, 'scripted');
  assert.match(over.text, /used today's agent allowance/);
  // Someone else is unaffected.
  assert.equal((await ask(a, a.maya.id, privateChat(a, a.maya.id), 'hello')).runtime, 'fake-model');

  // A space's allowance is shared by everyone in it, including the agent's own background upkeep.
  const b = setup(model, { AGENT_PERSON_DAILY_TOKENS: '10000', AGENT_SPACE_DAILY_TOKENS: '150' });
  const to = b.agent.id;
  assert.equal(
    (await ask(b, b.dylan.id, b.general.id, 'what is the plan', to)).runtime,
    'fake-model',
  );
  assert.ok(b.store.agentUsageToday('space', b.project.id) >= 150, 'answer plus upkeep counted');
  assert.equal(b.store.agentUsageToday('person', b.maya.id), 0, 'Maya has spent nothing');
  const spaceOver = await ask(b, b.maya.id, b.general.id, 'anything else', to);
  assert.equal(spaceOver.runtime, 'scripted');
  assert.match(spaceOver.text, /Launch has used today's agent allowance/);

  // Asking too fast gets no answer at all, scripted or otherwise.
  const c = setup(model, { AGENT_REQUESTS_PER_MINUTE: '2' });
  const fast = privateChat(c, c.dylan.id);
  await ask(c, c.dylan.id, fast, 'one');
  await ask(c, c.dylan.id, fast, 'two');
  const tooFast = await ask(c, c.dylan.id, fast, 'three');
  assert.match(tooFast.text, /asked agents 2 times in the last minute/);
  assert.notEqual(tooFast.runtime, 'scripted');
});

test("meaning search: finds a page by what it means, embeds each page once until it changes, and never shows another person's private page", async () => {
  // Stand-in embedder: words map to a few concepts, so "price" and "cost" land together.
  const concepts: Record<string, number> = {
    price: 0,
    cost: 0,
    pricing: 0,
    vehicle: 1,
    van: 1,
    truck: 1,
    driver: 2,
    drivers: 2,
    hiring: 2,
  };
  const embedded: string[] = [];
  const embedder = {
    id: 'fake-embed',
    async embed(texts: string[]) {
      embedded.push(...texts);
      return texts.map((t) => {
        const v = new Float32Array(4);
        for (const w of t.toLowerCase().split(/[^a-z]+/)) v[concepts[w] ?? 3] += 1;
        const n = Math.hypot(...v) || 1;
        return v.map((x) => x / n);
      });
    },
  };
  const seen: AgentTask[] = [];
  const model: AgentRuntime = {
    id: 'fake-model',
    label: 'Fake model',
    run: async (task) => {
      seen.push(task);
      return { reply: 'ok', tokens: 1 };
    },
  };
  const app = createApp({ dbPath: ':memory:', staticDir: null, runtime: model, embedder, env: {} });
  opened.push(app);
  const { store, engine } = app;
  const dylan = store.createHuman('Dylan');
  const maya = store.createHuman('Maya');
  const project = store.createProject(dylan.id, 'Launch');
  store.addMember(dylan.id, project.id, maya.id);
  const budget = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'doc',
    title: 'Budget',
    body: 'The van rental cost is $400 per day.',
    visibility: 'space',
  });
  store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'doc',
    title: 'Team',
    body: 'We still need two drivers.',
    visibility: 'space',
  });
  store.createResource(maya.id, {
    spaceId: project.id,
    kind: 'doc',
    title: 'Maya private',
    body: 'Vehicle price notes, only for Maya.',
    visibility: 'private',
  });
  const mine = store
    .snapshot(dylan.id, [], { id: 'fake-model', label: 'Fake model' })
    .conversations.find((c) => c.kind === 'agent-private')!;
  const ask = async (text: string) => {
    store.postMessage(dylan.id, { conversationId: mine.id, text });
    await engine.idle();
    return seen.at(-1)!.context.passages.map((p) => p.title);
  };
  // The first question embeds the pages in the background; keywords alone find nothing here.
  assert.deepEqual(await ask('what is the price of the vehicle'), []);
  const once = embedded.length;
  assert.ok(once > 0);
  // Asked again in other words: found by meaning, and nothing re-embedded but the question.
  const found = await ask('how much does the vehicle price come to');
  assert.equal(found[0], 'Budget');
  assert.ok(!found.includes('Maya private'), "never another person's private page");
  assert.equal(embedded.length, once + 1, 'only the question was embedded');
  // Changing the page embeds it again.
  store.updateResource(dylan.id, budget.id, { body: 'The truck rental cost is $450 per day.' });
  await ask('vehicle price today');
  await engine.idle();
  assert.ok(embedded.some((t) => t.includes('$450')));
});

test('answer checks: a fixable mistake gets one retry with the problem spelled out, and what is still wrong is left out and said', async () => {
  const tasks: AgentTask[] = [];
  let script: ((task: AgentTask) => AgentResult)[] = [];
  const model: AgentRuntime = {
    id: 'fake-model',
    label: 'Fake model',
    run: async (task) => {
      // Background orientation upkeep also calls the model; it is not what is being tested here.
      if (task.kind === 'maintenance') return {};
      tasks.push(task);
      return { ...script.shift()!(task), tokens: 10 };
    },
  };
  const { store, engine, dylan, project, agent, snap } = setup(model);
  const page = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'doc',
    title: 'Shortlist',
    body: '# Shortlist\n\nPaperie costs $58 for 50 boxes.',
  });
  const feed = store.openDiscussion(dylan.id, page.id);
  const ask = async (text: string) => {
    const m = store.postMessage(dylan.id, {
      conversationId: feed.id,
      text,
      addressedTo: agent.id,
      anchor: { resourceId: page.id, quote: 'Paperie costs $58 for 50 boxes.' },
    });
    await engine.idle();
    return snap(dylan.id).messages.find((x) => x.replyTo === m.id)!;
  };

  // An edit quoting text that isn't on the page: retried with the reason, then right.
  script = [
    () => ({
      reply: 'Suggested.',
      proposal: { kind: 'edit-doc', title: 'Paperie costs $85 for 50 boxes.', body: 'x' },
    }),
    () => ({
      reply: 'Suggested.',
      proposal: {
        kind: 'edit-doc',
        title: 'Paperie costs $58 for 50 boxes.',
        body: 'Paperie costs $61 for 50 boxes.',
      },
    }),
  ];
  const fixed = await ask('make it $61');
  assert.equal(tasks.length, 2);
  assert.match(tasks[1].feedback!, /does not appear on "Shortlist" exactly/);
  assert.ok(fixed.approvalId, 'the corrected edit is proposed');
  assert.equal(engine.retries, 1);

  // Still wrong after the retry: no edit is proposed, the reply says so, and invented sources go.
  tasks.length = 0;
  script = [
    () => ({
      reply: 'Done.',
      sources: ['Shortlist', 'Made-up page'],
      proposal: { kind: 'edit-doc', title: 'nope', body: 'x' },
    }),
    () => ({
      reply: 'Done.',
      sources: ['Made-up page'],
      proposal: { kind: 'edit-doc', title: 'still nope', body: 'x' },
    }),
  ];
  const failed = await ask('make it $70');
  assert.equal(tasks.length, 2, 'only one retry');
  assert.match(tasks[1].feedback!, /"Made-up page"/);
  assert.equal(failed.approvalId ?? null, null);
  assert.match(failed.text, /couldn't match the text to change on "Shortlist"/);
  assert.deepEqual(failed.sourceIds, []);

  // A handoff to someone who doesn't exist is not claimed as done.
  script = [
    () => ({ reply: 'Handing this to Nobody.', handoff: { to: 'Nobody', request: 'x' } }),
    () => ({ reply: 'Handing this to Nobody.', handoff: { to: 'Nobody', request: 'x' } }),
  ];
  const handoff = await ask('who should do this?');
  assert.match(handoff.text, /couldn't hand this to "Nobody"/);

  // An unreadable answer is retried; a good answer needs no retry.
  script = [() => ({ reply: '', malformed: true }), () => ({ reply: 'Here it is.' })];
  assert.equal((await ask('summarise')).text, 'Here it is.');
  const before = engine.retries;
  script = [() => ({ reply: 'Fine first time.', sources: ['Shortlist'] })];
  assert.equal((await ask('anything else')).text, 'Fine first time.');
  assert.equal(engine.retries, before);
});

test('openai runtime asks for the strict answer schema, and falls back to plain JSON if the model refuses it', async () => {
  const formats: any[] = [];
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    formats.push(body.response_format);
    if (body.response_format.type === 'json_schema')
      return new Response(
        JSON.stringify({
          error: {
            message:
              "Invalid parameter: 'response_format' of type 'json_schema' is not supported with this model.",
          },
        }),
        { status: 400 },
      );
    return new Response(
      JSON.stringify({
        usage: { total_tokens: 5 },
        choices: [{ message: { content: '{"reply":"ok"}' } }],
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  const runtime = createOpenAIRuntime({
    apiKey: PLACEHOLDER_KEY,
    dailyTokenLimit: 1000,
    usageToday: () => 0,
    addUsage: () => {},
    fetch: fakeFetch,
  });
  const task = {
    kind: 'ask',
    request: 'hi',
    agent: { name: 'A', role: 'project' },
    spaceName: 'S',
    context: {
      resources: [],
      members: [],
      colleagues: [],
      orientation: null,
      plan: [],
      passages: [],
      recent: [],
    },
  } as unknown as AgentTask;
  assert.equal((await runtime.run(task)).reply, 'ok');
  assert.equal(formats[0].type, 'json_schema');
  assert.equal(formats[0].json_schema.strict, true);
  assert.equal(formats[1].type, 'json_object');
  await runtime.run(task);
  assert.equal(formats[2].type, 'json_object', 'remembered for later requests');
  // Prose instead of JSON is flagged so the engine can retry, and kept as the reply.
  const prose = createOpenAIRuntime({
    apiKey: PLACEHOLDER_KEY,
    dailyTokenLimit: 1000,
    usageToday: () => 0,
    addUsage: () => {},
    fetch: (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'Just text.' } }] }), {
        status: 200,
      })) as unknown as typeof fetch,
  });
  const r = await prose.run(task);
  assert.equal(r.malformed, true);
  assert.equal(r.reply, 'Just text.');
});

test('google sign-in: verified accounts only, new people need an invite or the setup code, and the same account comes back as the same person', async () => {
  // Stand-in for Google: the credential names the account.
  const accounts: Record<string, GoogleAccount> = {
    'dylan-cred': { subject: 'g-1', name: 'Dylan', email: 'd@example.com', verified: true },
    'maya-cred': { subject: 'g-2', name: 'Maya', email: 'm@example.com', verified: true },
    'other-dylan': { subject: 'g-3', name: 'Dylan', email: 'x@example.com', verified: true },
    unverified: { subject: 'g-4', name: 'Nope', email: 'n@example.com', verified: false },
  };
  const audiences: string[] = [];
  const app = createApp({
    dbPath: ':memory:',
    staticDir: null,
    runtime: scriptedRuntime,
    env: { SIGN_IN: 'invite', ACCESS_CODE: 'first-in', GOOGLE_CLIENT_ID: 'client-123' },
    verifyGoogle: async (credential, clientId) => {
      audiences.push(clientId);
      const account = accounts[credential];
      if (!account) throw new Error('bad token');
      return account;
    },
  });
  opened.push(app);
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const client = () => {
    let jar = '';
    return async (path: string, body?: unknown) => {
      const res = await fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json', 'x-workstation': '1', cookie: jar },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const set = res.headers.get('set-cookie');
      if (set) jar = set.split(';')[0];
      return { status: res.status, data: (await res.json().catch(() => ({}))) as any };
    };
  };
  const dylan = client();
  assert.equal((await dylan('/api/config')).data.googleClientId, 'client-123');
  assert.equal(
    (await dylan('/api/join', { name: 'Dylan', code: 'first-in' })).status,
    403,
    'Google only',
  );
  assert.equal((await dylan('/api/auth/google', { credential: 'forged' })).status, 403);
  assert.equal(
    (await dylan('/api/auth/google', { credential: 'dylan-cred' })).status,
    403,
    'a new person needs the setup code or an invite',
  );
  assert.equal(
    (await dylan('/api/auth/google', { credential: 'unverified', code: 'first-in' })).status,
    403,
  );
  assert.equal(
    (await dylan('/api/auth/google', { credential: 'dylan-cred', code: 'first-in' })).status,
    200,
  );
  assert.ok(
    audiences.every((a) => a === 'client-123'),
    "checked against this server's client id",
  );
  const me = (await dylan('/api/snapshot')).data.me;
  assert.equal(me.name, 'Dylan');
  // The same Google account on another device is the same person, without any code.
  const laptop = client();
  assert.equal((await laptop('/api/auth/google', { credential: 'dylan-cred' })).status, 200);
  assert.equal((await laptop('/api/snapshot')).data.me.id, me.id);
  // Someone invited joins with Google and lands in the space.
  const space = (await dylan('/api/projects', { name: 'Launch' })).data;
  const invite = (await dylan('/api/invites', { spaceId: space.id })).data;
  const maya = client();
  assert.equal(
    (await maya('/api/auth/google', { credential: 'maya-cred', invite: invite.token })).status,
    200,
  );
  assert.ok((await maya('/api/snapshot')).data.spaces.some((x: any) => x.id === space.id));
  // A second Google account with the same name gets its own person, not Dylan's.
  const twin = client();
  assert.equal(
    (await twin('/api/auth/google', { credential: 'other-dylan', invite: invite.token })).status,
    200,
  );
  const twinMe = (await twin('/api/snapshot')).data.me;
  assert.notEqual(twinMe.id, me.id);
  assert.equal(twinMe.name, 'Dylan 2');
  // Device links still sign you in.
  const link = (await maya('/api/signin-links', {})).data;
  const phone = client();
  assert.equal((await phone('/api/join', { signin: link.token })).status, 200);
  assert.equal((await phone('/api/snapshot')).data.me.name, 'Maya');
});

test('sharing from your agent: it says whose agent said it, keeps only sources others can open, and can be taken back', async () => {
  const { store, dylan, maya, sam, project, general, snap } = setup();
  const mine = snap(dylan.id).conversations.find((c) => c.kind === 'agent-private')!;
  const myAgent = snap(dylan.id).users.find(
    (u) => u.role === 'personal' && u.ownerId === dylan.id,
  )!;
  const brief = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'doc',
    title: 'Brief',
    body: 'Boxes cost $58.',
  });
  const notes = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'doc',
    title: 'My notes',
    body: 'private',
    visibility: 'private',
  });
  const answer = store.postMessage(
    myAgent.id,
    { conversationId: mine.id, text: 'Boxes went up to $61.' },
    { sourceIds: [brief.id, notes.id] },
  );
  const shared = store.postMessage(dylan.id, {
    conversationId: general.id,
    text: 'Boxes went up to $61.',
    sharedFrom: answer.id,
  });
  assert.deepEqual(shared.sharedFrom, { agentId: myAgent.id, ownerId: dylan.id });
  assert.deepEqual(shared.sourceIds, [brief.id], 'a page only Dylan can open is left out');
  const seen = snap(maya.id).messages.find((m) => m.id === shared.id)!;
  assert.equal(seen.sharedFrom?.agentId, myAgent.id);
  // Only your own private conversation can be shared from, and only by you.
  assert.throws(() =>
    store.postMessage(maya.id, { conversationId: general.id, text: 'x', sharedFrom: answer.id }),
  );
  const dm = store.openDm(dylan.id, sam.id);
  assert.throws(() =>
    store.postMessage(dylan.id, { conversationId: general.id, text: 'x', sharedFrom: shared.id }),
  );
  assert.ok(dm);
  // Taken back: gone for everyone. Nobody else can take it back.
  assert.throws(() => store.deleteMessage(maya.id, shared.id));
  store.deleteMessage(dylan.id, shared.id);
  assert.ok(!snap(maya.id).messages.some((m) => m.id === shared.id));
});

test('stopping your agent mid-answer: nothing is said or changed, and only people who can see it may stop it', async () => {
  let release: () => void = () => {};
  const runtime: AgentRuntime = {
    id: 'slow',
    label: 'Slow',
    async run(task) {
      if (task.kind === 'maintenance') return {};
      await new Promise<void>((done) => (release = done));
      return { reply: 'too late' };
    },
  };
  const { store, engine, dylan, maya, snap } = setup(runtime);
  const mine = snap(dylan.id).conversations.find((c) => c.kind === 'agent-private')!;
  store.postMessage(dylan.id, { conversationId: mine.id, text: 'take your time' });
  await new Promise((r) => setTimeout(r, 20));
  const job = snap(dylan.id).jobs.find(
    (j) => j.conversationId === mine.id && j.status === 'running',
  )!;
  assert.ok(job);
  assert.throws(() => store.stopJob(maya.id, job.id), 'not Maya’s to stop');
  store.stopJob(dylan.id, job.id);
  release();
  await engine.idle();
  assert.ok(!snap(dylan.id).messages.some((m) => m.text === 'too late'));
  assert.match(store.job(job.id)!.error ?? '', /^Stopped by Dylan/);
});

test('a message marked decided reaches the agent as settled', async () => {
  const seen: any[] = [];
  const runtime: AgentRuntime = {
    id: 'probe',
    label: 'Probe',
    async run(task) {
      if (task.kind === 'maintenance') return {};
      seen.push(task);
      return { reply: 'noted' };
    },
  };
  const { store, engine, dylan, general, agent } = setup(runtime);
  const price = store.postMessage(dylan.id, { conversationId: general.id, text: 'Team is $32.' });
  store.resolveMessage(dylan.id, price.id, true);
  store.postMessage(dylan.id, {
    conversationId: general.id,
    text: 'what did we decide?',
    addressedTo: agent.id,
  });
  await engine.idle();
  assert.ok(seen.at(-1).context.recent.some((m: any) => m.text === '[decided] Team is $32.'));
});

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { scriptedRuntime } from '../server/agents/scripted.ts';

const opened: ReturnType<typeof createApp>[] = [];
after(async () => {
  for (const app of opened) await app.close();
});

async function setup() {
  const app = createApp({
    dbPath: ':memory:',
    staticDir: null,
    runtime: scriptedRuntime,
    maintenanceDelayMs: 5,
  });
  opened.push(app);
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const { store, seats } = app;
  const dylan = store.createHuman('Dylan');
  const maya = store.createHuman('Maya');
  const launch = store.createProject(dylan.id, 'Launch');
  store.addMember(dylan.id, launch.id, maya.id);
  const elsewhere = store.createProject(maya.id, 'Elsewhere');
  const { seat, token } = seats.create(dylan.id, { name: 'Codex', spaceId: launch.id });
  let n = 0;
  const rpc = async (method: string, params: unknown = {}, bearer = token.token) => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params }),
    });
    return { status: res.status, body: res.status === 202 ? null : await res.json() };
  };
  const call = async (name: string, args: unknown = {}) => {
    const { body } = await rpc('tools/call', { name, arguments: args });
    assert.ok(body.result, JSON.stringify(body));
    const text = body.result.content[0].text as string;
    return {
      isError: body.result.isError as boolean,
      text,
      data: body.result.isError ? null : JSON.parse(text),
    };
  };
  return { app, base, store, seats, dylan, maya, launch, elsewhere, seat, token, rpc, call };
}

test('mcp: signs in only with a live seat token, and speaks MCP', async () => {
  const { base, seats, dylan, seat, token, rpc } = await setup();
  assert.equal((await rpc('initialize', {}, 'sbx_wrong')).status, 401);
  const none = await fetch(`${base}/mcp`, { method: 'POST', body: '{}' });
  assert.equal(none.status, 401);
  assert.match(none.headers.get('www-authenticate') ?? '', /Bearer/);
  assert.equal(
    (await fetch(`${base}/mcp`, { headers: { authorization: `Bearer ${token.token}` } })).status,
    405,
  );
  const page = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token.token}`, origin: 'https://evil.example' },
    body: '{}',
  });
  assert.equal(page.status, 403, 'a web page elsewhere cannot use a token');

  const init = await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '1' },
  });
  assert.equal(init.body.result.protocolVersion, '2025-06-18');
  assert.equal(init.body.result.serverInfo.name, 'sandbox');
  assert.ok(init.body.result.capabilities.tools);
  assert.match(init.body.result.instructions, /You are Codex/);
  const notified = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token.token}` },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
  assert.equal(notified.status, 202);
  assert.deepEqual((await rpc('ping')).body.result, {});
  const tools = (await rpc('tools/list')).body.result.tools.map((t: any) => t.name);
  for (const name of ['inbox', 'read_page', 'post_message', 'suggest_edit', 'working_on'])
    assert.ok(tools.includes(name), name);
  assert.equal((await rpc('nope')).body.error.code, -32601);

  // Revoked or retired, the token stops at once.
  seats.retire(dylan.id, seat.agent.id);
  assert.equal((await rpc('ping')).status, 401);
});

test('mcp: a seat reads what its workspaces share and nothing private', async () => {
  const { store, dylan, maya, launch, elsewhere, call } = await setup();
  const plan = store.createResource(maya.id, {
    spaceId: launch.id,
    kind: 'doc',
    title: 'Launch plan',
    body: '# Launch plan\n\nShip on Friday.',
  });
  const secret = store.createResource(dylan.id, {
    spaceId: launch.id,
    kind: 'doc',
    title: 'Salary notes',
    body: 'Friday raises',
    visibility: 'private',
  });
  const other = store.createResource(maya.id, {
    spaceId: elsewhere.id,
    kind: 'doc',
    title: 'Other plan',
    body: 'Friday too',
  });
  const sheet = store.createResource(maya.id, {
    spaceId: launch.id,
    kind: 'sheet',
    title: 'Budget',
    body: '',
  });
  store.setCells(maya.id, sheet.id, [
    { row: 0, col: 0, value: 'Item' },
    { row: 0, col: 1, value: 'Cost' },
    { row: 1, col: 0, value: 'Ads' },
    { row: 1, col: 1, value: '300' },
    { row: 2, col: 1, value: '=SUM(B2:B2)' },
  ]);
  const me = await call('whoami');
  assert.deepEqual(
    me.data.workspaces.map((w: any) => w.name),
    ['Launch'],
  );
  const ids = (await call('list_pages')).data.map((p: any) => p.id);
  assert.ok(ids.includes(plan.id));
  assert.ok(!ids.includes(secret.id));
  assert.ok(!ids.includes(other.id));
  const read = await call('read_page', { page_id: plan.id });
  assert.equal(read.data.format, 'markdown');
  assert.match(read.data.text, /Ship on Friday/);
  assert.ok((await call('read_page', { page_id: secret.id })).isError);
  assert.ok((await call('read_page', { page_id: other.id })).isError);
  const budget = await call('read_page', { page_id: sheet.id });
  assert.equal(budget.data.format, 'tsv');
  assert.match(budget.data.text, /Ads\t300/);
  assert.match(budget.data.text, /\t300$/m, 'formulas are read as their values');
  assert.deepEqual(budget.data.formulas, ['B3 =SUM(B2:B2)']);
  const found = (await call('search', { query: 'friday' })).data.map((r: any) => r.page.id);
  assert.ok(found.includes(plan.id));
  assert.ok(!found.includes(secret.id) && !found.includes(other.id));
  assert.ok((await call('list_pages', { workspace_id: elsewhere.id })).isError);
  // Opened to it by name, a private page can be read.
  store.setGrant(dylan.id, secret.id, (await call('whoami')).data.id, true);
  assert.equal((await call('read_page', { page_id: secret.id })).isError, false);
});

test('mcp: messages to the seat reach its inbox, and it answers as itself', async () => {
  const { store, maya, launch, seat, call } = await setup();
  const chats = (await call('list_chats', { workspace_id: launch.id })).data;
  const general = chats.find((c: any) => c.title === '#general');
  assert.ok(general);
  const asked = store.postMessage(maya.id, {
    conversationId: general.id,
    text: '@Codex can you check the plan?',
    addressedTo: seat.agent.id,
  });
  const inbox = (await call('inbox')).data;
  assert.equal(inbox[0].id, asked.id);
  assert.equal(inbox[0].from, 'Maya');
  const answer = await call('post_message', {
    chat_id: general.id,
    text: 'On it.',
    reply_to: asked.id,
  });
  assert.equal(answer.data.from, 'Codex');
  // A reply in its thread reaches it too, without a tag.
  const thanks = store.postMessage(maya.id, {
    conversationId: general.id,
    text: 'Thanks',
    replyTo: answer.data.id,
  });
  assert.ok((await call('inbox')).data.some((m: any) => m.id === thanks.id));
  const history = (await call('read_chat', { chat_id: general.id })).data.messages;
  assert.ok(history.some((m: any) => m.text === 'On it.'));
});

test('mcp: page changes are suggestions a person accepts', async () => {
  const { store, maya, launch, seat, call } = await setup();
  const plan = store.createResource(maya.id, {
    spaceId: launch.id,
    kind: 'doc',
    title: 'Plan',
    body: '# Plan\n\nShip on Friday.',
  });
  const missing = await call('suggest_edit', { page_id: plan.id, find: 'Monday', replace: 'x' });
  assert.ok(missing.isError);
  const edit = await call('suggest_edit', {
    page_id: plan.id,
    find: 'Friday',
    replace: 'Thursday',
    note: 'The venue moved us a day earlier.',
  });
  assert.equal(store.resource(plan.id)!.body, '# Plan\n\nShip on Friday.', 'nothing changes yet');
  const approval = store.approval(edit.data.suggestionId)!;
  assert.equal(approval.agentId, seat.agent.id);
  const card = store.messages(edit.data.chatId).find((m) => m.approvalId === approval.id)!;
  assert.equal(card.authorId, seat.agent.id);
  assert.equal(card.text, 'The venue moved us a day earlier.');
  assert.equal(
    (await call('suggestion_status', { suggestion_id: approval.id })).data.status,
    'waiting',
  );
  store.decideApproval(maya.id, approval.id, 'approved');
  assert.equal(store.resource(plan.id)!.body, '# Plan\n\nShip on Thursday.');
  const status = (await call('suggestion_status', { suggestion_id: approval.id })).data;
  assert.equal(status.status, 'approved');
  assert.equal(status.decidedBy, 'Maya');

  const page = await call('suggest_page', {
    workspace_id: launch.id,
    title: 'Notes from Codex',
    body: 'What I found.',
  });
  store.decideApproval(maya.id, page.data.suggestionId, 'approved');
  const made = (await call('suggestion_status', { suggestion_id: page.data.suggestionId })).data;
  assert.equal(store.resource(made.pageId)!.title, 'Notes from Codex');
  assert.equal(store.resource(made.pageId)!.visibility, 'space');

  const sheet = store.createResource(maya.id, {
    spaceId: launch.id,
    kind: 'sheet',
    title: 'Budget',
    body: '',
  });
  assert.ok((await call('suggest_cells', { page_id: sheet.id, changes: 'nonsense' })).isError);
  const cells = await call('suggest_cells', { page_id: sheet.id, changes: 'B2 = 300' });
  store.decideApproval(maya.id, cells.data.suggestionId, 'approved');
  assert.equal(JSON.parse(store.resource(sheet.id)!.body).rows[1][1], '300');
});

test('mcp: a seat at work shows on the page it says, and stops when done', async () => {
  const { store, maya, launch, seat, call } = await setup();
  const plan = store.createResource(maya.id, { spaceId: launch.id, kind: 'doc', body: 'Plan' });
  const activity = () =>
    store
      .snapshot(maya.id, [], { id: 'scripted', label: 'Scripted' })
      .activity.filter((a) => a.agentId === seat.agent.id);
  assert.equal(activity().length, 0);
  await call('working_on', { page_id: plan.id, note: 'Reading the plan' });
  assert.deepEqual(
    activity().map((a) => [a.resourceId, a.status]),
    [[plan.id, 'working']],
  );
  // Saying it again moves it rather than adding a second.
  const other = store.createResource(maya.id, { spaceId: launch.id, kind: 'doc', body: 'Other' });
  await call('working_on', { page_id: other.id });
  assert.deepEqual(
    activity().map((a) => a.resourceId),
    [other.id],
  );
  await call('working_on', { done: true });
  assert.equal(activity().length, 0);
  assert.ok((await call('working_on', {})).isError);
});

test('mcp: its owner sees what the seat read and wrote, and nothing they could not see', async () => {
  const { store, seats, dylan, maya, launch, seat, call } = await setup();
  const plan = store.createResource(maya.id, {
    spaceId: launch.id,
    kind: 'doc',
    title: 'Plan',
    body: 'Ship on Friday.',
  });
  const notes = store.createResource(maya.id, {
    spaceId: launch.id,
    kind: 'doc',
    title: 'Maya only',
    body: 'Private',
    visibility: 'private',
  });
  store.setGrant(maya.id, notes.id, seat.agent.id, true);
  const general = (await call('list_chats', { workspace_id: launch.id })).data.find(
    (c: any) => c.title === '#general',
  );
  await call('read_page', { page_id: plan.id });
  await call('read_page', { page_id: notes.id });
  await call('search', { query: 'friday' });
  await call('post_message', { chat_id: general.id, text: 'Read the plan.' });
  await call('read_page', { page_id: 'nope' });

  const log = seats.activity(dylan.id, seat.agent.id);
  assert.deepEqual(
    log.map((a) => a.tool),
    ['read_page', 'post_message', 'search', 'read_page', 'read_page', 'list_chats'],
    'newest first',
  );
  const [failed, posted, searched, secret, read] = log;
  assert.equal(failed.ok, false);
  assert.match(failed.detail, /\w/);
  assert.equal(posted.wrote, true);
  assert.equal(posted.chat?.id, general.id);
  assert.equal(searched.detail, 'friday');
  assert.equal(searched.wrote, false);
  // Maya opened her page to the seat alone: its owner sees that it read something, not what.
  assert.equal(secret.hidden, true);
  assert.equal(secret.page, null);
  assert.deepEqual(read.page, { id: plan.id, title: 'Plan' });
  assert.ok(!JSON.stringify(log).includes('Ship on Friday'), 'never what it read');
  // Only its owner sees the log.
  assert.throws(() => seats.activity(maya.id, seat.agent.id), /Not available/);
});

test('mcp: a seat comments on pages it can read, pinned to text, and resolves them', async () => {
  const { store, seats, dylan, maya, launch, seat, call } = await setup();
  const plan = store.createResource(maya.id, {
    spaceId: launch.id,
    kind: 'doc',
    title: 'Launch plan',
    body: '# Launch plan\n\nShip on **Friday**.',
  });
  const secret = store.createResource(dylan.id, {
    spaceId: launch.id,
    kind: 'doc',
    title: 'Salary notes',
    body: 'Friday raises',
    visibility: 'private',
  });
  assert.deepEqual((await call('list_comments', { page_id: plan.id })).data, []);
  const off = await call('comment_on_page', { page_id: plan.id, text: 'Hm', quote: 'Monday' });
  assert.ok(off.isError);
  assert.match(off.text, /not on the page/);
  const made = await call('comment_on_page', {
    page_id: plan.id,
    text: 'Friday clashes with the offsite.',
    quote: 'Ship on Friday',
  });
  assert.equal(made.isError, false);
  assert.equal(made.data.from, 'Codex');
  assert.deepEqual(made.data.about, { pageId: plan.id, quote: 'Ship on Friday' });
  // It lands in the page's own discussion, where people see it beside the page.
  const discussion = store.openDiscussion(maya.id, plan.id);
  assert.equal(made.data.chatId, discussion.id);
  const answer = store.postMessage(maya.id, {
    conversationId: discussion.id,
    text: 'Moved to Monday.',
    replyTo: made.data.id,
  });
  const thanks = await call('comment_on_page', {
    page_id: plan.id,
    text: 'Thanks.',
    reply_to: answer.id,
  });
  assert.equal(thanks.data.replyTo, answer.id);
  assert.equal((await call('resolve_comment', { comment_id: made.data.id })).isError, false);
  const listed = (await call('list_comments', { page_id: plan.id })).data;
  assert.deepEqual(
    listed.map((c: any) => [c.from, c.resolved]),
    [
      ['Codex', true],
      ['Maya', false],
      ['Codex', false],
    ],
  );
  // Comments change nothing on the page, and a private page stays out of reach.
  assert.equal(store.resource(plan.id)!.body, '# Launch plan\n\nShip on **Friday**.');
  assert.ok((await call('comment_on_page', { page_id: secret.id, text: 'x' })).isError);
  assert.ok((await call('list_comments', { page_id: secret.id })).isError);
  // Its owner sees the comments in What it did.
  const did = seats.activity(dylan.id, seat.agent.id).filter((a) => a.tool === 'comment_on_page');
  assert.equal(did.length, 4);
  assert.ok(did.every((a) => a.wrote));
});

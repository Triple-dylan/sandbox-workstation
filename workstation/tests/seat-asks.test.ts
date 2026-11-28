import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import type { AgentRuntime } from '../server/agents/runtime.ts';

const opened: ReturnType<typeof createApp>[] = [];
after(async () => {
  for (const app of opened) await app.close();
});

/** Answers every ask and reports what it cost, as a real model would. */
const metered: AgentRuntime = {
  id: 'metered',
  label: 'Metered',
  run: async (task) => ({ reply: `About "${task.request}": it ships Friday.`, tokens: 15_000 }),
};

async function setup() {
  const app = createApp({
    dbPath: ':memory:',
    staticDir: null,
    runtime: metered,
    env: {},
    maintenanceDelayMs: 5,
    webhooks: { allowHosts: ['127.0.0.1'], retryMs: [], pageSettleMs: 30 },
  });
  opened.push(app);
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = (app.server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}/api/v1`;
  const { store, seats, engine, asks } = app;
  const dylan = store.createHuman('Dylan');
  const maya = store.createHuman('Maya');
  const launch = store.createProject(dylan.id, 'Launch');
  store.addMember(dylan.id, launch.id, maya.id);
  const { seat, token } = seats.create(dylan.id, { name: 'Grok', spaceId: launch.id });
  const snap = (userId: string) =>
    store.snapshot(userId, [], { id: metered.id, label: metered.label });
  const general = snap(dylan.id).conversations.find(
    (c) => c.kind === 'channel' && c.spaceId === launch.id,
  )!;
  const workspaceAgent = store.projectAgent(launch.id)!;
  const call = async (method: string, path: string, data?: unknown) => {
    const res = await fetch(base + path, {
      method,
      headers: { authorization: `Bearer ${token.token}`, 'content-type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: res.status, body: (await res.json()) as any };
  };
  // The owner's side, signed in as a person.
  const owner = async (method: string, path: string, data?: unknown, as = dylan.id) => {
    const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method,
      headers: {
        cookie: `sw_session=${store.createSession(as)}`,
        'x-workstation': '1',
        'content-type': 'application/json',
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: res.status, body: (await res.json()) as any };
  };
  return {
    app,
    store,
    engine,
    asks,
    dylan,
    maya,
    launch,
    seat,
    general,
    workspaceAgent,
    call,
    owner,
  };
}

test('seat asks: it asks the workspace agent, and the answer comes back to it', async () => {
  const { store, engine, maya, general, workspaceAgent, call, app } = await setup();
  const events: any[] = [];
  const receiver = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    events.push(JSON.parse(body));
    res.end();
  });
  await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
  const hookUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hook`;
  assert.equal((await call('POST', '/webhooks', { url: hookUrl })).status, 200);
  const agents = await call('GET', `/chats/${general.id}/agents`);
  assert.deepEqual(
    agents.body.map((a: any) => a.id),
    [workspaceAgent.id],
  );
  const asked = await call('POST', `/chats/${general.id}/messages`, {
    text: 'When does the launch ship?',
    ask: workspaceAgent.id,
  });
  assert.equal(asked.status, 200);
  await engine.idle();
  const messages = (await call('GET', `/chats/${general.id}/messages`)).body;
  const answer = messages.find((m: any) => m.replyTo === asked.body.id);
  assert.ok(answer, 'answered in the thread of its question');
  assert.equal(answer.author.id, workspaceAgent.id);
  assert.equal(answer.toMe, true);
  assert.deepEqual(
    (await call('GET', '/inbox')).body.map((m: any) => m.id),
    [answer.id],
  );
  await app.webhooks.idle();
  const sent = events.find((e) => e.data.message.id === answer.id);
  assert.equal(sent?.data.message.toMe, true, 'its webhook hears the answer is for it');
  await new Promise((r) => receiver.close(r));
  const used = await call('GET', '/asks');
  assert.equal(used.body.usedToday, 15_000, 'its own allowance pays for it');
  assert.equal(used.body.tokensPerDay, 40_000);

  // A plain message starts nothing.
  const before = store.snapshot(maya.id, [], { id: 'metered', label: 'Metered' }).messages.length;
  await call('POST', `/chats/${general.id}/messages`, { text: 'Thanks.' });
  await engine.idle();
  assert.equal(
    store.snapshot(maya.id, [], { id: 'metered', label: 'Metered' }).messages.length,
    before + 1,
  );
});

test('seat asks: only workspace agents, never in a DM, and only within its allowance', async () => {
  const { store, engine, maya, seat, general, workspaceAgent, call, owner } = await setup();
  const mayasAgent = store.personalAgent(maya.id)!;
  let n = 0;
  // Each question differs, so no answer is reused from the agent's cache.
  const ask = (agentId: string, chatId = general.id) =>
    call('POST', `/chats/${chatId}/messages`, { text: `Status ${++n}?`, ask: agentId });
  assert.equal((await ask(mayasAgent.id)).status, 400, "not someone's own agent");
  assert.equal((await ask(seat.agent.id)).status, 400, 'not a seat');
  assert.equal((await ask('made-up')).status, 400);
  const dm = store.openDm(maya.id, seat.agent.id);
  assert.equal((await ask(workspaceAgent.id, dm.id)).status, 400, 'not in a DM');

  // Two asks use 30k of its 40k; the third still goes through, and after that it is turned away.
  for (let i = 0; i < 3; i++) {
    assert.equal((await ask(workspaceAgent.id)).status, 200);
    await engine.idle();
  }
  const turnedAway = await ask(workspaceAgent.id);
  assert.equal(turnedAway.status, 429);
  assert.match(turnedAway.body.error, /today's allowance/);

  // Its owner raises it, or turns asking off; nobody else can.
  assert.equal((await owner('GET', `/seats/${seat.agent.id}/asks`)).body.usedToday, 45_000);
  const raised = await owner('POST', `/seats/${seat.agent.id}/asks`, { tokensPerDay: 100_000 });
  assert.equal(raised.body.leftToday, 55_000);
  assert.equal((await ask(workspaceAgent.id)).status, 200);
  await engine.idle();
  await owner('POST', `/seats/${seat.agent.id}/asks`, { tokensPerDay: 0 });
  assert.match((await ask(workspaceAgent.id)).body.error, /turned off/);
  assert.equal(
    (await owner('POST', `/seats/${seat.agent.id}/asks`, { tokensPerDay: -5 })).status,
    400,
  );
  const asMaya = await owner('POST', `/seats/${seat.agent.id}/asks`, { tokensPerDay: 1 }, maya.id);
  assert.equal(asMaya.status, 403, 'only its owner sets it');
});

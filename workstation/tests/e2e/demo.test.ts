// Two people in two browsers against a real server. Needs `npm run build` first.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { createApp } from '../../server/app.ts';
import { scriptedRuntime } from '../../server/agents/scripted.ts';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
let app: ReturnType<typeof createApp>;
let browser: Browser;
let base = '';

before(async () => {
  assert.ok(existsSync(dist), 'Run `npm run build` before the e2e test.');
  app = createApp({
    dbPath: ':memory:',
    staticDir: dist,
    runtime: scriptedRuntime,
    maintenanceDelayMs: 50,
  });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  // CHROMIUM_PATH lets a machine with its own Chromium build run this without a download.
  browser = await chromium.launch(
    process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : process.env.CI
        ? {}
        : { channel: 'chrome' },
  );
});

after(async () => {
  await browser?.close();
  await app?.close();
});

async function join(name: string): Promise<Page> {
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => assert.fail(`page error for ${name}: ${error.message}`));
  await page.goto(base);
  await page.getByPlaceholder('Name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await page.getByRole('navigation', { name: 'Space' }).waitFor();
  return page;
}
const row = (page: Page, name: string) =>
  page.locator('.sidebar .list-row', { hasText: name }).first();
const newPage = async (page: Page, kind: string, title: string, mine = false) => {
  await page.getByRole('button', { name: 'New page' }).last().click();
  await page.getByRole('radio', { name: new RegExp(`^${kind}`) }).click();
  await page.getByLabel('Title').last().fill(title);
  if (mine) await page.getByRole('radio', { name: 'Only you' }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.locator('.pane-title input').waitFor();
};

test('two people: shared pages, comments an agent resolves, a shared canvas, channels, and a private agent', async () => {
  const dylan = await join('Dylan');
  const maya = await join('Maya');

  // Dylan makes a shared space and adds Maya.
  await dylan.locator('.space-name').click();
  await dylan.getByRole('menuitem', { name: 'New shared space' }).click();
  await dylan.getByLabel('Name the shared space').fill('Launch');
  await dylan.getByLabel('Name the shared space').press('Enter');
  await dylan.locator('.space-name', { hasText: 'Launch' }).waitFor();
  await dylan.getByRole('button', { name: 'Invite people' }).click();
  await dylan.getByRole('button', { name: 'Add Maya' }).click();
  await dylan.keyboard.press('Escape');
  await maya.locator('.space-name').click();
  await maya.getByRole('menuitemradio', { name: 'Launch' }).click();

  // A document they both see; typing saves and reaches the other person.
  await newPage(dylan, 'Document', 'Brief');
  await dylan.locator('.tiptap').click();
  await dylan.keyboard.type('Boxes cost $58 for 50.');
  await dylan.getByText('Saved').waitFor();
  await row(maya, 'Brief').click();
  await maya.locator('.tiptap', { hasText: 'Boxes cost $58 for 50.' }).waitFor();

  // A private page stays out of Maya's list.
  await newPage(dylan, 'Document', 'Only for Dylan', true);
  await row(dylan, 'Only for Dylan').waitFor();
  assert.equal(await row(maya, 'Only for Dylan').count(), 0);

  // Dylan selects text and asks the space's agent to change it; Maya accepts the suggestion.
  await row(dylan, 'Brief').click();
  await dylan.locator('.tiptap p', { hasText: 'Boxes cost' }).click({ clickCount: 3 });
  await dylan.getByRole('button', { name: 'Ask an agent' }).click();
  await dylan.getByLabel('Which agent').selectOption({ index: 1 });
  await dylan
    .getByLabel('What should the agent do')
    .fill('replace this with: Boxes cost $61 for 60.');
  await dylan.getByLabel('What should the agent do').press('Enter');
  await maya.getByRole('button', { name: 'Accept' }).click();
  await dylan.locator('.tiptap', { hasText: 'Boxes cost $61 for 60.' }).waitFor();
  await maya.locator('.tiptap', { hasText: 'Boxes cost $61 for 60.' }).waitFor();

  // The page's own feed is shared by the people on the page.
  await dylan.getByLabel(/Say something to everyone on this page/).fill('Deciding Friday.');
  await dylan.getByLabel(/Say something to everyone on this page/).press('Enter');
  await maya.locator('.page-feed .msg', { hasText: 'Deciding Friday.' }).waitFor();

  // Dylan's own agent answers only Dylan.
  await dylan.getByLabel(/Ask Dylan's agent/).fill('summarize this');
  await dylan.getByLabel(/Ask Dylan's agent/).press('Enter');
  await dylan.locator('.bar-thread .msg.from-agent').waitFor();
  await dylan.locator('.bar-panel').getByRole('button', { name: 'Close' }).click();
  await maya.locator('.bar-history').click();
  assert.equal(await maya.locator('.bar-thread .msg').count(), 0);
  await maya.locator('.bar-panel').getByRole('button', { name: 'Close' }).click();

  // A canvas arranged together: Dylan places a sticky, Maya moves it, Dylan sees it move.
  await newPage(dylan, 'Canvas', 'Board');
  await dylan.getByRole('button', { name: /Sticky note/ }).click();
  const area = (await dylan.locator('.canvas-scroll').boundingBox())!;
  await dylan.mouse.click(area.x + 400, area.y + 260);
  await dylan.locator('.piece textarea').fill('Ask about the van');
  await dylan.keyboard.press('Escape');
  await row(maya, 'Board').click();
  const theirs = maya.locator('.piece', { hasText: 'Ask about the van' });
  await theirs.waitFor();
  // The canvas settles its view just after opening; measure once it has.
  await maya.waitForTimeout(500);
  const mine = dylan.locator('.piece', { hasText: 'Ask about the van' });
  const before = (await mine.boundingBox())!;
  const grab = (await theirs.boundingBox())!;
  await maya.mouse.move(grab.x + 30, grab.y + 30);
  await maya.mouse.down();
  await maya.mouse.move(grab.x + 230, grab.y + 110, { steps: 6 });
  await maya.mouse.up();
  await dylan.waitForFunction((x) => {
    const el = [...document.querySelectorAll('.piece')].find((p) =>
      p.textContent?.includes('Ask about the van'),
    );
    return !!el && Math.abs(el.getBoundingClientRect().x - x) > 100;
  }, before.x);

  // A channel placed on the canvas is a live window: what is said in it shows there, for both people.
  await dylan.evaluate(async () => {
    const snap = await (await fetch('/api/snapshot')).json();
    const board = snap.resources.find((r: any) => r.kind === 'canvas' && r.title === 'Board');
    const general = snap.conversations.find((c: any) => c.kind === 'channel');
    await fetch('/api/resources', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-workstation': '1' },
      body: JSON.stringify({
        spaceId: board.spaceId,
        parentId: board.id,
        kind: 'embed',
        body: JSON.stringify({ conversationId: general.id }),
        placement: { x: 96, y: 480, width: 360, height: 280 },
      }),
    });
  });
  await maya.locator('.embed.window').getByLabel('Message #general').fill('Said from the canvas.');
  await maya.locator('.embed.window').getByLabel('Message #general').press('Enter');
  await dylan.locator('.embed.window .window-feed', { hasText: 'Said from the canvas.' }).waitFor();

  // A channel: Maya writes, Dylan sees it unread in the list and then in the feed.
  await row(maya, 'general').click();
  await maya.getByLabel('Message #general').fill('Stall is confirmed.');
  await maya.getByLabel('Message #general').press('Enter');
  await dylan.locator('.sidebar .list-row.unread', { hasText: 'general' }).waitFor();
  await row(dylan, 'general').click();
  await dylan.locator('.feed .msg', { hasText: 'Stall is confirmed.' }).waitFor();

  // The graph shows Dylan's private page to Dylan only.
  await row(dylan, 'Graph').click();
  await dylan.locator('.graph-node.is-private', { hasText: 'Only for Dylan' }).waitFor();
  await row(maya, 'Graph').click();
  await maya.locator('.graph-node', { hasText: 'Brief' }).waitFor();
  assert.equal(await maya.locator('.graph-node', { hasText: 'Only for Dylan' }).count(), 0);
});

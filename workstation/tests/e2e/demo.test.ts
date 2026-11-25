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

/** Joins as a new person, then starts a workspace or looks around their private space first. */
async function join(name: string, startWorkspace?: string): Promise<Page> {
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => assert.fail(`page error for ${name}: ${error.message}`));
  await page.goto(base);
  await page.getByPlaceholder('Name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  if (startWorkspace) {
    await page.getByLabel('Workspace name').fill(startWorkspace);
    await page.getByRole('button', { name: 'Start', exact: true }).click();
  } else await page.getByRole('button', { name: 'Look around my private space first' }).click();
  await page.getByRole('navigation', { name: 'Space' }).waitFor();
  return page;
}
const row = (page: Page, name: string) =>
  page.locator('.sidebar .list-row', { hasText: name }).first();
const newPage = async (page: Page, kind: string, title: string, mine = false) => {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Page', exact: true }).click();
  const form = page.getByRole('form', { name: 'New page' });
  await form.getByRole('radio', { name: new RegExp(`^${kind}`) }).click();
  await form.getByLabel('Title').fill(title);
  if (mine) await form.getByLabel('Who can open it').selectOption('mine');
  await form.getByRole('button', { name: 'Create', exact: true }).click();
  await form.waitFor({ state: 'detached' });
  await page.locator('.pane-title input').waitFor();
};

test('two people: shared pages, comments an agent resolves, a shared canvas, channels, and a private agent', async () => {
  // Dylan starts a workspace on his way in; Maya looks around her private space first.
  const dylan = await join('Dylan', 'Launch');
  const maya = await join('Maya');

  // Dylan adds Maya to his workspace.
  await dylan.locator('.space-name', { hasText: 'Launch' }).waitFor();
  await dylan.locator('.space-people').click();
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

  // Pinning a page puts it at the top of everyone's list, marked for their agents.
  await row(dylan, 'Brief').click({ button: 'right' });
  await dylan.getByRole('menuitem', { name: 'Pin for everyone and their agents' }).click();
  await maya
    .locator('.sidebar .list-row:has([aria-label="Pinned"])', { hasText: 'Brief' })
    .waitFor();

  // A private page stays out of Maya's list.
  await newPage(dylan, 'Document', 'Only for Dylan', true);
  await row(dylan, 'Only for Dylan').waitFor();
  assert.equal(await row(maya, 'Only for Dylan').count(), 0);

  // Dylan selects text and asks the space's agent to change it; Maya accepts the suggestion.
  await row(dylan, 'Brief').click();
  // Clear the selection left from asking the agent, so its toolbar is out of the way.
  await dylan
    .locator('.tiptap p', { hasText: 'Boxes cost' })
    .click({ position: { x: 615, y: 12 } });
  await dylan.locator('.select-tools').waitFor({ state: 'detached' });
  await dylan.locator('.tiptap p', { hasText: 'Boxes cost' }).click({ clickCount: 3 });
  await dylan.getByRole('button', { name: 'Comment' }).click();
  await dylan.getByLabel('Ask an agent to answer here').selectOption({ index: 1 });
  await dylan
    .getByLabel('Comment', { exact: true })
    .fill('replace this with: Boxes cost $61 for 60.');
  await dylan.getByLabel('Comment', { exact: true }).press('Enter');
  // Beside the text a comment is a small mark; opening it shows the suggestion to accept.
  await maya.locator('.cface').first().click();
  await maya.getByRole('button', { name: 'Accept' }).click();
  await dylan.locator('.tiptap', { hasText: 'Boxes cost $61 for 60.' }).waitFor();
  await maya.locator('.tiptap', { hasText: 'Boxes cost $61 for 60.' }).waitFor();

  // The page's own feed is shared by the people on the page.
  await dylan.getByLabel(/Say something to everyone on this page/).fill('Deciding Friday.');
  await dylan.getByLabel(/Say something to everyone on this page/).press('Enter');
  await maya.locator('.page-feed .msg', { hasText: 'Deciding Friday.' }).waitFor();

  // Each sees where the other is in the document, by name.
  await maya.locator('.tiptap p', { hasText: 'Boxes cost' }).click();
  await dylan.locator('.team-caret', { hasText: 'Maya' }).waitFor();
  // Clear the selection left from asking the agent, so its toolbar is out of the way.
  await dylan
    .locator('.tiptap p', { hasText: 'Boxes cost' })
    .click({ position: { x: 615, y: 12 } });
  await dylan.locator('.select-tools').waitFor({ state: 'detached' });
  await dylan.locator('.tiptap p', { hasText: 'Boxes cost' }).click({ clickCount: 3 });
  await maya.locator('.team-caret', { hasText: 'Dylan' }).waitFor();
  await maya.locator('.team-selection').first().waitFor();
  // Turning off "Teammates' cursors" hides them for you at once.
  await dylan.keyboard.press('Escape');
  await dylan.keyboard.press('Control+,');
  await dylan
    .getByRole('radiogroup', { name: "Teammates' cursors" })
    .getByRole('radio', { name: 'Hide' })
    .click();
  await dylan.locator('.team-caret').waitFor({ state: 'detached' });
  await dylan
    .getByRole('radiogroup', { name: "Teammates' cursors" })
    .getByRole('radio', { name: 'Show' })
    .click();
  await dylan.keyboard.press('Escape');
  await maya.locator('.tiptap p', { hasText: 'Boxes cost' }).click();
  await dylan.locator('.team-caret', { hasText: 'Maya' }).waitFor();
  // Turning off "Share my cursor" takes yours away from everyone else straight away.
  await maya.keyboard.press('Control+,');
  await maya
    .getByRole('radiogroup', { name: 'Share my cursor' })
    .getByRole('radio', { name: 'Off' })
    .click();
  await dylan.locator('.team-caret', { hasText: 'Maya' }).waitFor({ state: 'detached' });
  await maya
    .getByRole('radiogroup', { name: 'Share my cursor' })
    .getByRole('radio', { name: 'On' })
    .click();
  await maya.keyboard.press('Escape');

  // Dylan's own agent, on the right, answers only Dylan.
  await dylan.getByLabel('Ask your agent').fill('summarize this');
  await dylan.getByLabel('Ask your agent').press('Enter');
  await dylan.locator('.rail .rail-answer').waitFor();
  await maya.locator('.rail').waitFor();
  assert.equal(await maya.locator('.rail .rail-answer').count(), 0);
  // Selecting text and asking points the rail at it; the answer shows what it was about.
  await dylan
    .locator('.tiptap p', { hasText: 'Boxes cost' })
    .click({ position: { x: 615, y: 12 } });
  await dylan.locator('.select-tools').waitFor({ state: 'detached' });
  await dylan.locator('.tiptap p', { hasText: 'Boxes cost' }).click({ clickCount: 3 });
  await dylan.getByRole('button', { name: 'Ask an agent' }).click();
  await dylan.locator('.rail-asking', { hasText: 'Boxes cost' }).waitFor();
  await dylan.getByLabel('Ask your agent').fill('is this right?');
  await dylan.getByLabel('Ask your agent').press('Enter');
  await dylan.locator('.rail-answer .rail-ref', { hasText: 'Boxes cost' }).waitFor();
  // Sharing an answer: the main chat is offered, and the message says whose agent it came from.
  await dylan.locator('.rail-answer').last().getByRole('button', { name: 'Share' }).click();
  await dylan.getByRole('menuitem', { name: /general/ }).click();
  await dylan.locator('.rail-shared', { hasText: 'general' }).waitFor();
  await row(maya, 'general').click();
  await maya.locator('.feed .msg', { hasText: 'from Dylan’s agent' }).waitFor();
  // ⌘J puts you in your agent's box; pressed there, it folds the rail to a slim strip.
  await dylan.keyboard.press('Control+j');
  await dylan.waitForFunction(
    () => document.activeElement?.getAttribute('aria-label') === 'Ask your agent',
  );
  await dylan.keyboard.press('Control+j');
  await dylan.locator('.rail-strip').waitFor();
  await dylan.locator('.rail-strip').click();
  await dylan.locator('.rail .rail-top').waitFor();
  // Your agent has one home, the rail. Its page is for setting it up: no second way to talk to it,
  // and nothing opens its conversation in the middle.
  await dylan.getByRole('button', { name: 'Close · ⌘J' }).click();
  await dylan.locator('.rail-strip').waitFor();
  await row(dylan, "Dylan's agent").click();
  await dylan.locator('.agent-page').waitFor();
  assert.equal(await dylan.getByRole('button', { name: /^Talk to / }).count(), 0);
  // A routine set up on its page reads back as one sentence.
  await dylan.getByRole('button', { name: 'New routine' }).click();
  await dylan.getByLabel('What to do').fill('Summarise what changed');
  await dylan.getByRole('button', { name: 'Add routine' }).click();
  await dylan.locator('.routines', { hasText: 'Weekdays at 09:00' }).waitFor();
  await dylan.locator('.rail-strip').click();
  await dylan.locator('.rail .rail-top').waitFor();
  assert.equal(await dylan.locator('.pane-chat').count(), 0);

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

  // Agents are tagged in the feed: "@" suggests them, and the tagged one answers in the thread.
  const box = dylan.getByLabel('Message #general');
  await box.click();
  await box.pressSequentially('@Laun');
  await dylan.getByRole('listbox', { name: 'Tag an agent' }).waitFor();
  await box.press('Enter');
  await box.pressSequentially('summarize');
  await dylan.getByText('Launch agent will answer here').waitFor();
  await box.press('Enter');
  await dylan.locator('.feed .msg .mention', { hasText: '@Launch agent' }).first().waitFor();
  await maya.locator('.feed .msg.from-agent', { hasText: 'Launch' }).first().waitFor();

  // The graph shows Dylan's private page to Dylan only.
  await dylan.getByRole('button', { name: 'See as a map' }).click();
  await dylan.locator('.graph-node.is-private', { hasText: 'Only for Dylan' }).waitFor();
  await maya.getByRole('button', { name: 'See as a map' }).click();
  await maya.locator('.graph-node', { hasText: 'Brief' }).waitFor();
  assert.equal(await maya.locator('.graph-node', { hasText: 'Only for Dylan' }).count(), 0);
});

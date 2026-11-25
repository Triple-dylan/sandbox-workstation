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
const browserErrors: string[] = [];

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
  browser = await chromium.launch(process.env.CI ? {} : { channel: 'chrome' });
});

after(async () => {
  await browser?.close();
  await app?.close();
  assert.deepEqual(browserErrors, [], 'No rendering errors or duplicate React keys');
});

async function join(name: string): Promise<Page> {
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
  page.on('console', (message) => {
    if (/same key|unique.*key|Minified React error/i.test(message.text()))
      browserErrors.push(message.text());
  });
  await page.goto(base);
  await page.getByPlaceholder('Name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await page.getByRole('navigation', { name: 'Navigation', exact: true }).waitFor();
  return page;
}

const composer = (page: Page) => page.locator('.composer textarea');

test('a single recipient is a label, including inside the personal conversation', async () => {
  const page = await join('Solo reviewer');
  try {
    await page.getByText('To: Your agent', { exact: true }).waitFor();
    assert.equal(await page.locator('button.audience-chip').count(), 0);
    await page.getByRole('button', { name: 'Open work with Your agent', exact: true }).click();
    await page.getByRole('heading', { name: 'Your agent', exact: true }).waitFor();
    assert.equal(await page.locator('button.audience-chip').count(), 0);
    await composer(page).fill('Private draft');
    await page.getByRole('button', { name: 'Canvas', exact: true }).click();
    await page.getByRole('button', { name: 'Open work with Your agent', exact: true }).click();
    assert.equal(await composer(page).inputValue(), 'Private draft');
  } finally {
    await page.context().close();
  }
});

test('two people: private agent, shared canvas, discuss, and an approved agent proposal', async () => {
  const dylan = await join('Dylan');
  const maya = await join('Maya');
  try {
    await scenario(dylan, maya);
  } catch (error) {
    await dylan.screenshot({ path: 'test-results/e2e-dylan.png' });
    await maya.screenshot({ path: 'test-results/e2e-maya.png' });
    throw error;
  }
});

async function scenario(dylan: Page, maya: Page) {
  // Situation 2: a private question to your own agent, from a fresh personal space.
  await assert.doesNotReject(dylan.getByText('To: Your agent').waitFor());
  await composer(dylan).fill('What can you do?');
  await composer(dylan).press('Enter');
  await dylan.locator('.conversation .from-agent').first().waitFor();

  // A project, shared with Maya.
  await dylan.getByRole('button', { name: 'New project' }).click();
  await dylan.getByLabel('New project name').fill('Launch');
  await dylan.getByLabel('New project name').press('Enter');
  await dylan.getByText('To: Launch agent').waitFor();
  await dylan.getByRole('button', { name: 'Add', exact: true }).click();
  await dylan.locator('.add-people').getByRole('button', { name: 'Maya' }).click();

  // Blank canvas: click empty space and type.
  await dylan.locator('.canvas').click({ position: { x: 160, y: 140 } });
  await dylan.keyboard.type('Pricing tiers draft');
  await dylan.keyboard.press('Escape');
  await dylan.locator('.canvas-item').first().waitFor();

  // Maya sees the project and the note live.
  await maya.getByRole('button', { name: 'Open Launch workspace', exact: true }).click();
  const note = maya.locator('.canvas-item textarea');
  await note.waitFor();
  await maya.waitForFunction(
    () =>
      document.querySelector<HTMLTextAreaElement>('.canvas-item textarea')?.value ===
      'Pricing tiers draft',
  );

  // Clicking an existing identity opens its private chat; group navigation retains its draft.
  await maya
    .getByRole('navigation', { name: 'Navigation', exact: true })
    .getByRole('button', { name: 'general', exact: true })
    .click();
  await composer(maya).fill('Group draft');
  await maya.getByRole('button', { name: 'Message Launch agent privately', exact: true }).click();
  await maya.getByText('To: Launch agent', { exact: true }).waitFor();
  assert.equal(await composer(maya).inputValue(), '');
  await composer(maya).fill('Private check');
  await composer(maya).press('Enter');
  await maya.locator('.conversation .from-agent').waitFor();
  await maya
    .getByRole('navigation', { name: 'Navigation', exact: true })
    .getByRole('button', { name: 'general', exact: true })
    .click();
  assert.equal(await composer(maya).inputValue(), 'Group draft');
  assert.equal(await maya.getByText('Private check', { exact: true }).count(), 0);
  await composer(maya).fill('Hello group without a mention');
  await composer(maya).press('Enter');
  await dylan
    .getByRole('navigation', { name: 'Navigation', exact: true })
    .getByRole('button', { name: 'general', exact: true })
    .click();
  await dylan.getByText('Hello group without a mention', { exact: true }).waitFor();
  assert.equal(await dylan.getByText('Private check', { exact: true }).count(), 0);
  await dylan.getByRole('button', { name: 'Canvas', exact: true }).click();

  await maya.getByRole('button', { name: 'Canvas', exact: true }).click();

  // Situation 4: discuss the selected work.
  await maya.locator('.canvas-item').hover();
  await maya.getByRole('button', { name: 'Discuss' }).click();
  await maya.getByText(/To: Discuss/).waitFor();
  await composer(maya).fill('Can we drop the middle tier?');
  await composer(maya).press('Enter');
  await maya.locator('.conversation .anchor').waitFor();
  await dylan
    .locator('nav .rail-row')
    .filter({ hasText: 'Pricing tiers draft' })
    .getByLabel(/\d+ unread/)
    .waitFor();

  // Situation 1: instruct the project agent; it proposes, a person approves.
  await composer(dylan).fill('create a doc called Launch plan');
  await composer(dylan).press('Enter');
  await dylan.getByRole('heading', { name: 'create a doc called Launch plan' }).waitFor();
  await dylan.getByRole('button', { name: 'Approve', exact: true }).click();
  await dylan.getByText(/approved by Dylan/).waitFor();
  assert.ok(
    (
      await maya.evaluate(() =>
        fetch('/api/snapshot', { headers: { 'x-workstation': '1' } }).then((r) => r.json()),
      )
    ).resources.some((r: { title: string }) => r.title === 'Launch plan'),
  );
}

test('Graph centers its subject, springs back after drag and opens nested folders', async () => {
  const page = await join('Graph reviewer');
  try {
    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByLabel('New project name').fill('Graph fixture');
    await page.getByLabel('New project name').press('Enter');
    await page.getByText('To: Graph fixture agent').waitFor();
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    const root = page.locator('.graph-node.kind-root');
    const bounds = (await page.locator('.graph').boundingBox())!;
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    await page.waitForFunction(
      ({ cx, cy }) => {
        const box = document.querySelector('.graph-node.kind-root')?.getBoundingClientRect();
        return box && Math.hypot(cx - box.x - box.width / 2, cy - box.y - box.height / 2) < 2;
      },
      { cx, cy },
    );
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 100, cy, { steps: 8 });
    await page.waitForFunction(
      ({ cx }) => {
        const box = document.querySelector('.graph-node.kind-root')?.getBoundingClientRect();
        return box && box.x + box.width / 2 - cx > 10;
      },
      { cx },
    );
    const held = (await root.boundingBox())!;
    assert.ok(held.x + held.width / 2 - cx <= 25);
    await page.mouse.up();
    await page.waitForFunction(
      ({ cx }) => {
        const box = document.querySelector('.graph-node.kind-root')?.getBoundingClientRect();
        return box && Math.abs(cx - box.x - box.width / 2) < 2;
      },
      { cx },
    );
    await page.locator('.graph-node').getByText('Resources & context', { exact: true }).click();
    await page.locator('.graph-node').getByText('Research', { exact: true }).waitFor();
    await page.locator('.graph-node.kind-root').click();
    assert.equal(await page.getByRole('button', { name: 'Full graph' }).count(), 0);
    await page
      .locator('.graph-node')
      .getByText('Research', { exact: true })
      .waitFor({ state: 'hidden' });
  } finally {
    await page.context().close();
  }
});

test('navigation resizes and hides while floating tools minimize without resizing the canvas', async () => {
  const page = await join('Layout reviewer');
  try {
    const nav = page.getByRole('navigation', { name: 'Navigation', exact: true });
    const canvas = page.locator('.canvas');
    const width = async () => (await canvas.boundingBox())!.width;
    const initialWidth = await width();
    const handle = page.getByRole('separator', { name: 'Resize navigation' });
    const bounds = (await handle.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 80);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 40, bounds.y + 80, { steps: 4 });
    await page.mouse.up();
    assert.equal(await width(), initialWidth - 40);
    await handle.press('ArrowRight');
    assert.equal(await width(), initialWidth - 56);
    await page.getByRole('button', { name: 'Hide navigation' }).click();
    await nav.waitFor({ state: 'hidden' });
    assert.equal((await canvas.boundingBox())!.x, 52);
    assert.equal(await width(), 1388);
    await page.getByRole('button', { name: 'Show navigation' }).click();
    await nav.waitFor();
    assert.equal(await width(), initialWidth - 56);

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 820, height: 700 },
    ]) {
      await page.setViewportSize(viewport);
      const before = await width();
      const agent = page.getByRole('region', { name: 'Your agent' });
      const card = (await agent.boundingBox())!;
      const surface = (await canvas.boundingBox())!;
      assert.equal(surface.y, 0);
      assert.equal(surface.height, viewport.height);
      assert.ok(card.x > surface.x && card.x + card.width < viewport.width);
      await agent.getByRole('button', { name: 'Minimize Your agent' }).click();
      await agent.locator('.tool-body').waitFor({ state: 'hidden' });
      assert.equal(await width(), before);
      assert.ok((await agent.boundingBox())!.height < card.height);
      await agent.getByRole('button', { name: 'Expand Your agent' }).click();
      await agent.locator('.tool-body').waitFor();
      assert.equal(await width(), before);
    }
  } finally {
    await page.context().close();
  }
});

test('a specialist joins the project roster and its settings persist', async () => {
  const page = await join('Specialist reviewer');
  try {
    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByLabel('New project name').fill('Studio');
    await page.getByLabel('New project name').press('Enter');
    await page.getByRole('button', { name: 'Deploy agent in Studio' }).click();
    await page.getByLabel('New agent name').fill('Researcher');
    await page.getByLabel('New agent name').press('Enter');
    await page.getByRole('heading', { name: 'Researcher' }).waitFor();
    await page.locator('summary').filter({ hasText: 'About Researcher' }).click();
    await page.getByLabel('Instructions').fill('Cite sources');
    await page.getByLabel('Skills').fill('Research');
    await page.getByLabel('Document proposals').uncheck();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await page.reload();
    await page.locator('summary').filter({ hasText: 'About Researcher' }).click();
    assert.equal(await page.getByLabel('Instructions').inputValue(), 'Cite sources');
    assert.equal(await page.getByLabel('Skills').inputValue(), 'Research');
    assert.equal(await page.getByLabel('Document proposals').isChecked(), false);
    await page.getByText('To: Researcher').waitFor();
    await page.getByRole('button', { name: 'general', exact: true }).click();
    await page.getByRole('heading', { name: '#general' }).waitFor();
    assert.equal(await page.locator('.canvas').isVisible(), false);
    await page.getByRole('button', { name: 'Canvas', exact: true }).click();
    await page.locator('.canvas').waitFor();
    await page.getByText('To: Studio agent').waitFor();
  } finally {
    await page.context().close();
  }
});

test('navigation disclosure, resources, Graph reader, profile and transitions preserve context', async () => {
  const page = await join('Preview checklist');
  try {
    assert.match(
      await page.evaluate(() => getComputedStyle(document.documentElement).fontFamily),
      /^Arial/,
    );
    const strip = page.getByRole('navigation', { name: 'App navigation' });
    const menu = page.getByRole('navigation', { name: 'Navigation', exact: true });
    assert.equal(
      (await strip.boundingBox())!.x + (await strip.boundingBox())!.width,
      (await menu.boundingBox())!.x,
    );
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    await page.getByLabel('New project name').fill('Preview project');
    await page.getByLabel('New project name').press('Enter');
    for (const name of ['general', 'planning', 'resources', 'updates', 'Project agent'])
      await menu.getByRole('button', { name, exact: true }).waitFor();
    assert.equal(
      await page.locator('.audience-menu, button.audience-chip, .space-switcher').count(),
      0,
    );
    await menu.getByRole('button', { name: 'planning', exact: true }).click();
    await composer(page).fill('Keep this draft');
    await menu.getByRole('button', { name: 'Preview project', exact: true }).click();
    await page.getByRole('heading', { name: '#planning' }).waitFor();
    assert.equal(await composer(page).inputValue(), 'Keep this draft');
    await menu.getByRole('button', { name: 'Personal', exact: true }).click();
    assert.equal(await composer(page).inputValue(), 'Keep this draft');
    await menu.getByRole('button', { name: 'Preview project', exact: true }).click();
    await page
      .getByRole('region', { name: 'Project resources' })
      .getByRole('button', { name: 'Orientation', exact: true })
      .click();
    await page.getByRole('article', { name: 'Orientation' }).waitFor();
    await page.getByRole('heading', { name: '#planning' }).waitFor();
    assert.equal(await composer(page).inputValue(), 'Keep this draft');
    assert.equal(await page.locator('.side, .with-reader').count(), 0);
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    const graphBefore = (await page.locator('.graph').boundingBox())!;
    assert.ok((await page.locator('.graph-node').count()) >= 5);
    await page.locator('.graph-node').getByText('Orientation', { exact: true }).click();
    await page.getByRole('article', { name: 'Orientation' }).waitFor();
    assert.deepEqual(await page.locator('.graph').boundingBox(), graphBefore);
    const sheet = (await page.locator('.surface-reader').boundingBox())!;
    assert.ok(sheet.height < graphBefore.height * 0.7);
    const tools = (await page.locator('.utilities').boundingBox())!;
    assert.ok(sheet.x + sheet.width < tools.x);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Body', { exact: true }).fill('Unsaved document draft');
    await page.getByRole('button', { name: 'Close reader' }).click();
    await page.locator('.graph-node').getByText('Orientation', { exact: true }).click();
    assert.equal(
      await page.getByLabel('Body', { exact: true }).inputValue(),
      'Unsaved document draft',
    );
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Canvas', exact: true }).click();
    await page.locator('.canvas').waitFor();
    assert.equal(
      await page.locator('.graph, .graph-back, .surface-reader').count(),
      0,
      await page
        .locator('.graph, .graph-back, .surface-reader')
        .evaluateAll((nodes) => nodes.map((node) => node.outerHTML.slice(0, 300)).join('\n')),
    );
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await page.locator('.graph-node.kind-root').click();
    await menu.getByRole('button', { name: 'planning', exact: true }).click();
    assert.equal(await composer(page).inputValue(), 'Keep this draft');
    await strip.getByRole('button', { name: 'Open my profile' }).click();
    await page.getByText('Your account').waitFor();
    await page.getByLabel('Appearance').selectOption('dark');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.getByRole('button', { name: 'Return to work' }).click();
    await page.getByRole('heading', { name: '#planning' }).waitFor();
    assert.equal(await composer(page).inputValue(), 'Keep this draft');
    await page.reload();
    assert.equal(await composer(page).inputValue(), 'Keep this draft');
  } finally {
    await page.context().close();
  }
});

test('new personal chats preserve separate histories and drafts across reload', async () => {
  const page = await join('Personal chat reviewer');
  try {
    await composer(page).fill('My first personal conversation');
    await composer(page).press('Enter');
    await page
      .getByRole('heading', { name: 'My first personal conversation', exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'New chat', exact: true }).click();
    await composer(page).fill('My second personal conversation');
    await composer(page).press('Enter');
    await page
      .getByRole('heading', { name: 'My second personal conversation', exact: true })
      .waitFor();
    await composer(page).fill('Second chat draft');
    const menu = page.getByRole('navigation', { name: 'Navigation', exact: true });
    await menu.getByRole('button', { name: 'My first personal conversation', exact: true }).click();
    assert.equal(await composer(page).inputValue(), '');
    await composer(page).fill('First chat draft');
    await menu
      .getByRole('button', { name: 'My second personal conversation', exact: true })
      .click();
    assert.equal(await composer(page).inputValue(), 'Second chat draft');
    await page.reload();
    assert.equal(await composer(page).inputValue(), 'Second chat draft');
    await menu.getByRole('button', { name: 'My first personal conversation', exact: true }).click();
    assert.equal(await composer(page).inputValue(), 'First chat draft');
  } finally {
    await page.context().close();
  }
});

test('switching accounts in one browser cannot reuse another persons drafts', async () => {
  const page = await join('Draft owner');
  try {
    await composer(page).fill('Only the draft owner should see this');
    await page.getByRole('button', { name: 'Open my profile' }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByPlaceholder('Name').fill('Different account');
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await composer(page).waitFor();
    assert.equal(await composer(page).inputValue(), '');
    assert.equal(await page.getByText('Only the draft owner should see this').count(), 0);
    await page.getByRole('button', { name: 'Open my profile' }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('button', { name: /Draft owner/ }).click();
    await page.getByRole('button', { name: 'Return to work' }).click();
    await composer(page).waitFor();
    assert.equal(await composer(page).inputValue(), 'Only the draft owner should see this');
  } finally {
    await page.context().close();
  }
});

test('Graph placement measures Canvas after a viewport change and selects the real document', async () => {
  const page = await join('Placement reviewer');
  try {
    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByLabel('New project name').fill('Placement project');
    await page.getByLabel('New project name').press('Enter');
    await page.getByText('To: Placement project agent').waitFor();
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await page.setViewportSize({ width: 1000, height: 760 });
    await page.locator('.graph-node').filter({ hasText: 'Orientation' }).click();
    await page.getByRole('button', { name: 'Place on canvas', exact: true }).click();
    const item = page.locator('.canvas-item.selected');
    await item.waitFor();
    const card = (await item.boundingBox())!;
    const canvas = (await page.locator('.canvas').boundingBox())!;
    assert.ok(card.x >= canvas.x && card.y >= canvas.y);
    assert.ok(card.x + card.width <= canvas.x + canvas.width);
    assert.ok(card.y + card.height <= canvas.y + canvas.height);
    const snapshot = await page.evaluate(() => fetch('/api/snapshot').then((r) => r.json()));
    assert.equal(
      snapshot.resources.filter(
        (r: { title: string; placement: unknown }) => r.title === 'Orientation' && r.placement,
      ).length,
      1,
    );
  } finally {
    await page.close();
  }
});

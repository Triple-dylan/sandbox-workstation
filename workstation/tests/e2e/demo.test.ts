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
  browser = await chromium.launch(process.env.CI ? {} : { channel: 'chrome' });
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
  await page.goto(base);
  await page.getByPlaceholder('Name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await page.getByRole('navigation', { name: 'Navigation' }).waitFor();
  return page;
}

const composer = (page: Page) => page.locator('.composer textarea');

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
  await dylan.getByText('To: #general').waitFor();
  await dylan.getByRole('button', { name: /^Add/ }).click();
  await dylan.locator('.add-people').getByRole('button', { name: 'Maya' }).click();

  // Blank canvas: click empty space and type.
  await dylan.locator('.canvas').click({ position: { x: 160, y: 140 } });
  await dylan.keyboard.type('Pricing tiers draft');
  await dylan.keyboard.press('Escape');
  await dylan.locator('.canvas-item').first().waitFor();

  // Maya sees the project and the note live.
  await maya.getByRole('button', { name: 'Launch', exact: true }).click();
  const note = maya.locator('.canvas-item textarea');
  await note.waitFor();
  assert.equal(await note.inputValue(), 'Pricing tiers draft');

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
  await dylan.locator('.audience-chip').click();
  await dylan.getByRole('option', { name: /Ask Launch agent/ }).click();
  await composer(dylan).fill('create a doc called Launch plan');
  await composer(dylan).press('Enter');
  await dylan.getByRole('button', { name: 'Approve' }).first().click();
  await dylan.getByText(/approved by Dylan/).waitFor();
  assert.ok(
    (
      await maya.evaluate(() =>
        fetch('/api/snapshot', { headers: { 'x-workstation': '1' } }).then((r) => r.json()),
      )
    ).resources.some((r: { title: string }) => r.title === 'Launch plan'),
  );
}

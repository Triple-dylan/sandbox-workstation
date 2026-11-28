// Downloading and deleting your data from Settings, in a browser against a real server. Needs `npm run build` first.
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
  app = createApp({ dbPath: ':memory:', staticDir: dist, runtime: scriptedRuntime });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
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

async function join(name: string, startWorkspace?: string): Promise<Page> {
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => assert.fail(`page error for ${name}: ${error.message}`));
  await page.goto(base);
  await page.getByPlaceholder('Name').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  if (startWorkspace) {
    await page.getByLabel('Workspace name').fill(startWorkspace);
    await page.getByRole('button', { name: 'Start', exact: true }).click();
  } else await page.getByRole('button', { name: 'Look around my private space first' }).click();
  await page.getByRole('navigation', { name: 'Space', exact: true }).waitFor();
  return page;
}

const openSettings = async (page: Page, name: string) => {
  await page.getByRole('button', { name: `${name}: settings and sign out` }).click();
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  return page.getByRole('dialog', { name: 'Settings' });
};

test('settings: download my data, and delete my data asks for your name, refuses while others are in your workspace, then signs you out', async () => {
  const owner = await join('Rosa', 'Garden');
  const settings = await openSettings(owner, 'Rosa');
  await settings.getByRole('button', { name: 'Delete my data…' }).click();
  const typed = settings.getByLabel('Type your name to delete your data');
  const remove = settings.getByRole('button', { name: 'Delete', exact: true });
  assert.equal(await remove.isDisabled(), true, 'nothing goes until the name is typed');
  await typed.fill('rosa');
  assert.equal(await remove.isDisabled(), true, 'the name exactly');
  await settings.getByRole('button', { name: 'Keep', exact: true }).click();
  await settings.getByRole('button', { name: 'Delete my data…' }).waitFor();

  // Someone else joins Rosa's workspace: she can't delete her data until she deletes it.
  const rosa = app.store.profiles().find((p) => p.name === 'Rosa')!;
  const garden = app.store
    .memberSpaces(rosa.id)
    .find((id) => app.store.space(id)?.name === 'Garden')!;
  const ben = app.store.createHuman('Ben');
  app.store.addMember(rosa.id, garden, ben.id);
  await settings.getByRole('button', { name: 'Delete my data…' }).click();
  await typed.fill('Rosa');
  await remove.click();
  await owner.getByText(/You started Garden, and others are still in it/).waitFor();
  assert.equal(app.store.user(rosa.id)!.name, 'Rosa');

  // Someone with only their own space deletes their data and lands back at the sign-in page.
  const solo = await join('Ines');
  const ines = app.store.profiles().find((p) => p.name === 'Ines')!;
  const theirs = await openSettings(solo, 'Ines');
  // First they can download what is theirs.
  const download = theirs.getByRole('link', { name: 'Download', exact: true });
  const href = (await download.getAttribute('href'))!;
  const mine = await solo.evaluate(
    (url) => fetch(url).then((r) => r.json() as Promise<{ profile: { name: string } }>),
    href,
  );
  assert.equal(mine.profile.name, 'Ines');
  await theirs.getByRole('button', { name: 'Delete my data…' }).click();
  await theirs.getByLabel('Type your name to delete your data').fill('Ines');
  await theirs.getByRole('button', { name: 'Delete', exact: true }).click();
  await solo.getByPlaceholder('Name').waitFor();
  assert.equal(app.store.user(ines.id)!.name, 'Deleted person');
  assert.equal(app.store.personalSpace(ines.id), null);
});

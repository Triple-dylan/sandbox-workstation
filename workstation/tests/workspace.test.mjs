import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

let browser;
const base = process.env.WORKSTATION_URL || 'http://127.0.0.1:4174';
before(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
});
after(async () => {
  await browser?.close();
});
async function session(size = { width: 1440, height: 1000 }, options = {}) {
  const context = await browser.newContext({ viewport: size, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  return { context, page, errors };
}
async function project(page) {
  await page.getByRole('button', { name: 'Show conversation list', exact: true }).click();
  await page.getByRole('button', { name: '# product-direction', exact: true }).click();
}
async function arrangement(page) {
  await project(page);
  await page.getByRole('button', { name: 'Open context graph', exact: true }).click();
  await page.getByRole('button', { name: 'Rebuild plan', exact: true }).click();
  await page.waitForTimeout(200);
}
async function geometry(page) {
  return page
    .locator('[data-pane]')
    .evaluateAll((els) =>
      els
        .filter(
          (el) =>
            getComputedStyle(el).visibility !== 'hidden' &&
            el.getBoundingClientRect().width > 0 &&
            el.getBoundingClientRect().height > 0,
        )
        .map((el) => ({ id: el.dataset.pane, rect: el.getBoundingClientRect().toJSON() })),
    );
}
async function assertAllocated(page) {
  const panes = await geometry(page);
  const work = await page.getByRole('main', { name: 'Work area', exact: true }).boundingBox();
  assert(work);
  for (const { id, rect: r } of panes) {
    assert(r.width >= 285, `${id} unreadable width ${r.width}`);
    assert(r.height >= 170, `${id} unreadable height ${r.height}`);
    assert(
      r.x >= work.x - 1 && r.right <= work.x + work.width + 1,
      `${id} outside horizontal allocation`,
    );
    assert(
      r.y >= work.y - 1 && r.bottom <= work.y + work.height + 1,
      `${id} outside vertical allocation`,
    );
  }
  for (let i = 0; i < panes.length; i++)
    for (let j = i + 1; j < panes.length; j++) {
      const a = panes[i].rect,
        b = panes[j].rect;
      const overlap =
        Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1;
      assert(!overlap, `${panes[i].id} overlaps ${panes[j].id}`);
    }
  return panes;
}

test('fresh entry stays blank and contains no rejected composer controls', async () => {
  const { context, page, errors } = await session();
  try {
    assert.equal(await page.locator('[data-pane]').count(), 0);
    assert.equal(await page.locator('h1').count(), 0);
    assert.equal(await page.getByRole('button', { name: /zoom|physics|agent$/i }).count(), 0);
    assert.equal(await page.locator('#composer').inputValue(), '');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

for (const [width, height] of [
  [1280, 800],
  [1440, 1000],
  [1920, 1080],
  [1280, 720],
])
  test(`conversation, graph, viewer and concurrent utilities allocate at ${width}×${height}`, async () => {
    const { context, page, errors } = await session({ width, height });
    try {
      await arrangement(page);
      const panes = await assertAllocated(page);
      assert.deepEqual(panes.map((p) => p.id).sort(), ['conversation', 'document', 'graph']);
      for (const label of ['Sources and context', 'Project agent', 'Goals'])
        assert.equal(await page.getByRole('region', { name: label, exact: true }).count(), 1);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });

test('document selection reuses a viewer and never changes recipient or conversation/thread drafts', async () => {
  const { context, page } = await session();
  try {
    await arrangement(page);
    await page.locator('#composer').fill('Unsent project draft');
    await page.getByRole('button', { name: 'Research review', exact: true }).click();
    assert.equal(await page.locator('[data-pane="document"]').count(), 1);
    assert.equal(await page.locator('#composer').inputValue(), 'Unsent project draft');
    assert.match(await page.locator('#composer').getAttribute('placeholder'), /product-direction/);
    await page.getByRole('button', { name: 'Reply', exact: true }).first().click();
    assert.equal(await page.locator('#composer').inputValue(), '');
    await page.locator('#composer').fill('Unsent thread draft');
    await page.getByRole('button', { name: 'Exit thread reply', exact: true }).click();
    assert.equal(await page.locator('#composer').inputValue(), 'Unsent project draft');
    await page.getByRole('button', { name: 'Reply', exact: true }).first().click();
    assert.equal(await page.locator('#composer').inputValue(), 'Unsent thread draft');
    await page.getByRole('button', { name: 'Personal notes', exact: true }).click();
    assert.equal(await page.locator('#composer').inputValue(), '');
    await page.locator('#composer').fill('Private draft');
    await page.getByRole('button', { name: '# product-direction', exact: true }).click();
    assert.equal(await page.locator('#composer').inputValue(), 'Unsent project draft');
    await page.reload();
    assert.equal(await page.locator('#composer').inputValue(), 'Unsent project draft');
  } finally {
    await context.close();
  }
});

test('graph folders explore, document focus preserves graph, and subject springs home', async () => {
  const { context, page } = await session({ width: 1920, height: 1080 });
  try {
    await arrangement(page);
    await page.locator('[data-node="direction"]').press('Enter');
    assert.equal(await page.locator('[data-pane="explorer"]').count(), 1);
    assert.equal(await page.locator('[data-pane="graph"]').count(), 1);
    await page.locator('[data-node="context"]').press('Enter');
    assert.equal(await page.locator('[data-pane="document"]').count(), 1);
    await page.getByRole('button', { name: 'Full graph', exact: true }).click();
    await page.waitForTimeout(900);
    const root = page.locator('[data-node="root"]');
    const start = await root.boundingBox();
    const stage = await page.locator('.graph-stage').boundingBox();
    await page.mouse.move(start.x + start.width / 2, start.y + 30);
    await page.mouse.down();
    await page.mouse.move(start.x + 180, start.y + 150, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(1600);
    const end = await root.getAttribute('transform');
    const coords = end
      .match(/translate\(([^,]+),([^)]+)\)/)
      .slice(1)
      .map(Number);
    assert(Math.abs(coords[0] - stage.width / 2) < 2, 'subject did not return horizontally');
    assert(Math.abs(coords[1] - stage.height / 2) < 2, 'subject did not return vertically');
    await assertAllocated(page);
  } finally {
    await context.close();
  }
});

test('canceled drags leave arrangement unchanged; a valid placement snaps without overlap', async () => {
  const { context, page } = await session();
  try {
    await arrangement(page);
    const before = await geometry(page);
    const header = await page.locator('[data-pane="document"] .module-header').boundingBox();
    await page.mouse.move(header.x + 50, header.y + 20);
    await page.mouse.down();
    await page.mouse.move(10, 300, { steps: 8 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.deepEqual(await geometry(page), before);
    const target = await page.locator('[data-pane="graph"]').boundingBox();
    await page.mouse.move(header.x + 55, header.y + 20);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + 12, { steps: 12 });
    assert.equal(await page.locator('.snap-preview').count(), 1);
    await page.mouse.up();
    await page.waitForTimeout(200);
    await assertAllocated(page);
    assert.notDeepEqual(await geometry(page), before);
    assert.equal(await page.locator('.snap-preview').count(), 0);
  } finally {
    await context.close();
  }
});

test('splitters support keyboard resizing and utilities collapse/reflow independently', async () => {
  const { context, page } = await session();
  try {
    await arrangement(page);
    const sash = page
      .getByRole('separator', { name: 'Resize panes horizontally', exact: true })
      .first();
    const value = Number(await sash.getAttribute('aria-valuenow'));
    await sash.focus();
    await sash.press('ArrowRight');
    assert.notEqual(Number(await sash.getAttribute('aria-valuenow')), value);
    await assertAllocated(page);
    const source = page.getByRole('region', { name: 'Sources and context', exact: true });
    const initial = (await source.boundingBox()).height;
    await page
      .getByRole('separator', { name: 'Resize sources and agent', exact: true })
      .press('ArrowDown');
    assert((await source.boundingBox()).height > initial);
    await page.getByRole('button', { name: 'Collapse sources', exact: true }).click();
    assert((await source.boundingBox()).height <= 46);
    assert.equal(await page.getByRole('region', { name: 'Goals', exact: true }).isVisible(), true);
    await page.getByRole('button', { name: 'Expand sources', exact: true }).click();
    await assertAllocated(page);
  } finally {
    await context.close();
  }
});

test('small-window recovery keeps allocations bounded and restores after room returns', async () => {
  const { context, page } = await session();
  try {
    await arrangement(page);
    await page.locator('#composer').fill('Keep this draft');
    await page.setViewportSize({ width: 900, height: 650 });
    await page.waitForTimeout(300);
    await assertAllocated(page);
    assert.equal(await page.locator('#composer').inputValue(), 'Keep this draft');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForTimeout(150);
    const restore = page.getByRole('button', { name: 'Restore arrangement', exact: true });
    if (await restore.count()) await restore.click();
    await assertAllocated(page);
    assert.equal((await geometry(page)).length, 3);
  } finally {
    await context.close();
  }
});

test('OS appearance, direct message drafts and account settings have real local behavior', async () => {
  const { context, page } = await session(undefined, { colorScheme: 'dark' });
  try {
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.getByRole('button', { name: 'Account and appearance', exact: true }).click();
    assert.match(await page.locator('.account-pop').innerText(), /No account is connected/);
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Show conversation list', exact: true }).click();
    await page.getByRole('button', { name: 'Start a direct message', exact: true }).click();
    await page.getByPlaceholder('Name or email').fill('teammate@example.com');
    await page.getByRole('button', { name: 'Open draft', exact: true }).click();
    assert.match(
      await page.locator('#composer').getAttribute('placeholder'),
      /teammate@example.com/,
    );
    await page.locator('#composer').fill('Hello');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    assert.match(await page.getByRole('status').innerText(), /No message was delivered/);
    assert.match(await page.locator('.transcript').innerText(), /Hello/);
  } finally {
    await context.close();
  }
});

test('attaching context never submits the pending message', async () => {
  const { context, page } = await session();
  try {
    await page.getByRole('button', { name: 'Conversations', exact: true }).click();
    await page.locator('#composer').fill('Do not send this');
    await page.getByRole('button', { name: 'Attach context', exact: true }).click();
    await page.getByRole('button', { name: 'Rebuild plan', exact: true }).click();
    assert.equal(await page.locator('#composer').inputValue(), 'Do not send this');
    assert.doesNotMatch(await page.locator('.transcript').innerText(), /Do not send this/);
    await assertAllocated(page);
  } finally {
    await context.close();
  }
});

test('pointer resizing and a saved work-pane arrangement restore without losing the document or draft', async () => {
  const { context, page } = await session();
  try {
    await arrangement(page);
    await page.locator('#composer').fill('Saved draft');
    const sash = await page
      .getByRole('separator', { name: 'Resize panes vertically', exact: true })
      .boundingBox();
    await page.mouse.move(sash.x + sash.width / 2, sash.y + sash.height / 2);
    await page.mouse.down();
    await page.mouse.move(sash.x + sash.width / 2, sash.y + 65, { steps: 10 });
    await page.mouse.up();
    await assertAllocated(page);
    const saved = await geometry(page);
    await page.getByLabel('Layout actions', { exact: true }).click();
    await page.getByRole('button', { name: 'Save arrangement', exact: true }).click();
    await page.getByRole('button', { name: 'Close document', exact: true }).click();
    await page.getByRole('button', { name: 'Restore arrangement', exact: true }).click();
    assert.deepEqual(await geometry(page), saved);
    assert.equal(await page.locator('#composer').inputValue(), 'Saved draft');
    await assertAllocated(page);
  } finally {
    await context.close();
  }
});

test('damaged local state is rejected without crashing the workspace', async () => {
  const context = await browser.newContext();
  await context.addInitScript(() =>
    localStorage.setItem(
      'workstation-layout-proof-v1',
      JSON.stringify({
        document: 'missing',
        selected: 'missing',
        theme: 'rainbow',
        conversations: [{ id: 1 }],
        goals: [null],
        utilities: ['invalid'],
      }),
    ),
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(base);
    await page.getByRole('button', { name: 'Conversations', exact: true }).click();
    assert.equal(await page.locator('[data-pane="conversation"]').count(), 1);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

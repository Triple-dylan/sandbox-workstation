import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
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
  await page.getByRole('button', { name: 'Canvas', exact: true }).waitFor();
  return { page, context, errors };
}
async function project(page) {
  await page.getByRole('button', { name: 'Conversations', exact: true }).click();
  await page.getByRole('button', { name: '# product-direction', exact: true }).click();
}
async function openTool(page, name) {
  await page.getByRole('button', { name: 'Open work', exact: true }).click();
  const command =
    name === 'Browser'
      ? 'Browser connection'
      : name === 'Agent settings'
        ? 'Edit project agent'
        : name;
  if (name === 'Browser')
    await page
      .getByRole('textbox', { name: 'Find work or an action', exact: true })
      .fill('Browser');
  await page
    .locator('.work-results')
    .getByRole('button', { name: new RegExp('^' + command) })
    .click();
}
async function graphFillsSurface(page) {
  await page.getByRole('main', { name: 'Graph canvas', exact: true }).waitFor({ state: 'visible' });
  await page.locator('.graph-stage').waitFor({ state: 'visible' });
  const main = await page.getByRole('main', { name: 'Graph canvas', exact: true }).boundingBox();
  const graph = await page.locator('.graph-stage').boundingBox();
  assert(main && graph);
  for (const key of ['x', 'y', 'width', 'height'])
    assert(Math.abs(main[key] - graph[key]) < 1, `Graph does not fill main ${key}`);
  assert.equal(await page.locator('[data-pane]').count(), 0);
  return main;
}
async function objects(page) {
  return page
    .locator('[data-object]')
    .evaluateAll((els) =>
      els.map((el) => ({ id: el.dataset.object, rect: el.getBoundingClientRect().toJSON() })),
    );
}
async function validObjects(page) {
  const area = await page.getByRole('main', { name: 'Working canvas', exact: true }).boundingBox();
  const all = await objects(page);
  for (const o of all) {
    const r = o.rect;
    assert(r.width >= 298 && r.height >= 218, `${o.id} too small`);
    assert(
      r.x >= area.x - 0.5 &&
        r.y >= area.y - 0.5 &&
        r.right <= area.x + area.width + 0.5 &&
        r.bottom <= area.y + area.height + 0.5,
      `${o.id} outside canvas`,
    );
  }
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i].rect,
        b = all[j].rect;
      assert(
        !(
          Math.min(a.right, b.right) > Math.max(a.x, b.x) + 1 &&
          Math.min(a.bottom, b.bottom) > Math.max(a.y, b.y) + 1
        ),
        'Working objects overlap',
      );
    }
  return all;
}
async function stored(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('workstation-layout-proof-v1')));
}

test('fresh Canvas remains open space and starts in a private conversation', async () => {
  const { context, page, errors } = await session();
  try {
    assert.equal(await page.locator('[data-object]').count(), 0);
    assert.equal(await page.locator('h1').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Open work', exact: true }).count(), 1);
    assert.equal(await page.getByRole('complementary').count(), 0);
    assert.equal(await page.locator('#composer').getAttribute('placeholder'), 'Message…');
    assert.equal(await page.getByRole('button', { name: /zoom|physics|^agent$/i }).count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
for (const [width, height] of [
  [1280, 720],
  [1440, 1000],
  [1920, 1080],
])
  test(`Graph is the entire primary surface at ${width}×${height}`, async () => {
    const { context, page, errors } = await session({ width, height });
    try {
      await page.getByRole('button', { name: 'Graph', exact: true }).click();
      const area = await graphFillsSurface(page);
      assert(area.width > width * 0.9);
      assert.equal(await page.locator('.canvas-object').count(), 0);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });

test('rail navigation never creates or rearranges canvas work', async () => {
  const { context, page, errors } = await session();
  try {
    await openTool(page, 'Browser');
    const original = (await stored(page)).objects;
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    assert.equal(
      await page.getByRole('complementary', { name: 'Resource navigation', exact: true }).count(),
      1,
    );
    assert.equal(
      await page.getByRole('complementary', { name: 'Resource inspection', exact: true }).count(),
      0,
    );
    await project(page);
    assert.equal(
      await page.getByRole('complementary', { name: 'Conversation history', exact: true }).count(),
      1,
    );
    assert.equal(
      await page.getByRole('complementary', { name: 'Project utilities', exact: true }).count(),
      0,
    );
    await graphFillsSurface(page);
    assert.deepEqual((await stored(page)).objects, original);
    await page.getByRole('button', { name: 'Hide left navigation', exact: true }).click();
    await page.getByRole('button', { name: 'Canvas', exact: true }).click();
    assert.deepEqual((await stored(page)).objects, original);
    await validObjects(page);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('Goals remains content-sized after closing other utilities; dates are optional', async () => {
  const { context, page } = await session();
  try {
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await page.getByRole('button', { name: 'Project tools', exact: true }).click();
    const goals = page.getByRole('region', { name: 'Goals', exact: true });
    const before = await goals.boundingBox();
    assert.equal(await goals.locator('input[type=date]').count(), 0);
    await page.getByRole('button', { name: 'Hide sources', exact: true }).click();
    await page.getByRole('button', { name: 'Hide agent', exact: true }).click();
    const after = await goals.boundingBox();
    assert(Math.abs(before.height - after.height) < 2);
    assert(after.height < 300);
    assert(after.height < 1000 * 0.35);
    await graphFillsSurface(page);
    await goals
      .getByRole('button', { name: /^Set due date/ })
      .first()
      .focus();
    await goals
      .getByRole('button', { name: /^Set due date/ })
      .first()
      .click();
    const date = goals.locator('input[type=date]');
    await date.fill('2026-11-04');
    await date.press('Tab');
    assert.equal((await stored(page)).goals[0].due, '2026-11-04');
    await page.getByRole('button', { name: 'Collapse goals', exact: true }).click();
    assert((await goals.boundingBox()).height < 48);
    await page.getByRole('button', { name: 'Expand goals', exact: true }).click();
    assert((await goals.boundingBox()).height < 330);
  } finally {
    await context.close();
  }
});

test('Graph → folder → document reuses one inspection and retains conversation and orientation', async () => {
  const { context, page, errors } = await session();
  try {
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await project(page);
    await page.locator('#composer').fill('Keep this project draft');
    await page.locator('[data-node="direction"]').press('Enter');
    const inspector = page.getByRole('complementary', { name: 'Resource inspection', exact: true });
    assert.equal(await inspector.count(), 1);
    await inspector.getByRole('button', { name: 'Rebuild plan', exact: true }).click();
    await inspector
      .getByRole('heading', { name: 'Workstation rebuild proposal', exact: true })
      .waitFor();
    assert.equal(await inspector.count(), 1);
    assert.equal(await page.locator('.document-view').count(), 1);
    assert.equal(await page.locator('[data-object]').count(), 0);
    await graphFillsSurface(page);
    assert.equal(await page.locator('#composer').inputValue(), 'Keep this project draft');
    await page.getByRole('button', { name: 'Back to folder', exact: true }).click();
    assert.equal(
      await inspector.getByRole('button', { name: 'Rebuild plan', exact: true }).count(),
      1,
    );
    await page.getByRole('button', { name: 'Close inspection', exact: true }).click();
    assert.equal(await inspector.count(), 0);
    assert.equal(await page.locator('.graph-view').getAttribute('data-subject'), 'direction');
    await page.getByRole('button', { name: 'Full graph', exact: true }).click();
    assert.equal(await page.locator('.graph-view').getAttribute('data-subject'), 'root');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('reader reuses one viewer, preserves main/thread/DM drafts and recipient', async () => {
  const { context, page } = await session();
  try {
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await project(page);
    await page.locator('#composer').fill('Main draft');
    await page.getByRole('button', { name: 'Reply in thread', exact: true }).first().click();
    assert.equal(await page.locator('#composer').inputValue(), '');
    await page.locator('#composer').fill('Thread draft');
    await page.getByRole('button', { name: 'Exit thread reply', exact: true }).click();
    assert.equal(await page.locator('#composer').inputValue(), 'Main draft');
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await page.getByRole('button', { name: 'Research review', exact: true }).click();
    assert.equal(await page.locator('#composer').inputValue(), 'Main draft');
    assert.match(await page.locator('#composer').getAttribute('aria-label'), /product-direction/);
    await page.getByRole('button', { name: 'Rebuild plan', exact: true }).click();
    assert.equal(await page.locator('.document-view').count(), 1);
    await page.getByRole('button', { name: 'Conversations', exact: true }).click();
    await page.getByRole('button', { name: 'Personal notes', exact: true }).click();
    assert.equal(await page.locator('#composer').inputValue(), '');
    await page.locator('#composer').fill('Private draft');
    await page.getByRole('button', { name: 'Back to conversations', exact: true }).click();
    await page.getByRole('button', { name: '# product-direction', exact: true }).click();
    assert.equal(await page.locator('#composer').inputValue(), 'Main draft');
    await page.getByRole('button', { name: 'Reply in thread', exact: true }).first().click();
    assert.equal(await page.locator('#composer').inputValue(), 'Thread draft');
    await page.reload();
    assert.equal(await page.locator('#composer').inputValue(), 'Thread draft');
  } finally {
    await context.close();
  }
});

test('one document viewer moves deliberately onto Canvas; navigation does not manufacture another', async () => {
  const { context, page } = await session();
  try {
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await page.getByRole('button', { name: 'Rebuild plan', exact: true }).click();
    await page.getByRole('button', { name: 'Hide left navigation', exact: true }).click();
    await page.getByRole('button', { name: 'Place document on canvas', exact: true }).click();
    assert.equal(await page.getByRole('main', { name: 'Working canvas', exact: true }).count(), 1);
    assert.equal(await page.locator('[data-object=document]').count(), 1);
    assert.equal(
      await page.getByRole('complementary', { name: 'Resource inspection', exact: true }).count(),
      0,
    );
    await validObjects(page);
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await page.getByRole('button', { name: 'Research review', exact: true }).click();
    assert.equal((await stored(page)).objects.filter((o) => o.id === 'document').length, 0);
    assert.equal(await page.locator('.document-view').count(), 1);
    await page.getByRole('button', { name: 'Close inspection', exact: true }).click();
    await page.getByRole('button', { name: 'Canvas', exact: true }).click();
    assert.equal(await page.locator('[data-object=document]').count(), 0);
  } finally {
    await context.close();
  }
});

test('intentional tools leave open space; pointer drag cancels and snaps without overlap', async () => {
  const { context, page, errors } = await session();
  try {
    await openTool(page, 'Browser');
    await openTool(page, 'Agent settings');
    const before = await validObjects(page);
    const area = await page
      .getByRole('main', { name: 'Working canvas', exact: true })
      .boundingBox();
    assert(
      before.reduce((a, b) => a + b.rect.width * b.rect.height, 0) < area.width * area.height * 0.7,
    );
    const header = await page.locator('[data-object=browser] .object-header').boundingBox();
    await page.mouse.move(header.x + 80, header.y + 18);
    await page.mouse.down();
    await page.mouse.move(800, 700, { steps: 10 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.deepEqual(await objects(page), before);
    await page.mouse.move(header.x + 80, header.y + 18);
    await page.mouse.down();
    await page.mouse.move(header.x + 80, header.y + 418, { steps: 10 });
    assert.equal((await page.locator('.placement-preview').count()) > 0, true);
    await page.mouse.up();
    assert.notDeepEqual(await objects(page), before);
    await validObjects(page);
    await page.getByRole('button', { name: 'Focus browser', exact: true }).click();
    assert.equal(await page.locator('[data-object]').count(), 1);
    await page.getByRole('button', { name: 'Restore canvas arrangement', exact: true }).click();
    assert.equal(await page.locator('[data-object]').count(), 2);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('canvas keyboard move/resize and personal preset preserve records', async () => {
  const { context, page } = await session();
  try {
    await openTool(page, 'Browser');
    const move = page.getByLabel('Move browser', { exact: true });
    const start = (await objects(page))[0];
    await move.focus();
    await move.press('ArrowRight');
    assert((await objects(page))[0].rect.x > start.rect.x);
    await page.getByRole('button', { name: 'Resize browser', exact: true }).press('ArrowDown');
    await validObjects(page);
    await page.getByRole('button', { name: 'Open work', exact: true }).click();
    await page.getByRole('button', { name: /^Save arrangement/ }).click();
    const saved = (await stored(page)).objects;
    await page.getByRole('button', { name: 'Close browser', exact: true }).click();
    await page.getByRole('button', { name: 'Open work', exact: true }).click();
    await page.getByRole('button', { name: /^Restore arrangement/ }).click();
    assert.deepEqual((await stored(page)).objects, saved);
    await validObjects(page);
  } finally {
    await context.close();
  }
});

test('narrow-window inspection retains drafts and a usable full graph surface', async () => {
  const { context, page, errors } = await session();
  try {
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await project(page);
    await page.locator('#composer').fill('Retain draft during resize');
    await page.locator('[data-node="direction"]').press('Enter');
    await page.getByRole('button', { name: 'Rebuild plan', exact: true }).click();
    await page.setViewportSize({ width: 900, height: 650 });
    await page.waitForTimeout(200);
    const area = await graphFillsSurface(page);
    assert(area.width >= 300);
    assert.equal(await page.locator('#composer').inputValue(), 'Retain draft during resize');
    assert.equal(await page.locator('.document-view').count(), 1);
    await page.getByRole('button', { name: 'Close inspection', exact: true }).click();
    assert((await graphFillsSurface(page)).width > 800);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('subject node remains centered after a bounded drag', async () => {
  const { context, page } = await session();
  try {
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await page.waitForTimeout(300);
    const root = page.locator('[data-node=root]'),
      start = await root.boundingBox(),
      stage = await page.locator('.graph-stage').boundingBox();
    await page.mouse.move(start.x + start.width / 2, start.y + 30);
    await page.mouse.down();
    await page.mouse.move(start.x + 200, start.y + 140, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(1400);
    const xy = (await root.getAttribute('transform'))
      .match(/translate\(([^,]+),([^)]+)\)/)
      .slice(1)
      .map(Number);
    assert(Math.abs(xy[0] - stage.width / 2) < 2);
    assert(Math.abs(xy[1] - stage.height / 2) < 2);
  } finally {
    await context.close();
  }
});

test('unconnected people search is honest and existing DM drafts retain context', async () => {
  const { context, page } = await session();
  try {
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('workstation-layout-proof-v1'));
      s.conversations.push({
        id: 'legacy-dm',
        kind: 'dm',
        title: 'Existing teammate draft',
        recipient: 'teammate@example.com',
        messages: [],
      });
      localStorage.setItem('workstation-layout-proof-v1', JSON.stringify(s));
    });
    await page.reload();
    await page.getByRole('button', { name: 'Conversations', exact: true }).click();
    await page.getByRole('button', { name: 'Start a direct message', exact: true }).click();
    assert.match(
      await page.locator('.contact-picker').innerText(),
      /No workspace identity is connected/,
    );
    assert.equal(await page.getByPlaceholder('Name or email').count(), 0);
    await page
      .locator('.contact-picker')
      .getByRole('button', { name: 'Conversations', exact: true })
      .click();
    await page.getByRole('button', { name: 'Existing teammate draft', exact: true }).click();
    await page.locator('#composer').fill('Hello');
    await page.getByRole('button', { name: 'Attach context', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Attach a document' })
      .getByRole('button', { name: 'Rebuild plan', exact: true })
      .click();
    assert.equal(await page.locator('#composer').inputValue(), 'Hello');
    assert.doesNotMatch(await page.locator('.transcript').innerText(), /Hello/);
    assert.equal(await page.locator('[data-object]').count(), 0);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    assert.match(await page.getByRole('status').innerText(), /Delivery is not connected/);
    assert.match(await page.locator('.transcript').innerText(), /Hello/);
    const m = (await stored(page)).conversations.find((c) => c.id === 'legacy-dm').messages[0];
    assert.equal(m.sources[0], 'plan');
    assert.equal(m.delivery, 'local');
  } finally {
    await context.close();
  }
});

test('legacy records migrate without restoring rejected windows; OS appearance remains', async () => {
  const context = await browser.newContext({ colorScheme: 'dark' });
  await context.addInitScript(() => {
    if (!localStorage.getItem('workstation-layout-proof-v1'))
      localStorage.setItem(
        'workstation-layout-proof-v1',
        JSON.stringify({
          selected: 'personal',
          conversations: [
            { id: 'personal', title: 'Existing conversation', kind: 'private', messages: [] },
          ],
          drafts: { personal: 'Existing draft' },
          theme: 'system',
          layout: { grid: { root: 'legacy' } },
        }),
      );
  });
  const page = await context.newPage();
  try {
    await page.goto(base);
    await page.getByRole('button', { name: 'Canvas', exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.equal(await page.locator('#composer').inputValue(), 'Existing draft');
    assert.equal(await page.locator('[data-object]').count(), 0);
    assert((await stored(page)).legacyLayout);
    await page.getByRole('button', { name: 'Account and appearance', exact: true }).click();
    assert.match(await page.locator('.account-pop').innerText(), /No account is connected/);
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.reload();
    assert.equal(await page.locator('#composer').inputValue(), 'Existing draft');
  } finally {
    await context.close();
  }
});

test('failed source fetch shows recovery state while preserving graph and draft', async () => {
  const { context, page, errors } = await session();
  try {
    let failed = true;
    await page.route('**/resources/Rebuild%20Plan.md', (route) =>
      failed
        ? route.fulfill({ status: 503, body: 'Unavailable' })
        : route.fulfill({
            status: 200,
            body: '# Recovered document\n\nThe source is available again.',
          }),
    );
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await page.locator('#composer').fill('Safe draft');
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await page.getByRole('button', { name: 'Rebuild plan', exact: true }).click();
    await page.getByText('Document could not be loaded', { exact: true }).waitFor();
    failed = false;
    await page.getByRole('button', { name: 'Retry document', exact: true }).click();
    await page.getByRole('heading', { name: 'Recovered document', exact: true }).waitFor();
    assert.equal(await page.locator('#composer').inputValue(), 'Safe draft');
    await graphFillsSurface(page);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('edge snapping reflows only the two requested canvas tools', async () => {
  const { context, page } = await session();
  try {
    await openTool(page, 'Browser');
    await openTool(page, 'Agent settings');
    const before = await validObjects(page);
    const a = before.find((o) => o.id === 'browser').rect,
      b = await page.locator('[data-object="agent-settings"] .object-header').boundingBox();
    await page.mouse.move(b.x + 80, b.y + 18);
    await page.mouse.down();
    await page.mouse.move(a.right, a.y + a.height / 2, { steps: 12 });
    assert.equal(await page.locator('.placement-preview').count(), 2);
    await page.mouse.up();
    const after = await validObjects(page);
    assert.equal(after.length, 2);
    assert.notDeepEqual(after, before);
    assert(Math.abs(after[0].rect.width - after[1].rect.width) < 1);
  } finally {
    await context.close();
  }
});

test('canvas resize recovery retains both objects and restores their prior arrangement', async () => {
  const { context, page, errors } = await session();
  try {
    await openTool(page, 'Browser');
    await openTool(page, 'Agent settings');
    const before = (await stored(page)).objects;
    await page.setViewportSize({ width: 900, height: 650 });
    await page.waitForTimeout(200);
    await validObjects(page);
    assert.equal((await stored(page)).objects.length, 2);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForTimeout(200);
    assert.equal((await objects(page)).length, 2);
    assert.deepEqual((await stored(page)).objects, before);
    await validObjects(page);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('Graph keeps its width and nodes remain accessible beside compact utilities', async () => {
  const { context, page } = await session();
  try {
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    const before = await graphFillsSurface(page);
    await page.getByRole('button', { name: 'Project tools', exact: true }).click();
    assert.equal(
      await page.getByRole('complementary', { name: 'Resource inspection', exact: true }).count(),
      0,
    );
    await page.getByRole('button', { name: 'Expand direction', exact: true }).click();
    await page.waitForTimeout(800);
    const after = await graphFillsSurface(page);
    assert.equal(after.width, before.width);
    const blocked = await page
      .getByRole('complementary', { name: 'Project utilities', exact: true })
      .boundingBox();
    const center = await page.locator('.graph-stage').boundingBox();
    const nodes = await page
      .locator('[data-node]')
      .evaluateAll((els) =>
        els.map((el) => ({ id: el.dataset.node, position: el.getAttribute('transform') })),
      );
    for (const n of nodes) {
      const [x, y] = n.position
        .match(/translate\(([^,]+),([^)]+)\)/)
        .slice(1)
        .map(Number);
      assert(
        !(
          x + center.x > blocked.x - 20 &&
          y + center.y > blocked.y - 20 &&
          x + center.x < blocked.x + blocked.width + 20 &&
          y + center.y < blocked.y + blocked.height + 20
        ),
        `${n.id} hidden behind utilities`,
      );
    }
  } finally {
    await context.close();
  }
});

test('dragging far from a target cannot trigger a pair snap along its imaginary edge', async () => {
  const { context, page } = await session();
  try {
    await openTool(page, 'Browser');
    await openTool(page, 'Agent settings');
    const before = await validObjects(page);
    const target = before.find((o) => o.id === 'agent-settings').rect;
    const header = await page.locator('[data-object=browser] .object-header').boundingBox();
    await page.mouse.move(header.x + 80, header.y + 18);
    await page.mouse.down();
    await page.mouse.move(target.x + 2, 800, { steps: 12 });
    assert.equal(await page.locator('.placement-preview').count(), 1);
    await page.mouse.up();
    await validObjects(page);
    assert.deepEqual((await objects(page)).find((o) => o.id === 'agent-settings').rect, target);
  } finally {
    await context.close();
  }
});

test('the canvas below a compact utility stays usable without an invisible column', async () => {
  const { context, page } = await session();
  try {
    const before = await page
      .getByRole('main', { name: 'Working canvas', exact: true })
      .boundingBox();
    await page.getByRole('button', { name: 'Project tools', exact: true }).click();
    await page.getByRole('button', { name: 'Hide sources', exact: true }).click();
    await page.getByRole('button', { name: 'Hide agent', exact: true }).click();
    const area = await page
      .getByRole('main', { name: 'Working canvas', exact: true })
      .boundingBox();
    assert.equal(area.width, before.width);
    await openTool(page, 'Browser');
    const goal = await page.getByRole('region', { name: 'Goals', exact: true }).boundingBox();
    const header = await page.locator('[data-object=browser] .object-header').boundingBox();
    const object = (await objects(page))[0].rect;
    await page.mouse.move(header.x + 80, header.y + 18);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width - object.width + 70, goal.y + goal.height + 80, {
      steps: 12,
    });
    await page.mouse.up();
    const actual = (await validObjects(page))[0].rect;
    assert(actual.right > goal.x + 100);
    assert(actual.y >= goal.y + goal.height + 15);
    assert(actual.right <= area.x + area.width + 1);
  } finally {
    await context.close();
  }
});

test('composer has one neutral focus boundary and respects IME and send preferences', async () => {
  const { context, page, errors } = await session();
  try {
    const input = page.locator('#composer');
    await input.fill('Keep this while composing');
    await input.evaluate((el) =>
      el.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
          isComposing: true,
        }),
      ),
    );
    assert.equal(
      (await stored(page)).conversations.find((c) => c.id === 'notes').messages.length,
      0,
    );
    assert.equal(await input.inputValue(), 'Keep this while composing');
    const focus = await input.evaluate((el) => ({
      outline: getComputedStyle(el).outlineStyle,
      boundary: getComputedStyle(el.closest('form')).boxShadow,
    }));
    assert.equal(focus.outline, 'none');
    assert.notEqual(focus.boundary, 'none');
    await page.getByRole('button', { name: 'Account and appearance', exact: true }).click();
    await page.getByLabel('Send shortcut', { exact: true }).selectOption('modifier');
    await page.getByRole('button', { name: 'Account and appearance', exact: true }).click();
    await input.focus();
    await input.press('Enter');
    assert.equal(
      (await stored(page)).conversations.find((c) => c.id === 'notes').messages.length,
      0,
    );
    assert.match(await input.inputValue(), /\n/);
    await input.press('Control+Enter');
    assert.equal(
      (await stored(page)).conversations.find((c) => c.id === 'notes').messages.length,
      1,
    );
    assert.equal(await input.inputValue(), '');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('work search is nonmodal, cancels cleanly and restores keyboard focus', async () => {
  const { context, page } = await session();
  try {
    await page.locator('#composer').fill('Unsent text');
    await page.locator('#composer').press('Control+k');
    const search = page.getByRole('textbox', { name: 'Find work or an action', exact: true });
    await search.fill('Research');
    assert.equal(await page.locator('.work-results').getByRole('button').count(), 1);
    await search.press('Escape');
    assert.equal(await page.getByRole('dialog', { name: 'Open work', exact: true }).count(), 0);
    assert.equal(
      await page.locator('#composer').evaluate((el) => document.activeElement === el),
      true,
    );
    assert.equal(await page.locator('#composer').inputValue(), 'Unsent text');
    assert.equal(await page.locator('[data-object]').count(), 0);
    assert.equal((await stored(page)).inspector, null);
  } finally {
    await context.close();
  }
});

test('new documents retain canonical local identity, content and graph folder after reload', async () => {
  const { context, page, errors } = await session();
  try {
    await page.getByRole('button', { name: 'Open work', exact: true }).click();
    await page
      .locator('.work-results')
      .getByRole('button', { name: /^New document/ })
      .click();
    await page.getByLabel('Document title', { exact: true }).fill('Private reference');
    await page
      .getByLabel('Document content', { exact: true })
      .fill('Original context with a stable identity.');
    const id = (await stored(page)).localResources[0].id;
    await page.reload();
    assert.equal(
      await page.getByLabel('Document content', { exact: true }).inputValue(),
      'Original context with a stable identity.',
    );
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await page.locator('[data-node="private-folder"]').press('Enter');
    await page.locator(`[data-node="${id}"]`).press('Enter');
    assert.equal(await page.locator('.document-view').count(), 1);
    assert.equal((await stored(page)).document, id);
    assert.equal((await stored(page)).localResources.length, 1);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('private references cannot silently enter shared conversation attachments', async () => {
  const { context, page } = await session();
  try {
    await page.getByRole('button', { name: 'Open work', exact: true }).click();
    await page
      .locator('.work-results')
      .getByRole('button', { name: /^New document/ })
      .click();
    await page.getByLabel('Document title', { exact: true }).fill('Private reference');
    const id = (await stored(page)).localResources[0].id;
    await page.getByRole('button', { name: 'Close inspection', exact: true }).click();
    await project(page);
    await page.locator('#composer').fill('Keep my shared draft');
    await page.getByRole('button', { name: 'Attach context', exact: true }).click();
    assert.equal(
      await page
        .getByRole('dialog', { name: 'Attach a document' })
        .getByRole('button', { name: 'Private reference', exact: true })
        .isDisabled(),
      true,
    );
    await page.locator('#composer').press('Escape');
    await page.evaluate((id) => {
      const s = JSON.parse(localStorage.getItem('workstation-layout-proof-v1'));
      s.attachments.direction = [id];
      localStorage.setItem('workstation-layout-proof-v1', JSON.stringify(s));
    }, id);
    await page.reload();
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    assert.match(await page.getByRole('status').innerText(), /Share private documents/);
    assert.equal(await page.locator('#composer').inputValue(), 'Keep my shared draft');
    assert.equal(
      (await stored(page)).conversations.find((c) => c.id === 'direction').messages.length,
      3,
    );
  } finally {
    await context.close();
  }
});

test('agent definitions and immutable versions persist without claiming execution', async () => {
  const { context, page, errors } = await session();
  try {
    await page.getByRole('button', { name: 'Open work', exact: true }).click();
    await page
      .locator('.work-results')
      .getByRole('button', { name: /^New agent/ })
      .click();
    const editor = page.locator('.agent-editor');
    await editor.getByLabel('Name', { exact: true }).fill('Research partner');
    await editor.getByLabel('Purpose', { exact: true }).fill('Trace claims to their sources.');
    await editor
      .getByLabel('Instructions', { exact: true })
      .fill('Cite accessible sources and preserve uncertainty.');
    await editor.getByRole('button', { name: 'Save version', exact: true }).click();
    await editor.getByLabel('Instructions', { exact: true }).fill('A revised instruction.');
    await editor.getByRole('button', { name: 'Save version', exact: true }).click();
    const agents = (await stored(page)).agents;
    const agent = agents.find((a) => a.draft.name === 'Research partner');
    assert.equal(agent.versions.length, 2);
    assert.equal(
      agent.versions[0].config.instructions,
      'Cite accessible sources and preserve uncertainty.',
    );
    assert.equal(agent.versions[1].config.instructions, 'A revised instruction.');
    assert.equal(
      await editor.getByRole('button', { name: 'Test agent', exact: true }).isDisabled(),
      true,
    );
    assert.equal(
      await editor.getByRole('button', { name: 'Deploy agent', exact: true }).isDisabled(),
      true,
    );
    await editor.getByRole('button', { name: /^Version history/ }).click();
    await editor.locator('summary').filter({ hasText: 'Version 1' }).click();
    await editor
      .locator('details')
      .filter({ hasText: 'Version 1' })
      .getByRole('button', { name: 'Restore into draft', exact: true })
      .click();
    assert.equal((await stored(page)).agents.find((a) => a.id === agent.id).versions.length, 2);
    await page.reload();
    assert.equal(
      await page.locator('.agent-editor').getByLabel('Instructions', { exact: true }).inputValue(),
      'Cite accessible sources and preserve uncertainty.',
    );
    await page.getByLabel('Agent definition', { exact: true }).selectOption('project-agent');
    assert.equal(await page.getByLabel('Private', { exact: true }).isDisabled(), true);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('conversation search returns to a source message and thread drafts survive navigation', async () => {
  const { context, page } = await session();
  try {
    await project(page);
    await page.getByRole('button', { name: 'Reply in thread', exact: true }).first().click();
    await page.locator('#composer').fill('Thread draft retained');
    await page.getByRole('button', { name: 'Back to conversations', exact: true }).click();
    await page.getByRole('button', { name: 'Personal notes', exact: true }).click();
    await page.locator('#composer').fill('Private draft retained');
    await page.getByRole('button', { name: 'Back to conversations', exact: true }).click();
    await page.getByRole('button', { name: '# product-direction', exact: true }).click();
    assert.equal(await page.locator('#composer').inputValue(), 'Thread draft retained');
    await page.getByRole('button', { name: 'Search this conversation', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Search messages', exact: true })
      .fill('sources/context');
    await page.locator('.message-search-results').getByRole('button').click();
    assert.equal(await page.locator('.message-search-results').count(), 0);
    assert.equal(await page.locator('#composer').inputValue(), '');
    assert.match(await page.locator('.transcript').innerText(), /Sources\/context/);
  } finally {
    await context.close();
  }
});

test('message pins reuse their source identity, reopen and follow current message content', async () => {
  const { context, page, errors } = await session();
  try {
    await project(page);
    await page.getByRole('button', { name: 'Pin message to canvas', exact: true }).nth(1).click();
    await validObjects(page);
    const pin = (await stored(page)).canvasPins[0];
    assert.equal((await stored(page)).canvasPins.length, 1);
    await page.getByRole('button', { name: 'Open original', exact: true }).click();
    await page.getByRole('button', { name: 'Pin message to canvas', exact: true }).nth(1).click();
    assert.equal((await stored(page)).objects.filter((o) => o.id.startsWith('pin:')).length, 1);
    assert.equal((await stored(page)).canvasPins[0].id, pin.id);
    await page.getByRole('button', { name: 'Close pinned message', exact: true }).click();
    assert.equal((await stored(page)).canvasPins.length, 1);
    await page.getByRole('button', { name: 'Open work', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Find work or an action', exact: true })
      .fill('times where');
    await page.locator('.work-results').getByRole('button').click();
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('workstation-layout-proof-v1'));
      s.conversations
        .find((c) => c.id === 'direction')
        .messages.find((m) => m.id === 'record-2').text = 'Updated original message';
      localStorage.setItem('workstation-layout-proof-v1', JSON.stringify(s));
    });
    await page.reload();
    assert.equal(
      await page.locator('.pinned-message blockquote').innerText(),
      'Updated original message',
    );
    assert.equal((await stored(page)).canvasPins[0].id, pin.id);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('a pinned message becomes one sourced step and plan edits use the existing goals', async () => {
  const { context, page, errors } = await session({ width: 1600, height: 1100 });
  try {
    await project(page);
    await page.getByRole('button', { name: 'Pin message to canvas', exact: true }).first().click();
    await page.getByRole('button', { name: 'Add to plan', exact: true }).click();
    await validObjects(page);
    const source = (await stored(page)).goals.at(-1);
    assert.equal(source.source.messageId, 'record-1');
    assert.equal(source.source.conversationId, 'direction');
    await page.getByRole('button', { name: 'Add to plan', exact: true }).click();
    assert.equal((await stored(page)).goals.length, 4);
    await page.getByLabel('Step 1 title', { exact: true }).fill('First next step');
    await page.getByLabel('Owner for step 1', { exact: true }).fill('Dylan');
    await page.getByRole('button', { name: 'Set due date for step 1', exact: true }).click();
    await page.getByLabel('Due date for step 1', { exact: true }).fill('2026-11-03');
    await page.getByRole('button', { name: 'Move step 1 down', exact: true }).click();
    assert.equal((await stored(page)).goals[1].title, 'First next step');
    await page.getByRole('button', { name: 'Project tools', exact: true }).click();
    const plan = page.locator('.canvas-plan');
    await plan.getByRole('button', { name: 'Complete First next step', exact: true }).click();
    const goals = page.getByRole('region', { name: 'Goals', exact: true });
    await goals.getByRole('button', { name: 'Reopen First next step', exact: true }).waitFor();
    const record = (await stored(page)).goals[1];
    assert.equal(record.owner, 'Dylan');
    assert.equal(record.due, '2026-11-03');
    assert.equal(record.done, true);
    await plan.getByRole('button', { name: 'From conversation', exact: true }).click();
    assert.equal((await stored(page)).selected, 'direction');
    assert.equal((await stored(page)).goals.at(-1).id, source.id);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('private message pins stay private and unavailable originals do not leak cached text', async () => {
  const { context, page } = await session();
  try {
    await page.locator('#composer').fill('A private planning thought');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.getByRole('button', { name: 'Pin message to canvas', exact: true }).click();
    assert.equal(
      await page.getByRole('button', { name: 'Add to plan', exact: true }).isDisabled(),
      true,
    );
    assert.equal((await stored(page)).goals.length, 3);
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('workstation-layout-proof-v1'));
      s.conversations.find((c) => c.id === 'notes').messages = [];
      localStorage.setItem('workstation-layout-proof-v1', JSON.stringify(s));
    });
    await page.reload();
    assert.match(
      await page.locator('.canvas-unavailable').innerText(),
      /original message is unavailable/,
    );
    assert.doesNotMatch(
      await page.locator('[data-object]').innerText(),
      /private planning thought/,
    );
  } finally {
    await context.close();
  }
});

const visualFixture = fileURLToPath(
  new URL('../../research/references/codex-module-style.png', import.meta.url),
);
async function loadedVisual(page) {
  await page.waitForFunction(() => document.querySelector('.visual-image img')?.naturalWidth > 0);
}
test('visual references persist binary content, captions and identity through close/reopen/replace', async () => {
  const { context, page, errors } = await session();
  try {
    await page.getByLabel('Choose visual references', { exact: true }).setInputFiles(visualFixture);
    await loadedVisual(page);
    await page.getByLabel('Visual reference title', { exact: true }).fill('Interface reference');
    await page
      .getByLabel('Visual reference caption', { exact: true })
      .fill('Clear sources and hierarchy.');
    const first = (await stored(page)).visuals[0];
    await page.reload();
    await loadedVisual(page);
    assert.equal(
      await page.getByLabel('Visual reference caption', { exact: true }).inputValue(),
      'Clear sources and hierarchy.',
    );
    await page.getByRole('button', { name: 'Close visual reference', exact: true }).click();
    assert.equal((await stored(page)).visuals.length, 1);
    await page.getByRole('button', { name: 'Open work', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Find work or an action', exact: true })
      .fill('Interface reference');
    await page.locator('.work-results').getByRole('button').click();
    await loadedVisual(page);
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Replace image', exact: true }).click();
    await (await chooserPromise).setFiles(visualFixture);
    await loadedVisual(page);
    const current = (await stored(page)).visuals[0];
    assert.equal(current.id, first.id);
    assert.equal(current.imageKey, first.imageKey);
    assert.equal(current.caption, 'Clear sources and hierarchy.');
    assert.equal((await stored(page)).visuals.length, 1);
    const resize = page.getByRole('button', { name: 'Resize visual reference', exact: true });
    for (let i = 0; i < 10; i++) await resize.press('ArrowUp');
    const object = (await objects(page))[0].rect;
    const caption = await page
      .getByLabel('Visual reference caption', { exact: true })
      .boundingBox();
    assert(object.height >= 280);
    assert(caption.y + caption.height <= object.bottom);
    assert.equal(
      await page.getByLabel('Visual reference caption', { exact: true }).inputValue(),
      'Clear sources and hierarchy.',
    );
    await validObjects(page);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('invalid images retain work and a crowded canvas keeps saved visuals recoverable', async () => {
  const { context, page, errors } = await session();
  try {
    await page.locator('#composer').fill('Keep this draft');
    await page.getByLabel('Choose visual references', { exact: true }).setInputFiles({
      name: 'broken.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not an image'),
    });
    await page.getByRole('status').filter({ hasText: 'could not be read as an image' }).waitFor();
    assert.equal((await stored(page)).visuals.length, 0);
    assert.equal(await page.locator('#composer').inputValue(), 'Keep this draft');
    const area = await page
      .getByRole('main', { name: 'Working canvas', exact: true })
      .boundingBox();
    await page.evaluate((area) => {
      const s = JSON.parse(localStorage.getItem('workstation-layout-proof-v1'));
      s.objects = [{ id: 'document', x: 0, y: 0, width: area.width, height: area.height }];
      localStorage.setItem('workstation-layout-proof-v1', JSON.stringify(s));
    }, area);
    await page.reload();
    await page.getByLabel('Choose visual references', { exact: true }).setInputFiles(visualFixture);
    await page
      .getByRole('status')
      .filter({ hasText: 'Image saved to visual references' })
      .waitFor();
    assert.equal((await stored(page)).visuals.length, 1);
    assert.equal((await stored(page)).objects.length, 1);
    await page.getByRole('button', { name: 'Close document', exact: true }).click();
    await page.getByRole('button', { name: 'Open work', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Find work or an action', exact: true })
      .fill('codex-module-style');
    await page.locator('.work-results').getByRole('button').click();
    await loadedVisual(page);
    await validObjects(page);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('image drop and paste add visual objects without intercepting text composition', async () => {
  const { context, page, errors } = await session({ width: 1600, height: 1100 });
  try {
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1kAAAAASUVORK5CYII=';
    await page.getByRole('main', { name: 'Working canvas', exact: true }).evaluate((el, png) => {
      const data = new DataTransfer();
      data.items.add(
        new File([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], 'dropped.png', {
          type: 'image/png',
        }),
      );
      el.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }),
      );
    }, png);
    await loadedVisual(page);
    await page.getByRole('main', { name: 'Working canvas', exact: true }).evaluate((el, png) => {
      const data = new DataTransfer();
      data.items.add(
        new File([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], 'pasted.png', {
          type: 'image/png',
        }),
      );
      el.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
      );
    }, png);
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem('workstation-layout-proof-v1')).visuals.length === 2,
    );
    await page.locator('#composer').fill('Pasting text still belongs in the composer.');
    assert.equal((await stored(page)).visuals.length, 2);
    await validObjects(page);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

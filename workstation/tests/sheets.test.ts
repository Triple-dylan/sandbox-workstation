import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { scriptedRuntime } from '../server/agents/scripted.ts';
import type { Provider } from '../server/connectors/providers.ts';
import { evaluate } from '../shared/formula.ts';
import {
  formatValue,
  fromTsv,
  readSheet,
  readXlsx,
  settleFormulas,
  shiftFormula,
  sortRows,
  toCsv,
  toTsv,
  writeXlsx,
} from '../shared/sheet.ts';

const opened: ReturnType<typeof createApp>[] = [];
after(async () => {
  for (const app of opened) await app.close();
});

test('sheets: formulas move when pasted or filled, unless fixed with $', () => {
  assert.equal(shiftFormula('=B2*C2', 1, 0), '=B3*C3');
  assert.equal(shiftFormula('=SUM(B2:B5)', 0, 1), '=SUM(C2:C5)');
  assert.equal(shiftFormula('=B2*$C$1', 2, 0), '=B4*$C$1');
  assert.equal(shiftFormula('=B$1+$A2', 1, 1), '=C$1+$A3');
  assert.equal(shiftFormula('=B2', -5, 0), '=#REF');
  assert.equal(shiftFormula('plain text', 1, 1), 'plain text');
  assert.equal(evaluate([['2', '=A1*$A$1']], 0, 1), '4');
});

test('sheets: the clipboard round trip with Excel, number formats, and sorting', () => {
  const block = [
    ['Item', 'Note'],
    ['Travel', 'two\tparts'],
    ['Venue', 'say "hi"\nthen go'],
  ];
  assert.deepEqual(fromTsv(toTsv(block)), block);
  assert.deepEqual(fromTsv('a\t\tc\r\n1\t2\t3\r\n'), [
    ['a', '', 'c'],
    ['1', '2', '3'],
  ]);
  assert.equal(formatValue('1234.5', 'currency'), '$1,234.50');
  assert.equal(formatValue('-3', 'currency'), '-$3.00');
  assert.equal(formatValue('0.125', 'percent'), '12.5%');
  assert.equal(formatValue('1234', 'number'), '1,234.00');
  assert.equal(formatValue('Travel', 'currency'), 'Travel');
  const rows = [
    ['Item', 'Cost', 'Double'],
    ['Venue', '3000', '=B2*2'],
    ['Travel', '', '=B3*2'],
    ['Catering', '1200', '=B4*2'],
  ];
  const sorted = sortRows(rows, 1, false, 1);
  assert.deepEqual(
    sorted.map((r) => r[0]),
    ['Item', 'Catering', 'Venue', 'Travel'],
    'numbers by value, blanks last, header kept',
  );
  assert.deepEqual(
    sorted.map((_, r) => evaluate(sorted, r, 2)),
    ['Double', '2400', '6000', '0'],
    "each row's formula still points at its own row",
  );
});

test('sheets: an Excel file goes out and comes back with formulas, formats and frozen header', () => {
  const sheet = {
    rows: [
      ['Line', 'Cost', 'Share'],
      ['Venue', '3000', '0.6'],
      ['Travel', '2000', '0.4'],
      ['Total', '=SUM(B2:B3)', '=SUM(C2:C3)'],
    ],
    formats: { 1: 'currency', 2: 'percent' } as const,
    widths: { 0: 180 },
    freeze: 1,
  };
  const file = writeXlsx('Q1 Budget', sheet);
  const [back] = readXlsx(file);
  assert.equal(back.tab, 'Q1 Budget');
  assert.deepEqual(back.sheet.rows, sheet.rows);
  assert.deepEqual(back.sheet.formats, { 1: 'currency', 2: 'percent' });
  assert.equal(back.sheet.freeze, 1);
  assert.match(toCsv(sheet), /Total,"\$5,000.00",100%/);
});

test('sheets: a formula this app cannot work out keeps the value it last showed', () => {
  const rows = settleFormulas(
    [
      ['10', '=A1*2', '=VLOOKUP(A1,X:Y,2)', '=A1/0'],
      ['=B1+1', '', '', ''],
    ],
    [
      ['10', '20', 'Paris', '#DIV/0!'],
      ['21', '', '', ''],
    ],
  );
  assert.deepEqual(rows, [
    ['10', '=A1*2', 'Paris', '#DIV/0!'],
    ['=B1+1', '', '', ''],
  ]);
});

/** A spreadsheet service in memory: one workbook with two tabs. */
function fakeSheets() {
  const book: Record<string, string[][]> = {
    Budget: [
      ['Line', 'Cost'],
      ['Venue', '3000'],
      ['Total', '=SUM(B2:B2)'],
    ],
    Notes: [['Owner'], ['Priya']],
  };
  const writes: { tab: string; edits: { row: number; col: number; value: string }[] }[] = [];
  let refreshed = 0;
  const provider: Provider = {
    id: 'google',
    name: 'Google Sheets',
    ready: true,
    owns: (url) => url.includes('docs.google.com/spreadsheets/d/'),
    authUrl: (state, redirect) => `https://auth.example/?state=${state}&redirect=${redirect}`,
    exchange: async (code) => {
      assert.equal(code, 'the-code');
      return { account: 'priya@example.com', access: 'a1', refresh: 'r1', expiresAt: 0 };
    },
    refresh: async (token) => {
      assert.equal(token, 'r1');
      refreshed++;
      return { account: '', access: 'a2', refresh: null, expiresAt: Date.now() + 3600_000 };
    },
    open: async (token, url) => {
      assert.equal(token, 'a2');
      return { fileId: 'book1', title: 'Launch budget', tabs: Object.keys(book), url };
    },
    read: async (_token, fileId, tab) => {
      assert.equal(fileId, 'book1');
      const formulas = book[tab];
      const values = formulas.map((r, i) =>
        r.map((c, j) => (c.startsWith('=') ? evaluate(formulas, i, j) : c)),
      );
      return { formulas, values };
    },
    write: async (_token, _fileId, tab, edits) => {
      writes.push({ tab, edits });
      for (const e of edits) {
        while (book[tab].length <= e.row) book[tab].push([]);
        book[tab][e.row][e.col] = e.value;
      }
    },
  };
  return { provider, book, writes, refreshes: () => refreshed };
}

test('connectors: link a Google Sheet, edits go out, its changes come in, and only the connector sets a link', async () => {
  const fake = fakeSheets();
  const app = createApp({
    dbPath: ':memory:',
    staticDir: null,
    runtime: scriptedRuntime,
    providers: [fake.provider],
  });
  opened.push(app);
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const h = { 'content-type': 'application/json', 'x-workstation': '1' };
  const join = await fetch(`${base}/api/join`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'Priya' }),
  });
  const cookie = join.headers.get('set-cookie')!.split(';')[0];
  const get = (path: string) =>
    fetch(`${base}/api${path}`, { headers: { cookie }, redirect: 'manual' });
  const post = (path: string, body: unknown) =>
    fetch(`${base}/api${path}`, {
      method: 'POST',
      headers: { ...h, cookie },
      body: JSON.stringify(body),
    });

  let snap = await (await get('/snapshot')).json();
  assert.deepEqual(snap.connectors, [
    { id: 'google', name: 'Google Sheets', ready: true, account: null },
  ]);
  const space = snap.spaces.find((s: any) => s.kind === 'personal').id;
  const url = 'https://docs.google.com/spreadsheets/d/book1/edit';

  // Not connected yet: linking says what to do.
  const early = await post('/sheets/link', { spaceId: space, url });
  assert.equal(early.status, 400);
  assert.match((await early.json()).error, /Connect Google Sheets first/);

  // Signing in: out to the provider and back with a code, checked against the state.
  const out = await get('/connect/google');
  assert.equal(out.status, 302);
  const state = new URL(out.headers.get('location')!).searchParams.get('state')!;
  const forged = await get(`/connect/google/callback?code=the-code&state=wrong`);
  assert.match(forged.headers.get('location')!, /connect-error=/);
  const back = await get(`/connect/google/callback?code=the-code&state=${state}`);
  assert.equal(back.headers.get('location'), '/?connected=google');
  snap = await (await get('/snapshot')).json();
  assert.equal(snap.connectors[0].account, 'priya@example.com');

  // Linking makes one sheet per tab, with the original's cells and formulas.
  const made = await (await post('/sheets/link', { spaceId: space, url })).json();
  assert.deepEqual(
    made.map((m: any) => m.title),
    ['Launch budget · Budget', 'Launch budget · Notes'],
  );
  assert.equal(fake.refreshes(), 1, 'an expired sign-in is refreshed, not asked for again');
  const page = () => app.store.resource(made[0].id)!;
  assert.deepEqual(readSheet(page().body).rows[2], ['Total', '=SUM(B2:B2)']);
  assert.equal(readSheet(page().body).link!.tab, 'Budget');

  // An edit here goes out to the original.
  await post(`/resources/${made[0].id}/cells`, { edits: [{ row: 1, col: 1, value: '3400' }] });
  await app.connectors.flush();
  assert.deepEqual(fake.writes, [{ tab: 'Budget', edits: [{ row: 1, col: 1, value: '3400' }] }]);
  assert.equal(fake.book.Budget[1][1], '3400');

  // A change made in Google Sheets comes in when synced.
  fake.book.Budget.splice(2, 0, ['Travel', '800']);
  fake.book.Budget[3] = ['Total', '=SUM(B2:B3)'];
  await post(`/resources/${made[0].id}/sync`, {});
  assert.deepEqual(readSheet(page().body).rows.slice(1), [
    ['Venue', '3400'],
    ['Travel', '800'],
    ['Total', '=SUM(B2:B3)'],
  ]);

  // Nobody can point a page at someone's spreadsheet by writing a link into it.
  const link = {
    provider: 'google',
    fileId: 'book1',
    tab: 'Budget',
    url,
    linkedBy: 'x',
    syncedAt: null,
  };
  const sneaky = await (
    await post('/resources', {
      spaceId: space,
      kind: 'sheet',
      body: JSON.stringify({ rows: [['a']], link }),
    })
  ).json();
  assert.equal(readSheet(app.store.resource(sneaky.id)!.body).link, undefined);
  await fetch(`${base}/api/resources/${made[0].id}`, {
    method: 'PATCH',
    headers: { ...h, cookie },
    body: JSON.stringify({
      body: JSON.stringify({ rows: [['x']], link: { ...link, fileId: 'other' } }),
    }),
  });
  assert.equal(readSheet(page().body).link!.fileId, 'book1', 'the page keeps its own link');

  // Layout: formats, widths and the frozen header are kept apart from the cells.
  await post(`/resources/${made[0].id}/layout`, {
    formats: { 1: 'currency', 9: 'bogus' },
    widths: { 0: 200 },
    freeze: 1,
  });
  const body = readSheet(page().body);
  assert.deepEqual(body.formats, { 1: 'currency' });
  assert.deepEqual(body.widths, { 0: 200 });
  assert.equal(body.freeze, 1);

  // Disconnecting forgets the sign-in.
  await fetch(`${base}/api/connections/google`, { method: 'DELETE', headers: { ...h, cookie } });
  snap = await (await get('/snapshot')).json();
  assert.equal(snap.connectors[0].account, null);
});

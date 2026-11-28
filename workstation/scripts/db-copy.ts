// Copies a SQLite database file into an empty Postgres database.
//   npm run db:copy -- <sqlite file> <postgres://…>
// The Postgres schema is brought up to date first. Nothing is written if any of its tables
// already has rows, and the copy is one transaction: all of it lands or none does.
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { copySqliteToPostgres } from '../server/sql/copy.ts';
import { openSql, isPostgresUrl } from '../server/sql/open.ts';

const [file, url] = process.argv.slice(2);
if (!file || !url || !isPostgresUrl(url) || !existsSync(file)) {
  console.error('Usage: npm run db:copy -- <sqlite file> <postgres://…>');
  process.exit(1);
}
const from = new DatabaseSync(file, { readOnly: true });
const to = await openSql(url);
try {
  const report = await copySqliteToPostgres(from, to);
  for (const [table, n] of Object.entries(report.copied)) if (n) console.log(`${table}: ${n}`);
  if (report.skippedVectors)
    console.log(`${report.skippedVectors} search vectors of the wrong length were left to remake.`);
  console.log('Copied.');
} finally {
  from.close();
  await to.close();
}

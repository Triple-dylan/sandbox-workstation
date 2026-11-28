import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { loadEnv } from './env.ts';
import { createApp } from './app.ts';
import { storageFor, storageWarning } from './storage.ts';
import { backupOptions, scheduleBackups } from './backup.ts';
import { applyPendingRestore } from './restore.ts';

loadEnv();
const port = Number(process.env.PORT ?? 4174);
const host = process.env.HOST ?? '127.0.0.1';
const dbPath =
  process.env.WORKSTATION_DB ?? fileURLToPath(new URL('../data/workstation.db', import.meta.url));
// A backup staged with `npm run restore` goes in place before the database is opened.
applyPendingRestore(dbPath);
const app = createApp({ dbPath, staticDir: process.env.STATIC === 'off' ? null : undefined });
// Nightly copies of the database beside it (see server/backup.ts); off for an in-memory database.
const backups = scheduleBackups(dbPath, backupOptions(dbPath, process.env));

app.server.listen(port, host, () => {
  const address = app.server.address();
  const actual = typeof address === 'object' && address ? address.port : port;
  console.log(`Sandbox listening on http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${actual}`);
  if (host === '0.0.0.0')
    for (const nets of Object.values(networkInterfaces()))
      for (const net of nets ?? [])
        if (net.family === 'IPv4' && !net.internal)
          console.log(`  on your network: http://${net.address}:${actual}`);
  console.log(
    `Agents: ${app.runtime.label}${app.runtime.model ? ` (${app.runtime.model})` : ''}${app.runtime.fallback ? `, ${app.runtime.fallback} if OpenAI is unavailable` : ''}. Data: ${dbPath === ':memory:' ? 'in memory' : dbPath}`,
  );
  const warning = storageWarning(dbPath, storageFor(dbPath));
  if (warning) console.warn(warning);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    backups.stop();
    app.close().finally(() => process.exit(0));
  });

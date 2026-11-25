// Runs the API server (with reload on change) and the Vite dev server together. Ctrl-C stops both.
import { spawn } from 'node:child_process';

const apiPort = process.env.API_PORT ?? '4175';
const children = [
  spawn(
    process.execPath,
    [
      '--disable-warning=ExperimentalWarning',
      '--watch-path=server',
      '--watch-path=shared',
      'server/index.ts',
    ],
    { stdio: 'inherit', env: { ...process.env, PORT: apiPort, STATIC: 'off' } },
  ),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
    stdio: 'inherit',
    env: { ...process.env, API_PORT: apiPort },
  }),
];

let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
};
for (const child of children) child.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

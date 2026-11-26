import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { guardProxy } from './guard.ts';

/**
 * The shared browser service: real Chrome on its own server, for the workstation app to drive
 * over a WebSocket. Nothing about it runs on the machines people use the app from.
 *
 * - The address includes a secret (BROWSER_TOKEN); without it nobody can connect.
 * - Chrome is a normal, visible browser on a virtual screen (Xvfb): many sites refuse headless ones.
 * - Every connection Chrome makes goes through a proxy that refuses this server and private
 *   networks, checked at connection time, so a page can't be used to look inside the network.
 */
export async function startService(options: {
  token: string;
  port: number;
  host?: string;
  /** Tests only: private hosts the browser may reach, and a headless browser. */
  allowHosts?: string[];
  headless?: boolean;
}) {
  if (options.token.length < 24) throw new Error('BROWSER_TOKEN must be at least 24 characters.');
  const allowed = new Set(options.allowHosts ?? []);
  const env: Record<string, string> = {};
  let display: ReturnType<typeof spawn> | null = null;
  if (!options.headless && process.platform === 'linux' && !process.env.DISPLAY) {
    display = spawn('Xvfb', [':99', '-screen', '0', '1920x1080x24', '-nolisten', 'tcp'], {
      stdio: 'ignore',
    });
    env.DISPLAY = ':99';
    await new Promise((r) => setTimeout(r, 500));
  }
  const proxy = await guardProxy((host) => allowed.has(host));
  const server = await chromium.launchServer({
    headless: options.headless ?? false,
    host: options.host ?? '::',
    port: options.port,
    wsPath: `/${options.token}`,
    env: { ...process.env, ...env },
    // Every connection, even to this machine, goes through the guard.
    proxy: { server: proxy.url, bypass: '<-loopback>' },
    args: ['--disable-dev-shm-usage', '--no-first-run', '--disable-features=Translate'],
  });
  return {
    endpoint: server.wsEndpoint(),
    async close() {
      await server.close();
      proxy.close();
      display?.kill();
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const token = process.env.BROWSER_TOKEN ?? '';
  const port = Number(process.env.PORT ?? 3000);
  const service = await startService({ token, port });
  // The address itself carries the secret, so only where it listens is printed.
  console.log(`Shared browser service listening on port ${port}`);
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => void service.close().finally(() => process.exit(0)));
}

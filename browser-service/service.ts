import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { guardProxy } from './guard.ts';
import { PageWatch } from './pages.ts';
import { healthLine, readMemory } from './health.ts';

/**
 * The shared browser service: real Chrome on its own server, for the workstation app to drive
 * over a WebSocket. Nothing about it runs on the machines people use the app from.
 *
 * - The address includes a secret (BROWSER_TOKEN); without it nobody can connect.
 * - Chrome is a normal, visible browser on a virtual screen (Xvfb): many sites refuse headless ones.
 * - Every connection Chrome makes goes through a proxy that refuses this server and private
 *   networks, checked at connection time, so a page can't be used to look inside the network.
 * - Pages nobody has used for a while are closed (PAGE_IDLE_MINUTES, 30 unless set), and a health
 *   line with its memory and open pages is logged every minute, so a creep shows before it hurts.
 */
export async function startService(options: {
  token: string;
  port: number;
  host?: string;
  /** Tests only: private hosts the browser may reach, and a headless browser. */
  allowHosts?: string[];
  headless?: boolean;
  /** A page whose address and title haven't changed for this long is closed. 0 never closes. */
  idleMs?: number;
  /** How often the health line is logged. 0 never logs it. */
  healthMs?: number;
  log?: (line: string) => void;
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
  // If Chrome doesn't start, nothing is left running (the proxy would keep the process alive).
  const stopAll = () => {
    proxy.close();
    display?.kill();
  };
  const server = await chromium
    .launchServer({
      headless: options.headless ?? false,
      host: options.host ?? '::',
      port: options.port,
      wsPath: `/${options.token}`,
      env: { ...process.env, ...env },
      // Every connection, even to this machine, goes through the guard.
      proxy: { server: proxy.url, bypass: '<-loopback>' },
      args: ['--disable-dev-shm-usage', '--no-first-run', '--disable-features=Translate'],
    })
    .catch((error) => {
      stopAll();
      throw error;
    });
  const log = options.log ?? console.log;
  const idleMs = options.idleMs ?? 30 * 60_000;
  const healthMs = options.healthMs ?? 60_000;

  // The service's own connection, only to watch: Chrome tells it about every page, whoever
  // opened it. It opens nothing itself.
  const watching = async () => {
    const watcher = await chromium.connect(local(server.wsEndpoint()));
    const pages = new PageWatch(await watcher.newBrowserCDPSession(), {
      idleMs,
    });
    await pages.start();
    return { watcher, pages };
  };
  const { watcher, pages } = await watching().catch(async (error) => {
    await server.close().catch(() => {});
    stopAll();
    throw error;
  });
  const health = () =>
    healthLine(readMemory({ chromePid: server.process().pid }), pages.counts(), pages.closedIdle);
  const timers: ReturnType<typeof setInterval>[] = [];
  if (idleMs) {
    let sweeping = false;
    const sweep = async () => {
      if (sweeping) return;
      sweeping = true;
      const closed = await pages.closeIdle().finally(() => (sweeping = false));
      if (closed)
        log(
          `Closed ${closed} ${closed === 1 ? 'page' : 'pages'} nobody had used for ${minutes(idleMs)}.`,
        );
    };
    timers.push(setInterval(() => void sweep(), Math.min(60_000, Math.max(100, idleMs / 4))));
  }
  if (healthMs) timers.push(setInterval(() => log(health()), healthMs));
  for (const timer of timers) timer.unref();

  return {
    endpoint: server.wsEndpoint(),
    /** What the health line would say now. */
    health,
    pages,
    async close() {
      for (const timer of timers) clearInterval(timer);
      await watcher.close().catch(() => {});
      await server.close();
      stopAll();
    },
  };
}

const minutes = (ms: number) => {
  const n = Math.round(ms / 60_000);
  return n === 1 ? '1 minute' : n ? `${n} minutes` : 'under a minute';
};

/** The service's address as seen from inside the service (it listens on every address). */
function local(endpoint: string) {
  return endpoint.replace(/^ws:\/\/(\[::\]|0\.0\.0\.0)(?=:)/, 'ws://127.0.0.1');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const token = process.env.BROWSER_TOKEN ?? '';
  const port = Number(process.env.PORT ?? 3000);
  const idle = process.env.PAGE_IDLE_MINUTES?.trim();
  const idleMs = idle ? Math.max(0, Number(idle) || 0) * 60_000 : undefined;
  const service = await startService({ token, port, idleMs });
  // The address itself carries the secret, so only where it listens is printed.
  console.log(`Shared browser service listening on port ${port}`);
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => void service.close().finally(() => process.exit(0)));
}

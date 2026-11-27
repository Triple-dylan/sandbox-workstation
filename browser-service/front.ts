import { createServer, type IncomingMessage } from 'node:http';
import { connect, type AddressInfo, type Socket } from 'node:net';
import { timingSafeEqual } from 'node:crypto';

/**
 * The only door into the browser service. Playwright's own server listens on this machine alone;
 * this one listens where Railway sends traffic and lets through only a connection to the secret
 * address (`/<BROWSER_TOKEN>`). Everything else is refused, including Playwright's own `/json`,
 * which would otherwise hand the secret to anyone who asks.
 *
 * `GET /healthz` answers without the secret, with only what Railway's health check and a person
 * watching need: whether Chrome is running, its memory and how many pages are open.
 */
export async function startFront(options: {
  token: string;
  host: string;
  port: number;
  /** Where Playwright's server listens on this machine. */
  target: { host: string; port: number };
  health: () => { ok: boolean } & Record<string, unknown>;
}) {
  const secret = Buffer.from(`/${options.token}`);
  const isSecret = (req: IncomingMessage) => {
    const path = Buffer.from(new URL(req.url ?? '/', 'http://x').pathname);
    return path.length === secret.length && timingSafeEqual(path, secret);
  };
  // Every connection, upgraded or not, so stopping never waits on one left open (a kept-alive
  // health check, say).
  const open = new Set<Socket>();
  const track = (s: Socket) => {
    open.add(s);
    s.on('close', () => open.delete(s));
  };
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      let body: { ok: boolean };
      try {
        body = options.health();
      } catch {
        body = { ok: false };
      }
      res.writeHead(body.ok ? 200 : 503, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      return res.end(JSON.stringify(body));
    }
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  });
  server.on('upgrade', (req, socket, head) => {
    if (!isSecret(req)) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return;
    }
    const upstream = connect(options.target.port, options.target.host, () => {
      // Playwright accepts only its own loopback name as the Host on this machine.
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const name = req.rawHeaders[i];
        const value = /^host$/i.test(name)
          ? `${options.target.host}:${options.target.port}`
          : req.rawHeaders[i + 1];
        lines.push(`${name}: ${value}`);
      }
      upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    track(upstream);
    const end = () => {
      socket.destroy();
      upstream.destroy();
    };
    upstream.on('error', end);
    socket.on('error', end);
    upstream.on('close', end);
    socket.on('close', end);
  });
  server.on('connection', track);
  await new Promise<void>((resolve, reject) =>
    server.once('error', reject).listen(options.port, options.host, resolve),
  );
  const address = server.address() as AddressInfo;
  const where = address.family === 'IPv6' ? `[${address.address}]` : address.address;
  return {
    port: address.port,
    endpoint: `ws://${where}:${address.port}/${options.token}`,
    close() {
      for (const s of open) s.destroy();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

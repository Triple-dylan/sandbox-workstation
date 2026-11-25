import { BlockList, isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { SEARCH_ENGINES, type SearchEngine } from '../../shared/types.ts';

/**
 * Addresses the shared browser must never reach: this machine, the private network it sits on,
 * and the cloud metadata service. Otherwise anyone in a workspace could use it to look inside the
 * server.
 */
const blocked = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  blocked.addSubnet(net, bits, 'ipv6');

export function isPrivateAddress(address: string) {
  const plain = address.replace(/^\[|\]$/g, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(plain)?.[1];
  if (mapped) return blocked.check(mapped, 'ipv4');
  const family = isIP(plain);
  if (!family) return false;
  return blocked.check(plain, family === 4 ? 'ipv4' : 'ipv6');
}

/** Whether the shared browser may load this address. Names are looked up; any private answer blocks it. */
export async function mayVisit(raw: string, allow: (host: string) => boolean = () => false) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol === 'data:' || url.protocol === 'blob:' || raw === 'about:blank') return true;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (allow(host)) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal'))
    return false;
  if (isIP(host)) return !isPrivateAddress(host);
  try {
    const answers = await lookup(host, { all: true });
    return answers.length > 0 && answers.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

/** What was typed in the address bar: a web address, or words to search for. */
export function addressFor(typed: string, engine: SearchEngine = 'google') {
  const { home, search } = SEARCH_ENGINES[engine] ?? SEARCH_ENGINES.google;
  const text = typed.trim();
  if (!text) return home;
  if (/^https?:\/\/\S+$/i.test(text)) return text;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(text) && !/\s/.test(text)) return `https://${text}`;
  return `${search}${encodeURIComponent(text)}`;
}

/** The address to connect to for a host, or null if any of its addresses is private. */
async function safeAddress(host: string, allow: (host: string) => boolean) {
  const name = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (allow(name)) return name === 'localhost' ? '127.0.0.1' : name;
  if (name === 'localhost' || name.endsWith('.localhost') || name.endsWith('.internal'))
    return null;
  if (isIP(name)) return isPrivateAddress(name) ? null : name;
  try {
    const answers = await lookup(name, { all: true });
    if (!answers.length || answers.some((a) => isPrivateAddress(a.address))) return null;
    return answers[0].address;
  } catch {
    return null;
  }
}

/**
 * Every connection the shared browser makes goes through this proxy, which looks the name up
 * itself and connects only to public addresses. That covers redirects, sockets and a name that
 * changes its answer between the check and the connection.
 */
export async function guardProxy(allow: (host: string) => boolean = () => false) {
  const { createServer, request } = await import('node:http');
  const { connect } = await import('node:net');
  const server = createServer(async (req, res) => {
    let target: URL;
    try {
      target = new URL(req.url ?? '');
    } catch {
      return void res.writeHead(400).end();
    }
    const address = target.protocol === 'http:' ? await safeAddress(target.hostname, allow) : null;
    if (!address) return void res.writeHead(403).end('Blocked by the workspace browser.');
    const upstream = request(
      {
        host: address,
        port: Number(target.port) || 80,
        path: `${target.pathname}${target.search}`,
        method: req.method,
        headers: { ...req.headers, host: target.host },
      },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      },
    );
    upstream.on('error', () => res.destroy());
    req.pipe(upstream);
  });
  server.on('connect', async (req, socket, head) => {
    const m = /^\[?([^\]]+?)\]?:(\d+)$/.exec(req.url ?? '');
    socket.on('error', () => socket.destroy());
    const address = m ? await safeAddress(m[1], allow) : null;
    if (!m || !address) return void socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    const upstream = connect(Number(m[2]), address, () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('close', () => upstream.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

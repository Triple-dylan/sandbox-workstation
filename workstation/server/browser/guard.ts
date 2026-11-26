import { BlockList, isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

// The app's first check on every address. The browser service (browser-service/guard.ts) checks
// every connection again where Chrome runs; keep the blocked ranges in step with it.

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

/** How long a request may spend waiting on OpenAI before it gives up and says so. */
const MAX_WAIT_MS = 45_000;
const MAX_TRIES = 6;

export type Sleep = (ms: number) => Promise<void>;
export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** OpenAI said no for a reason worth telling people about in plain words. */
export class ProviderBusy extends Error {}

/**
 * Sends a request to OpenAI, and when it is turned away for being too busy (rate limited, or a
 * server error on their side) waits as long as it is told to, or a growing pause, and tries again.
 * Running out of credit is not retried: waiting will not fix it.
 */
export async function sendWithRetry(
  send: () => Promise<Response>,
  sleep: Sleep = realSleep,
): Promise<Response> {
  let waited = 0;
  for (let attempt = 0; ; attempt++) {
    const response = await send();
    if (!retryable(response.status)) return response;
    const body = await response
      .clone()
      .text()
      .catch(() => '');
    if (/insufficient_quota/.test(body))
      throw new ProviderBusy(
        'The OpenAI account is out of credit. Add credit to it, then ask again.',
      );
    const pause = Math.min(
      20_000,
      toldToWait(response, body) ?? 1000 * 2 ** attempt + Math.random() * 400,
    );
    if (attempt + 1 >= MAX_TRIES || waited + pause > MAX_WAIT_MS) {
      if (response.status === 429)
        throw new ProviderBusy(
          'OpenAI is turning requests away right now (this account is at its per-minute limit). Try again in a minute.',
        );
      return response;
    }
    waited += pause;
    await sleep(pause);
  }
}

const retryable = (status: number) => status === 429 || status === 500 || status >= 502;

/** The wait OpenAI asks for: its retry headers, else "try again in 1.2s" / "in 350ms" in the message. */
function toldToWait(response: Response, body: string): number | null {
  const ms = Number(response.headers.get('retry-after-ms'));
  if (ms > 0) return ms;
  const s = Number(response.headers.get('retry-after'));
  if (s > 0) return s * 1000;
  const said = body.match(/try again in (\d+(?:\.\d+)?)\s*(ms|s)\b/i);
  if (said) return Number(said[1]) * (said[2].toLowerCase() === 'ms' ? 1 : 1000) + 100;
  return null;
}

/** An OpenAI error message fit to show people: no account or organisation ids. */
export const plainDetail = (message: string) =>
  message
    .replace(/\s*in organization org-[A-Za-z0-9]+/g, '')
    .replace(/\borg-[A-Za-z0-9]+/g, 'the account')
    .slice(0, 160);

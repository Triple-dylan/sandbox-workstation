import { readFileSync } from 'node:fs';
import type { Store } from './store.ts';
import type { AgentLimits, AgentRuntime } from './agents/runtime.ts';
import { createOpenAIRuntime, FALLBACK_RUNTIME } from './agents/openai.ts';
import { createOpenAIEmbedder, type Embedder } from './agents/embed.ts';

/** Reads KEY=VALUE pairs from the repository-root .env. Existing environment variables win. */
export function loadEnv(path = new URL('../../.env', import.meta.url)) {
  let text = '';
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || line.trimStart().startsWith('#')) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

// Safety nets against a runaway loop or a surprise bill, not rations: a call is about 3-4k tokens.
export const DEFAULT_DAILY_TOKENS = 10_000_000;

/** Meaning-based search uses OpenAI embeddings whenever agents use OpenAI. */
export function selectEmbedder(env: NodeJS.ProcessEnv): Embedder | undefined {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) return undefined;
  return createOpenAIEmbedder({ apiKey: key });
}

/** Reads the spend guardrails, falling back to defaults for anything unset or invalid. */
export function agentLimits(env: NodeJS.ProcessEnv): AgentLimits {
  const n = (key: string, fallback: number) => {
    const value = Number(env[key]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    spaceTokensPerDay: n('AGENT_SPACE_DAILY_TOKENS', 3_000_000),
    personTokensPerDay: n('AGENT_PERSON_DAILY_TOKENS', 1_000_000),
    requestsPerMinute: n('AGENT_REQUESTS_PER_MINUTE', 20),
  };
}

/** Without a key, agents are not connected: they say so and answer nothing. Nothing stands in. */
export const notConnected: AgentRuntime = {
  id: 'none',
  label: 'Not connected',
  run: () =>
    Promise.reject(
      new Error(
        'agents are not connected on this server yet: it needs an OpenAI key (OPENAI_API_KEY).',
      ),
    ),
};

export function selectRuntime(env: NodeJS.ProcessEnv, store: Store): AgentRuntime {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) return notConnected;
  const limit = Number(env.OPENAI_DAILY_TOKEN_LIMIT);
  // Dylan's Nous Research key: answers only when OpenAI cannot. Never a choice or a setting.
  const nous = env.NOUS_API_KEY?.trim();
  return createOpenAIRuntime({
    ...(nous
      ? {
          fallback: {
            apiKey: nous,
            addUsage: (tokens, dollars) =>
              store.addProviderUsage(FALLBACK_RUNTIME, tokens, dollars),
          },
        }
      : {}),
    apiKey: key,
    dailyTokenLimit: Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_DAILY_TOKENS,
    usageToday: () => store.usageToday(),
    addUsage: (tokens) => store.addUsage(tokens),
  });
}

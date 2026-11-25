import { readFileSync } from 'node:fs';
import type { Store } from './store.ts';
import type { AgentRuntime } from './agents/runtime.ts';
import { scriptedRuntime } from './agents/scripted.ts';
import { createOpenAIRuntime } from './agents/openai.ts';

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

export const DEFAULT_DAILY_TOKENS = 200_000;

export function selectRuntime(env: NodeJS.ProcessEnv, store: Store): AgentRuntime {
  const key = env.OPENAI_API_KEY?.trim();
  if (env.AGENT_RUNTIME === 'scripted') return scriptedRuntime;
  if (!key) {
    return {
      id: 'unavailable',
      label: 'Model unavailable',
      async run() {
        throw new Error('An OpenAI API key is required to run this agent.');
      },
    };
  }
  const limit = Number(env.OPENAI_DAILY_TOKEN_LIMIT);
  return createOpenAIRuntime({
    apiKey: key,
    dailyTokenLimit: Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_DAILY_TOKENS,
    usageToday: () => store.usageToday(),
    addUsage: (tokens) => store.addUsage(tokens),
  });
}

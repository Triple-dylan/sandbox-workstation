/** Every application agent uses this model. No environment, client or per-agent override. */
export const AGENT_MODEL = 'gpt-6-luna';

/**
 * Only when OpenAI cannot answer (busy after waiting, out of credit, down or unreachable), agents
 * answer with this model through Dylan's Nous Research key instead, and the reply says so. Nous has
 * retired its own Hermes models; this is Claude Sonnet 5.5 on Nous's router (Dylan's choice).
 */
export const FALLBACK_MODEL = 'anthropic/claude-sonnet-5.5';
export const FALLBACK_LABEL = 'Claude Sonnet 5.5';
export const FALLBACK_RUNTIME = 'nous';
const NOUS_BASE_URL = 'https://inference-api.nousresearch.com/v1';

import { readResult, taskPrompt } from './prompt.ts';
import { BudgetExceeded, type AgentResult, type AgentRuntime, type AgentTask } from './runtime.ts';
import { plainDetail, ProviderBusy, sendWithRetry, type Sleep } from './retry.ts';

type Options = {
  apiKey: string;
  dailyTokenLimit: number;
  usageToday: () => number;
  addUsage: (tokens: number) => void;
  fetch?: typeof fetch;
  baseUrl?: string;
  /** How to wait between tries when OpenAI is busy; tests pass one that does not really wait. */
  sleep?: Sleep;
  /** Nous Research, used only when OpenAI cannot answer. */
  fallback?: {
    apiKey: string;
    fetch?: typeof fetch;
    baseUrl?: string;
    /** Records what the fallback used, so its prepaid credit can be watched. */
    addUsage: (tokens: number, dollars: number) => void;
  };
};

/** OpenAI could not answer at all, as opposed to answering badly: the fallback may step in. */
class Unavailable extends Error {}

/**
 * The exact shape every answer must take. Strict mode makes the model fill every field (null or
 * empty when unused), so answers can't drift into prose or invent fields.
 */
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
export const answerSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'replies', 'sources', 'proposal', 'handoff', 'orientation', 'skip'],
  properties: {
    reply: { type: 'string' },
    replies: { type: 'array', items: { type: 'string' } },
    sources: { type: 'array', items: { type: 'string' } },
    proposal: nullable({
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'title', 'body'],
      properties: {
        kind: {
          type: 'string',
          enum: [
            'create-doc',
            'edit-doc',
            'edit-cells',
            'create-agent',
            'add-step',
            'create-skill',
          ],
        },
        title: { type: 'string' },
        body: { type: 'string' },
      },
    }),
    handoff: nullable({
      type: 'object',
      additionalProperties: false,
      required: ['to', 'request'],
      properties: { to: { type: 'string' }, request: { type: 'string' } },
    }),
    orientation: nullable({ type: 'string' }),
    skip: { type: 'boolean' },
  },
} as const;

export function createOpenAIRuntime(options: Options): AgentRuntime {
  const openai = provider({
    name: 'OpenAI',
    model: AGENT_MODEL,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl ?? 'https://api.openai.com/v1',
    fetch: options.fetch ?? fetch,
    sleep: options.sleep,
    retry: true,
  });
  const fallback = options.fallback
    ? provider({
        name: FALLBACK_LABEL,
        model: FALLBACK_MODEL,
        apiKey: options.fallback.apiKey,
        baseUrl: options.fallback.baseUrl ?? NOUS_BASE_URL,
        fetch: options.fallback.fetch ?? fetch,
        // OpenAI has already been waited on; the fallback is asked once.
        retry: false,
      })
    : null;
  return {
    id: 'openai',
    label: 'OpenAI',
    model: AGENT_MODEL,
    ...(fallback ? { fallback: FALLBACK_LABEL } : {}),
    async run(task: AgentTask): Promise<AgentResult> {
      if (options.usageToday() >= options.dailyTokenLimit)
        throw new BudgetExceeded(`Daily token budget of ${options.dailyTokenLimit} reached.`);
      let answer: Answer;
      try {
        answer = await openai(task);
      } catch (error) {
        if (!fallback || !(error instanceof Unavailable)) throw error;
        try {
          answer = await fallback(task);
        } catch (second) {
          throw new Error(
            `${error.message} The ${FALLBACK_LABEL} fallback could not answer either: ${second instanceof Error ? second.message : 'unknown error'}`,
          );
        }
        options.addUsage(answer.result.tokens ?? 0);
        options.fallback!.addUsage(answer.result.tokens ?? 0, answer.dollars);
        return { ...answer.result, runtime: FALLBACK_RUNTIME };
      }
      options.addUsage(answer.result.tokens ?? 0);
      return answer.result;
    },
  };
}

type Answer = { result: AgentResult; dollars: number };

/** One OpenAI-compatible chat endpoint that answers a task in the strict answer shape. */
function provider(p: {
  name: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  fetch: typeof fetch;
  sleep?: Sleep;
  retry: boolean;
}) {
  // If the model ever refuses the strict schema, fall back to plain JSON mode for this server's life.
  let strict = true;
  const format = () =>
    strict
      ? { type: 'json_schema', json_schema: { name: 'answer', strict: true, schema: answerSchema } }
      : { type: 'json_object' };
  return async (task: AgentTask): Promise<Answer> => {
    const once = () =>
      p.fetch(`${p.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${p.apiKey}` },
        body: JSON.stringify({
          model: p.model,
          response_format: format(),
          max_completion_tokens: 900,
          messages: [
            // The whole prompt in one message, steady parts first, so the provider's prefix cache applies.
            { role: 'user', content: taskPrompt(task) },
          ],
        }),
        signal: AbortSignal.timeout(45_000),
      });
    const send = async () => {
      try {
        return await (p.retry ? sendWithRetry(once, p.sleep) : once());
      } catch (error) {
        if (error instanceof ProviderBusy) throw new Unavailable(error.message);
        // Never reached it: no connection, or no answer in time.
        throw new Unavailable(`${p.name} could not be reached.`);
      }
    };
    let response = await send();
    if (response.status === 400 && strict) {
      const text = await response.clone().text();
      if (/response_format|json_schema/i.test(text)) {
        strict = false;
        response = await send();
      }
    }
    if (!response.ok) {
      // Never include request headers or the key; status and a short API message only.
      let detail = '';
      try {
        const body = (await response.json()) as any;
        detail = plainDetail(String(body?.error?.message ?? body?.message ?? ''));
      } catch {}
      const message = `${p.name} request failed (${response.status})${detail ? `: ${detail}` : ''}`;
      throw response.status === 429 || response.status >= 500
        ? new Unavailable(message)
        : new Error(message);
    }
    const data = (await response.json()) as any;
    // Tokens served from the provider's cache are billed at a fraction; count them as such.
    const cached = Number(data?.usage?.prompt_tokens_details?.cached_tokens ?? 0);
    const tokens = Math.max(0, Number(data?.usage?.total_tokens ?? 0) - Math.round(cached * 0.5));
    let parsed: any = {};
    let malformed = false;
    try {
      parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? '{}');
      malformed = !parsed || typeof parsed !== 'object' || Array.isArray(parsed);
    } catch {
      // Plain prose instead of JSON: keep it as the reply in case the retry does no better.
      parsed = { reply: String(data?.choices?.[0]?.message?.content ?? '') };
      malformed = true;
    }
    return {
      result: { ...readResult(parsed), tokens, ...(malformed ? { malformed } : {}) },
      // Nous reports what each call cost; OpenAI does not.
      dollars: Math.max(0, Number(data?.usage?.cost ?? 0)) || 0,
    };
  };
}

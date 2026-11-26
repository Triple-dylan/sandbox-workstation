/** Every application agent uses this model. No environment, client or per-agent override. */
export const AGENT_MODEL = 'gpt-6-luna';

import { readResult, taskPrompt } from './prompt.ts';
import { BudgetExceeded, type AgentResult, type AgentRuntime, type AgentTask } from './runtime.ts';

type Options = {
  apiKey: string;
  dailyTokenLimit: number;
  usageToday: () => number;
  addUsage: (tokens: number) => void;
  fetch?: typeof fetch;
  baseUrl?: string;
};

/**
 * The exact shape every answer must take. Strict mode makes the model fill every field (null or
 * empty when unused), so answers can't drift into prose or invent fields.
 */
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
export const answerSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'sources', 'proposal', 'handoff', 'orientation', 'skip'],
  properties: {
    reply: { type: 'string' },
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
  const request = options.fetch ?? fetch;
  const baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
  // If the model ever refuses the strict schema, fall back to plain JSON mode for this server's life.
  let strict = true;
  const format = () =>
    strict
      ? { type: 'json_schema', json_schema: { name: 'answer', strict: true, schema: answerSchema } }
      : { type: 'json_object' };
  return {
    id: 'openai',
    label: 'OpenAI',
    model: AGENT_MODEL,
    async run(task: AgentTask): Promise<AgentResult> {
      if (options.usageToday() >= options.dailyTokenLimit)
        throw new BudgetExceeded(`Daily token budget of ${options.dailyTokenLimit} reached.`);
      const send = () =>
        request(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            model: AGENT_MODEL,
            response_format: format(),
            max_completion_tokens: 900,
            messages: [
              // The whole prompt in one message, steady parts first, so the provider's prefix cache applies.
              { role: 'user', content: taskPrompt(task) },
            ],
          }),
          signal: AbortSignal.timeout(45_000),
        });
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
          detail = String(((await response.json()) as any)?.error?.message ?? '').slice(0, 160);
        } catch {}
        throw new Error(`OpenAI request failed (${response.status})${detail ? `: ${detail}` : ''}`);
      }
      const data = (await response.json()) as any;
      // Tokens served from the provider's cache are billed at a fraction; count them as such.
      const cached = Number(data?.usage?.prompt_tokens_details?.cached_tokens ?? 0);
      const tokens = Math.max(0, Number(data?.usage?.total_tokens ?? 0) - Math.round(cached * 0.5));
      options.addUsage(tokens);
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
      const result: AgentResult = {
        ...readResult(parsed),
        tokens,
        ...(malformed ? { malformed } : {}),
      };
      return result;
    },
  };
}

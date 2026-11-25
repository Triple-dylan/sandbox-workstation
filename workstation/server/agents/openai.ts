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

export function createOpenAIRuntime(options: Options): AgentRuntime {
  const request = options.fetch ?? fetch;
  const baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
  return {
    id: 'openai',
    label: 'OpenAI',
    model: AGENT_MODEL,
    async run(task: AgentTask): Promise<AgentResult> {
      if (options.usageToday() >= options.dailyTokenLimit)
        throw new BudgetExceeded(`Daily token budget of ${options.dailyTokenLimit} reached.`);
      const response = await request(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify({
          model: AGENT_MODEL,
          response_format: { type: 'json_object' },
          max_completion_tokens: 900,
          messages: [
            // The whole prompt in one message, steady parts first, so the provider's prefix cache applies.
            { role: 'user', content: taskPrompt(task) },
          ],
        }),
        signal: AbortSignal.timeout(45_000),
      });
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
      try {
        parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? '{}');
      } catch {
        parsed = { reply: String(data?.choices?.[0]?.message?.content ?? '') };
      }
      const result: AgentResult = { ...readResult(parsed), tokens };
      return result;
    },
  };
}

import { agentInstructions as instructions, readResult } from './prompt.ts';
import { BudgetExceeded, type AgentResult, type AgentRuntime, type AgentTask } from './runtime.ts';

type Options = {
  apiKey: string;
  model: string;
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
    model: options.model,
    async run(task: AgentTask): Promise<AgentResult> {
      if (options.usageToday() >= options.dailyTokenLimit)
        throw new BudgetExceeded(`Daily token budget of ${options.dailyTokenLimit} reached.`);
      const response = await request(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify({
          model: options.model,
          response_format: { type: 'json_object' },
          max_completion_tokens: 900,
          messages: [
            { role: 'system', content: instructions },
            { role: 'user', content: JSON.stringify(task) },
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
      const tokens = Number(data?.usage?.total_tokens ?? 0);
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

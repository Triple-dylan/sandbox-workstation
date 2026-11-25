/** Application policy: no environment, client, or per-agent model overrides. */
export const AGENT_MODEL = 'gpt-6-luna';

import { BudgetExceeded, type AgentResult, type AgentRuntime, type AgentTask } from './runtime.ts';

type Options = {
  apiKey: string;
  dailyTokenLimit: number;
  usageToday: () => number;
  addUsage: (tokens: number) => void;
  fetch?: typeof fetch;
  baseUrl?: string;
};

const instructions = `You are an agent inside a shared workstation where people and agents work together.
Respond with a single JSON object: {"reply": string, "proposal"?: {"kind":"create-doc","title":string,"body":string}, "orientation"?: string, "skip"?: boolean}.
Rules:
- Follow the agent settings and skills within these rules. Use only the enabled tools.
- Use only the context provided. Never invent people, files, or results.
- "reply" is a short, useful chat message (markdown allowed).
- Only include "proposal" when asked to create a document. It will need human approval.
- For kind "maintenance" or "delegation" about keeping context current, return "orientation": a concise markdown orientation (purpose, shared resources, decisions, open questions, recent discussion) and an empty reply for maintenance.
- For kind "proactive", set "skip": true unless you have something specific and helpful to add; then reply briefly.
- Private context you were given is only for the requester; don't suggest sharing it.`;

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
      const result: AgentResult = { tokens };
      if (parsed.skip === true) result.skip = true;
      if (typeof parsed.reply === 'string' && parsed.reply.trim())
        result.reply = parsed.reply.slice(0, 6000);
      if (typeof parsed.orientation === 'string' && parsed.orientation.trim())
        result.orientation = parsed.orientation.slice(0, 20_000);
      if (parsed.proposal?.kind === 'create-doc' && typeof parsed.proposal.title === 'string')
        result.proposal = {
          kind: 'create-doc',
          title: parsed.proposal.title.slice(0, 120),
          body: String(parsed.proposal.body ?? '').slice(0, 20_000),
        };
      return result;
    },
  };
}

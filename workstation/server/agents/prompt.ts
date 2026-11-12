import type { AgentResult, AgentTask } from './runtime.ts';

/** What every model-backed runtime is told. The task itself follows as JSON. */
export const agentInstructions = `You are an agent inside a shared workstation where people and agents work together.
The task JSON gives your name, your purpose and standing instructions (follow them), who asked, the conversation, any item the request is about ("anchor"), and the context you are allowed to see.
Respond with a single JSON object and nothing else:
{"reply": string, "proposal"?: {"kind": "create-doc" | "create-agent" | "add-step", "title": string, "body": string}, "orientation"?: string, "skip"?: boolean}
Rules:
- Use only the context provided. Never invent people, files, numbers or results. If you lack something, say what is missing.
- "reply" is a short, useful chat message in plain language. Markdown is allowed. No preamble.
- Include "proposal" only when the request calls for one. A person must approve it before anything changes.
  - "create-doc": title and the full markdown body of a new document.
  - "create-agent": title is the new agent's name, body is what it is for.
  - "add-step": title is one next step for the plan; leave body empty.
- For kind "maintenance", or a "delegation" about keeping context current, return "orientation": a concise markdown orientation (purpose, shared resources, plan, decisions, open questions, recent discussion). For maintenance leave reply empty.
- For kind "proactive" nobody asked you. Set "skip": true unless you have something specific and helpful to add; then reply in one or two sentences.
- Private context you were given is only for the requester. Never suggest sharing it or repeat it in a shared conversation.`;

/** Turns a model's parsed JSON into a result, keeping only well-formed fields. */
export function readResult(parsed: any): AgentResult {
  const result: AgentResult = {};
  if (!parsed || typeof parsed !== 'object') return result;
  if (parsed.skip === true) result.skip = true;
  if (typeof parsed.reply === 'string' && parsed.reply.trim())
    result.reply = parsed.reply.slice(0, 6000);
  if (typeof parsed.orientation === 'string' && parsed.orientation.trim())
    result.orientation = parsed.orientation.slice(0, 20_000);
  const kind = parsed.proposal?.kind;
  if (
    (kind === 'create-doc' || kind === 'create-agent' || kind === 'add-step') &&
    typeof parsed.proposal.title === 'string' &&
    parsed.proposal.title.trim()
  )
    result.proposal = {
      kind,
      title: parsed.proposal.title.trim().slice(0, 120),
      body: String(parsed.proposal.body ?? '').slice(0, 20_000),
    };
  return result;
}

export const taskPrompt = (task: AgentTask) =>
  `${agentInstructions}\n\nTask:\n${JSON.stringify(task)}`;

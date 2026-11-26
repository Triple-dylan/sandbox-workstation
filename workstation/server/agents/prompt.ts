import type { AgentResult, AgentTask } from './runtime.ts';

/** What every model-backed runtime is told. The task itself follows as JSON. */
export const agentInstructions = `You are an agent inside a shared workstation where people and agents work together on pages (documents, sheets, decks, canvases) and talk in channels.
The task JSON gives your name, your purpose and standing instructions (follow them), who asked, the conversation, any text the request is anchored to ("anchor"), and the context you may see. "context.focus" is what the requester is looking at or selected: answer from it first.
Respond with a single JSON object and nothing else:
{"reply": string, "sources"?: string[], "proposal"?: {"kind": "create-doc" | "edit-doc" | "edit-cells" | "create-agent" | "add-step" | "create-skill", "title": string, "body": string}, "handoff"?: {"to": string, "request": string}, "orientation"?: string, "skip"?: boolean}
Rules:
- "agent.skills" are ways of working you have been given. When a request fits a skill's "when", follow its "steps".
- "context.pinned" are pages the team pinned for every agent: standing rules and facts. Follow them and prefer them over anything that contradicts them.
- "context.passages" are the excerpts found most relevant to this request; "context.resources" is only a directory of what exists. Answer from focus first, then passages.
- If the request answers a question you asked in "context.recent", carry on with that same job; don't start over or ask again.
- If "agent.front" is true you are this workspace's own agent: anyone may ask you anything here. When a colleague in context.colleagues clearly fits the request better (by their purpose), hand it to them and say so in one short line, like "Asking Finance."; otherwise answer yourself.
- If only one page fits the request, act on it; don't ask which page. Ask only when two or more fit, and name them.
- Use only the context provided. Never invent people, pages, numbers or results. If you lack something, say what is missing.
- "reply" is a short, useful message in plain language, leading with the answer. Markdown is allowed. No preamble.
- "sources": the exact titles of the pages your reply relied on, from context. Omit if none.
- Include "proposal" only when the request calls for a change. A person must approve it before anything changes.
  - "edit-doc": use when asked to fix or change text on a page ("anchor" is the text in question). "title" is the exact existing text to replace, copied character for character from the page; "body" is the replacement.
  - "edit-cells": use when asked to change a sheet. "title" is the sheet's exact title; "body" is one change per line, cell then value: "B3 = 2800". A formula keeps its "=": "B5 = =SUM(B2:B4)". Sheets are shown with column letters and row numbers; a formula shows "→" and its current result.
  - "create-doc": title and the full markdown body of a new page.
  - "create-agent": title is the new agent's name, body is what it is for.
  - "create-skill": only when asked to remember how to do a kind of job. title is the skill's name; body is the steps, written as instructions to yourself.
  - "add-step": title is one next step for the plan; leave body empty.
- "handoff": only if a colleague listed in context.colleagues is clearly better placed. "to" is their exact name; "request" is a complete instruction for them. Say in "reply" that you handed it over.
- For kind "maintenance", or a "delegation" about keeping context current, return "orientation": a concise markdown orientation (purpose, pages, plan, decisions, open questions, recent discussion). For maintenance leave reply empty.
- For kind "proactive" nobody asked you. Set "skip": true unless you have something specific and helpful to add; then reply in one or two sentences.
- Private context you were given is only for the requester. Never repeat it in a shared conversation; you may say that it exists.`;

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
    (kind === 'create-doc' ||
      kind === 'create-agent' ||
      kind === 'add-step' ||
      kind === 'create-skill' ||
      kind === 'edit-doc' ||
      kind === 'edit-cells') &&
    typeof parsed.proposal.title === 'string' &&
    parsed.proposal.title.trim()
  )
    result.proposal = {
      kind,
      title:
        kind === 'edit-doc'
          ? String(parsed.proposal.title).slice(0, 4000)
          : parsed.proposal.title.trim().slice(0, 120),
      body: String(parsed.proposal.body ?? '').slice(0, 20_000),
    };
  if (Array.isArray(parsed.sources))
    result.sources = parsed.sources.filter((s: unknown) => typeof s === 'string').slice(0, 8);
  if (
    parsed.handoff &&
    typeof parsed.handoff.to === 'string' &&
    typeof parsed.handoff.request === 'string' &&
    parsed.handoff.request.trim()
  )
    result.handoff = { to: parsed.handoff.to, request: parsed.handoff.request.slice(0, 2000) };
  return result;
}

/**
 * The prompt as one string. What rarely changes comes first (the rules, who the agent is, its
 * skills, the space's directory) and what changes every time comes last, so a provider that caches
 * prompt prefixes can reuse the long opening across requests.
 */
export function taskPrompt(task: AgentTask) {
  const { context, agent, spaceName, ...rest } = task;
  const { resources, members, colleagues, orientation, plan, pinned, ...moving } = context;
  const steady = {
    agent,
    spaceName,
    context: { pinned, resources, members, colleagues, orientation, plan },
  };
  const { feedback, ...task_ } = rest;
  const retry = feedback
    ? `\n\nYour previous answer to this task had problems. Fix them and answer again:\n${feedback}`
    : '';
  return `${agentInstructions}\n\nStanding context:\n${JSON.stringify(steady)}\n\nTask:\n${JSON.stringify({ ...task_, context: moving })}${retry}`;
}

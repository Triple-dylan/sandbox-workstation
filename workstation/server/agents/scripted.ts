import type { AgentResult, AgentRuntime, AgentTask } from './runtime.ts';

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);

function search(task: AgentTask, query: string) {
  // The engine has already ranked the passages for this request; fall back to the directory.
  if (task.context.passages.length)
    return task.context.passages.slice(0, 4).map((p) => ({
      title: p.title,
      kind: p.kind,
      excerpt: p.text
        .replace(/[#*_|>]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    }));
  const terms = words(query);
  if (!terms.length) return [];
  return task.context.resources
    .map((r) => ({
      r,
      score: terms.filter((t) => `${r.title} ${r.excerpt}`.toLowerCase().includes(t)).length,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.r);
}

const KIND_NAMES: Record<string, string> = {
  doc: 'Document',
  sheet: 'Sheet',
  deck: 'Deck',
  canvas: 'Canvas',
  asset: 'File',
};

/** Cut text at a word boundary, with an ellipsis when something was left out. */
function clip(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut
    .slice(0, Math.max(cut.lastIndexOf(' '), max * 0.6))
    .replace(/[\s,;:.\-–—]+$/, '')}…`;
}

/** Markdown read as one plain line: no heading marks, emphasis, table bars or list bullets. */
function plain(text: string) {
  return text
    .replace(/[#*_`>|]/g, ' ')
    .replace(/^\s*[-+]\s+/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** What a page is, in a line someone can read. Grids (sheets, decks, canvases) are named, not dumped. */
function pageLine(r: { title: string; kind: string; excerpt: string }) {
  const kind = KIND_NAMES[r.kind] ?? 'Page';
  if (r.kind !== 'doc') return `- **${r.title}** · ${kind.toLowerCase()}`;
  const text = plain(r.excerpt);
  const body = text.toLowerCase().startsWith(r.title.toLowerCase())
    ? text.slice(r.title.length).trim()
    : text;
  return `- **${r.title}**${body ? ` · ${clip(body, 90)}` : ''}`;
}

const DECIDED = '[decided] ';

/**
 * The workspace summary page, built without a model: what is here, what has been decided (messages
 * someone marked Decided), what is still asked, and what people said last.
 */
export function orientationFor(task: AgentTask) {
  const { resources, recent, plan } = task.context;
  const decided = recent.filter((m) => m.text.startsWith(DECIDED));
  const said = recent.filter((m) => !m.text.startsWith(DECIDED));
  const questions = said.filter((m) => m.text.trim().endsWith('?'));
  const steps = plan.filter((s) => !s.done);
  const lines = [
    `# ${task.spaceName}`,
    '',
    `_Kept current by ${task.agent.name} from the pages and chats everyone here can see._`,
    '',
    '## Pages',
    ...(resources.length
      ? resources.slice(0, 12).map(pageLine)
      : ['- None yet. Make one with the + next to Pages, or drop a file anywhere.']),
    ...(steps.length
      ? [
          '',
          '## Plan',
          ...steps
            .slice(0, 6)
            .map(
              (s) =>
                `- ${s.step}${s.owner ? ` · ${s.owner}` : ''}${s.due ? ` · due ${s.due.slice(0, 10)}` : ''}`,
            ),
        ]
      : []),
    '',
    '## Decided',
    ...(decided.length
      ? decided.slice(-5).map((m) => `- ${clip(m.text.slice(DECIDED.length), 160)} · ${m.author}`)
      : ['- Nothing yet. Mark a message Decided and it shows here.']),
    ...(questions.length
      ? ['', '## Asked', ...questions.slice(-5).map((m) => `- ${clip(m.text, 160)} · ${m.author}`)]
      : []),
    '',
    '## Lately',
    ...(said.length
      ? said.slice(-5).map((m) => `- ${m.author}: ${clip(m.text, 120)}`)
      : ['- Quiet so far.']),
  ];
  return lines.join('\n');
}

/** Deterministic stand-in for a model. Everything it says is derived from the task; nothing is invented. */
export const scriptedRuntime: AgentRuntime = {
  id: 'scripted',
  label: 'Scripted demo runtime',
  async run(task): Promise<AgentResult> {
    const text = task.request.trim();
    if (task.kind === 'maintenance') return { orientation: orientationFor(task) };
    if (task.kind === 'delegation') {
      if (/orientation|context|keep .*up to date|summary|summari[sz]e/i.test(text))
        return {
          reply: `On it. I'll keep doing this as work changes: “${text}”. You can stop it from the agent panel.`,
          orientation: orientationFor(task),
        };
      return {
        reply: `Noted as an ongoing responsibility: “${text}”. The scripted runtime can only maintain the orientation and summaries; connect a model for anything else.`,
      };
    }
    if (task.kind === 'proactive') {
      const related = search(task, text);
      if (!related.length) return { skip: true };
      return { reply: `This may help: ${related.map((r) => `**${r.title}**`).join(', ')}.` };
    }
    const newAgent = text.match(
      /\b(?:create|make|add|set up|spin up)\s+(?:a |an |another )?(?:new )?agent\b(?:\s+(?:called|named))?\s*[:“"']?([^"”'\n,.]*?)["”']?(?:\s*(?:,|\.)?\s*(?:to|for|that|who)\s+([^\n]+))?$/i,
    );
    if (newAgent) {
      const name = (newAgent[1] || '').trim() || 'New agent';
      const purpose = (newAgent[2] || '').trim().replace(/[.!?]+$/, '');
      return {
        reply: `I can add an agent called **${name}**${purpose ? ` to ${purpose}` : ''}. A person needs to approve it first.`,
        proposal: { kind: 'create-agent', title: name, body: purpose },
      };
    }
    const swap = text.match(/replace (?:it |this )?with[:\s]+["“]?([^"”\n]+)["”]?/i);
    if (task.anchor && swap)
      return {
        reply: `I suggested the change on **${task.anchor.title}**. It needs approval.`,
        proposal: { kind: 'edit-doc', title: task.anchor.quote, body: swap[1].trim() },
        sources: [task.anchor.title],
      };
    const pass = text.match(
      /\b(?:ask|hand(?: this)? to|have)\s+([A-Z][\w' -]{1,30}?)\s+(?:to\s+)?(.{4,})/,
    );
    const colleague =
      pass &&
      task.context.colleagues.find((c) => c.name.toLowerCase() === pass[1].trim().toLowerCase());
    if (pass && colleague)
      return {
        reply: `I handed that to **${colleague.name}**.`,
        handoff: { to: colleague.name, request: pass[2].trim() },
      };
    const learn = text.match(
      /\b(?:remember|learn|save)\s+(?:how to|a skill(?: called| for)?)\s+([^:\n]{3,60})(?::\s*([\s\S]+))?/i,
    );
    if (learn)
      return {
        reply: `I can keep **${learn[1].trim()}** as a skill. It needs a yes first.`,
        proposal: {
          kind: 'create-skill',
          title: learn[1].trim().replace(/[.!?]+$/, ''),
          body: (learn[2] ?? `Steps for: ${learn[1].trim()}`).trim(),
        },
      };
    const skill = task.agent.skills.find((s) =>
      words(`${s.name} ${s.when}`).some((w) => text.toLowerCase().includes(w)),
    );
    const step = text.match(
      /\b(?:add|put)\s+(?:a |another )?(?:step|goal|task|item)\b(?:\s+(?:to (?:the )?plan|called|for|to))?\s*[:“"']?([^"”'\n]+)/i,
    );
    if (step && step[1].trim().length > 2) {
      const title = step[1].trim().replace(/[.!?]+$/, '');
      return {
        reply: `I can add **${title}** to the plan once someone approves it.`,
        proposal: { kind: 'add-step', title, body: '' },
      };
    }
    const create = text.match(
      /\b(?:create|draft|write|make|start)\s+(?:a |an |the )?(?:new )?(?:doc|document|page|brief|plan|note)\b(?:\s+(?:called|titled|named|for|about))?\s*[:“"']?([^"”'\n]*)/i,
    );
    if (create) {
      const title = (create[1] || '').trim().replace(/[.!?]+$/, '') || 'Untitled';
      const body = [
        `# ${title}`,
        '',
        task.anchor
          ? `Started from: “${task.anchor.quote}”`
          : `Requested by ${task.requester ?? 'a teammate'}.`,
        '',
        '## Notes',
        '- ',
      ].join('\n');
      return {
        reply: `I drafted **${title}**. It needs approval because it adds shared work.`,
        proposal: { kind: 'create-doc', title, body },
      };
    }
    const focus = task.context.focus;
    if (focus.length && /\b(summary|summari[sz]e|this|these|selected|compare)\b/i.test(text))
      return {
        reply: focus
          .map(
            (f) =>
              `**${f.title}**: ${f.body
                .replace(/[#*_|>-]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 160)}`,
          )
          .join('\n\n'),
        sources: focus.map((f) => f.title),
      };
    if (/\b(summary|summari[sz]e|status|catch me up|what'?s (new|happening))\b/i.test(text)) {
      const { resources, recent } = task.context;
      return {
        reply: [
          `**${task.spaceName}**: ${resources.length} item${resources.length === 1 ? '' : 's'} I can see.`,
          ...resources.slice(0, 5).map((r) => `- ${r.title}`),
          recent.length
            ? `Latest: ${recent.at(-1)!.author} — “${recent.at(-1)!.text.slice(0, 100)}”`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      };
    }
    const found = search(task, text.replace(/^(find|search|look for|where is)\s+/i, ''));
    if (found.length && skill)
      return {
        reply: `Following **${skill.name}**:\n${skill.steps.slice(0, 400)}\n\nWhat I found:\n${found.map((r) => `- **${r.title}** — ${r.excerpt.slice(0, 120)}`).join('\n')}`,
        sources: [...new Set(found.map((r) => r.title))],
      };
    if (found.length)
      return {
        reply: `Here's what I can see that matches:\n${found.map((r) => `- **${r.title}** — ${r.excerpt.slice(0, 160) || r.kind}`).join('\n')}`,
        sources: [...new Set(found.map((r) => r.title))],
      };
    return {
      reply:
        "I'm running on the scripted demo runtime, so I only understand a few requests: “create a doc called …”, “summarize”, “find …”, or delegations such as “keep the orientation up to date”. Connect a model to get real answers.",
    };
  },
};

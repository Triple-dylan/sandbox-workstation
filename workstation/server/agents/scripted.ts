import type { AgentResult, AgentRuntime, AgentTask } from './runtime.ts';

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);

function search(task: AgentTask, query: string) {
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

export function orientationFor(task: AgentTask) {
  const { resources, recent } = task.context;
  const decisions = recent.filter((m) => /\b(decided|decision|agreed|we will)\b/i.test(m.text));
  const questions = recent.filter((m) => m.text.trim().endsWith('?'));
  const lines = [
    `# ${task.spaceName}`,
    '',
    '_Maintained automatically by the project agent from shared work in this project._',
    '',
    '## Shared resources',
    ...(resources.length
      ? resources.map(
          (r) => `- **${r.title}** (${r.kind})${r.excerpt ? ` — ${r.excerpt.slice(0, 80)}` : ''}`,
        )
      : ['- Nothing shared yet.']),
    '',
    '## Decisions so far',
    ...(decisions.length
      ? decisions.slice(-5).map((m) => `- ${m.text} — ${m.author}`)
      : ['- None recorded yet.']),
    '',
    '## Open questions',
    ...(questions.length
      ? questions.slice(-5).map((m) => `- ${m.text} — ${m.author}`)
      : ['- None open.']),
    '',
    '## Recent discussion',
    ...(recent.length
      ? recent.slice(-5).map((m) => `- ${m.author}: ${m.text.slice(0, 120)}`)
      : ['- No discussion yet.']),
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
    if (found.length)
      return {
        reply: `Here's what I can see that matches:\n${found.map((r) => `- **${r.title}** — ${r.excerpt.slice(0, 90) || r.kind}`).join('\n')}`,
      };
    return {
      reply:
        "I'm running on the scripted demo runtime, so I only understand a few requests: “create a doc called …”, “summarize”, “find …”, or delegations such as “keep the orientation up to date”. Add an OpenAI key to give me real answers.",
    };
  },
};

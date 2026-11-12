import type { Proposal } from '../../../shared/types.ts';

/** How a proposal reads to the person deciding it. */
export function proposalText(p: Proposal) {
  if (p.kind === 'create-agent')
    return { ask: `Add agent “${p.title}”?`, title: `New agent: ${p.title}` };
  if (p.kind === 'add-step')
    return { ask: `Add “${p.title}” to the plan?`, title: `Plan step: ${p.title}` };
  return { ask: `Create “${p.title}”?`, title: `New document: ${p.title}` };
}

import type { Proposal } from '../../../shared/types.ts';

/** How a proposal reads to the person deciding it. */
export function proposalText(p: Proposal, pageTitle?: string) {
  if (p.kind === 'create-agent')
    return { title: `Add an agent called “${p.title}”`, yes: 'Add', no: 'Decline' };
  if (p.kind === 'add-step')
    return { title: `Add “${p.title}” to the plan`, yes: 'Add', no: 'Decline' };
  if (p.kind === 'edit-cells')
    return {
      title: `Suggested change${pageTitle ? ` to ${pageTitle}` : ''}`,
      yes: 'Apply',
      no: 'Decline',
    };
  if (p.kind === 'sheet-ops') {
    const op = (/"op"\s*:\s*"([a-z-]+)"/.exec(p.body)?.[1] ?? 'change') as string;
    const what: Record<string, string> = {
      pivot: 'A pivot',
      sort: 'Sorting',
      filter: 'A filter',
      'clear-filter': 'Clearing the filter',
      total: 'A totals row',
    };
    return {
      title: `${what[op] ?? 'A change'}${pageTitle ? ` on ${pageTitle}` : ''}`,
      yes: 'Apply',
      no: 'Decline',
    };
  }
  if (p.kind === 'edit-doc')
    return {
      title: `Suggested edit${pageTitle ? ` to ${pageTitle}` : ''}`,
      yes: 'Accept',
      no: 'Decline',
    };
  return { title: `New document: ${p.title}`, yes: 'Keep', no: 'Discard' };
}

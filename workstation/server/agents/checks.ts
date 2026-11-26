import { cellEdits } from '../../shared/formula.ts';
import type { JobKind } from '../../shared/types.ts';
import type { AgentResult } from './runtime.ts';

/** What an answer is checked against: only things the agent was actually given. */
export type CheckContext = {
  kind: JobKind;
  /** Titles of every page the agent may read, lower-cased. */
  titles: Set<string>;
  /** The page an edit would change, if there is one in question. */
  editTarget: { title: string; body: string } | null;
  colleagues: string[];
  /** Titles of the sheets the agent may change, lower-cased. */
  sheets: Set<string>;
};

/**
 * Problems with a model's answer that the model can fix if told. Each is written as an
 * instruction back to the model, so the same text serves as feedback for one retry.
 */
export function problemsWith(result: AgentResult, ctx: CheckContext): string[] {
  const problems: string[] = [];
  if (result.malformed)
    problems.push(
      'Your answer was not a single JSON object in the required shape. Return only that object.',
    );
  const asked = ctx.kind === 'ask' || ctx.kind === 'instruction';
  if (asked && !result.skip && !result.reply && !result.proposal && !result.malformed)
    problems.push('Your answer had no "reply". Someone asked you something: answer it.');
  const unknown = (result.sources ?? []).filter((t) => !ctx.titles.has(t.toLowerCase()));
  if (unknown.length)
    problems.push(
      `These "sources" are not pages you were given: ${unknown.map((t) => `"${t}"`).join(', ')}. Use exact page titles from context, or leave them out.`,
    );
  const p = result.proposal;
  if (p?.kind === 'edit-doc') {
    if (!ctx.editTarget)
      problems.push(
        'You proposed "edit-doc" but no page is in question. Ask which page to change, or propose "create-doc" instead.',
      );
    else if (!ctx.editTarget.body.includes(p.title))
      problems.push(
        `The text to replace ("title" of your edit-doc) does not appear on "${ctx.editTarget.title}" exactly. Copy it character for character from the page, including punctuation and line breaks.`,
      );
  }
  if (p?.kind === 'edit-cells') {
    if (!ctx.sheets.has(p.title.trim().toLowerCase()))
      problems.push(
        `"${p.title}" is not a sheet you were given. For "edit-cells", "title" is a sheet's exact title.`,
      );
    if (!cellEdits(p.body))
      problems.push(
        'The "body" of your edit-cells is not one change per line like "B3 = 2800". Write only lines of a cell and its value.',
      );
  }
  if (result.handoff) {
    const to = result.handoff.to.toLowerCase();
    if (!ctx.colleagues.some((c) => c.toLowerCase() === to))
      problems.push(
        ctx.colleagues.length
          ? `"${result.handoff.to}" is not one of your colleagues (${ctx.colleagues.join(', ')}). Use an exact name or answer yourself.`
          : `You have no colleagues to hand work to. Answer yourself.`,
      );
  }
  return problems;
}

/**
 * After the one retry, removes whatever is still wrong so nothing false is posted, and says
 * plainly in the reply what was left out.
 */
export function keepOnlyValid(result: AgentResult, ctx: CheckContext): AgentResult {
  const out: AgentResult = { ...result };
  const notes: string[] = [];
  if (out.sources) out.sources = out.sources.filter((t) => ctx.titles.has(t.toLowerCase()));
  if (
    out.proposal?.kind === 'edit-doc' &&
    (!ctx.editTarget || !ctx.editTarget.body.includes(out.proposal.title))
  ) {
    delete out.proposal;
    notes.push(
      ctx.editTarget
        ? `I couldn't match the text to change on "${ctx.editTarget.title}", so I haven't suggested an edit.`
        : "I couldn't tell which page to change, so I haven't suggested an edit. Open the page or select the text and ask again.",
    );
  }
  if (
    out.proposal?.kind === 'edit-cells' &&
    (!ctx.sheets.has(out.proposal.title.trim().toLowerCase()) || !cellEdits(out.proposal.body))
  ) {
    delete out.proposal;
    notes.push("I couldn't put that change to the sheet together, so I haven't suggested it.");
  }
  if (
    out.handoff &&
    !ctx.colleagues.some((c) => c.toLowerCase() === out.handoff!.to.toLowerCase())
  ) {
    notes.push(
      `I couldn't hand this to "${out.handoff.to}": there's no colleague by that name here.`,
    );
    delete out.handoff;
  }
  if (out.malformed && !out.reply)
    out.reply = "I couldn't put an answer together. Try asking again.";
  delete out.malformed;
  if (notes.length) out.reply = [out.reply, ...notes].filter(Boolean).join('\n\n');
  return out;
}

# Select and ask: point at part of a page, say what you want, see it done

_Plan, 2026-11-27. Steps 1–5 (the sheet feature) are built: #48, #49, #53, #54, #52. Steps 6–8 are not._

"Where it stands today" below describes the app before steps 1–5.

## The goal

Highlight a range on a sheet, tell your agent "make a pivot of this by region", and a real pivot
appears on the sheet, correct and checkable, ready to keep or undo. The same pattern (select, ask,
see the result in place, keep or undo) should work on every page kind.

## Where it stands today

- **Selecting and asking already works.** Drag a range, and "Ask about B2:D9" sends the agent the
  whole sheet plus the range. Presets exist for cells: explain, check the maths, what's driving it,
  suggest a fix (`src/app/Rail.tsx` `ASKS.cells`).
- **The range reaches the agent as flat text**, `"B2:D9: 4 / North / 1200 / …"`
  (`src/pages/SheetPage.tsx:332`). The agent loses the shape: which row is the header, which
  column is which.
- **The only sheet change an agent can make is `edit-cells`**, a list of lines like `F3 = 2800`
  (`shared/types.ts` `Proposal`). Asked for a pivot today, the model works out every total itself
  and writes them as fixed numbers. That breaks in three ways: the model does the arithmetic and can
  get it wrong; the numbers go stale when the data changes; and a 40-cell pivot is 40 lines the
  person can't easily check.
- **The formula engine has only SUM, AVERAGE, COUNT, MAX and MIN** (`shared/formula.ts`). A pivot
  can't be written as live formulas until it has conditional sums.
- **A sheet is one grid with no tabs.** A result can go beside the data or onto a new page. It
  can't go onto another tab.

## The design for sheets

**The core idea:** the model picks *what* to do; code does the doing. The agent sends a typed
operation such as `pivot { rows: "Region", values: [sum "Amount"] }`. Shared code runs it against
the real cells. The model never computes a number.

1. **The selection is sent as structure, not text.** `asking` carries
   `{ resourceId, range: { r0, c0, r1, c1 }, header: boolean }` alongside the quote, and the agent's
   context gets that block as a small table with column names. A selection that looks like a table
   (text in the top row, values below) is treated as headed.
2. **Sheet operations.** A new proposal kind, `sheet-ops`: a short list of typed steps run by
   `shared/sheetOps.ts`, the same code on server and client.
   - `pivot`: group by one or two columns; sum, count, average, min or max of others; optional
     column split (a cross-tab).
   - `sort` and `filter` (filter hides rows; it never deletes).
   - `dedupe`, `fill-column` (a formula filled down a new or existing column),
     `format` (number, currency, percent), `freeze`.
   - `summarise`: totals, subtotals by group.
   - `chart`: a chart of a range shown on the sheet (and later placeable on a canvas or deck;
     see below).
   - Anything that fits none of these falls back to today's `edit-cells`.
3. **Pivots are written as live formulas.** Add `SUMIF(S)`, `COUNTIF(S)` and `AVERAGEIF(S)` to the
   formula engine. A pivot is then a block of ordinary cells such as
   `=SUMIFS(D2:D200, B2:B200, H3)`: correct by construction, it recomputes when the data changes,
   and any cell can be clicked to see how it's worked out. It also survives the Google Sheets and
   Excel link, since those apps read the same formulas. The group labels are written once, so a
   region added later needs "Refresh pivot", which re-runs the same op. The op is kept on the
   sheet for that.
4. **Where results land.** By default, in the first clear columns to the right of the data, two
   columns apart, with a bold header naming what it is. "On a new page" makes a new sheet page
   instead, holding values (there are no cross-page references). Nothing is ever written over
   existing cells without saying so in the preview.
5. **Preview in place, then keep or undo.** The proposed result is drawn on the sheet as a tinted
   ghost block, before anything is saved, with Keep / Discard beside it. This is the same pattern
   the canvas uses for drafted pages. Keep applies it through the existing approval path. Undo uses
   the existing `edit-cells` undo snapshot. With "small changes at once", a pivot still previews,
   because it adds many cells.
6. **New presets on a selected range:** Pivot this…, Sort / filter…, Total by…, Chart this,
   Clean up (trim, dedupe, fix number formats). Each opens the ask box pre-filled, so the person
   only adds the column names. Free text still works for anything else.
7. **The same ops for people.** Every op the agent can run also sits in the sheet's own menu
   (right-click the range: Pivot, Sort, Filter, Chart). The agent is a faster way in, not the
   only way. It also makes each op testable without a model.
8. **Checks.** `server/agents/checks.ts` validates a `sheet-ops` proposal before it's shown:
   columns exist, the target area is clear or the overwrite is named, and the op is within the
   row and column limits. A bad op goes back to the model with the reason, as `edit-cells` does
   today.

## The same pattern across the app

One shared shape everywhere: **a selection** (what you pointed at), **an ask** (preset or your
words), **a typed action** (run by code, not described in prose), **a preview in place**, then
**keep or undo**.

| Page | Select | Ask for | Result |
|---|---|---|---|
| Document | text, a list, a table | rewrite; shorten; turn into a checklist; turn this table into a sheet; make plan steps from these lines; split into its own page | edit in place with a tracked-change look; a new sheet or page linked back; steps on the plan |
| Canvas | stickies, shapes, cards (marquee) | group into sections by theme; connect related pieces; lay out as a timeline; write this up as a doc; make plan steps | pieces moved, grouped or added as ghosts; a new doc placed on the canvas |
| Deck | one or more slides | tighten the words; speaker notes; split or merge slides; a slide from this sheet range or doc section | slide edits previewed on the slide; new slides inserted after |
| Chat | a run of messages | record the decision; make steps with owners; summarise for someone who missed it; a doc from this thread | a Decided message; plan steps; a new page, each linked to the messages |
| Graph | several nodes | compare these; what links these; a hub page for this cluster | an answer that lights the nodes; a new page joined to them |
| Browser page | text on the page | bring this into a page with its source; check it against our pages | a quote with its link on the chosen page |
| Across pages | a sheet range | chart it on this canvas or deck; put it in the doc as a live table | a live piece that updates with the sheet (the live-piece embed exists for messages and canvas cards) |

### What it needs underneath (built once, used by every page)

- **One selection type** in place of today's `{ resourceId, quote }`:
  `{ resourceId, kind: 'range' | 'text' | 'pieces' | 'slides' | 'messages' | 'nodes', ref, quote }`.
  Each page reports its own `ref`; the rail's presets key off `kind` (this generalises `ASKS`).
- **An action registry per page kind:** typed ops with a JSON schema, one executor in `shared/`,
  exposed to the model as structured output (`server/agents/openai.ts`) and to people as menu
  commands. `edit-doc`, `edit-cells` and `create-doc` become the first entries rather than
  special cases.
- **A preview layer per page:** a ghost rendering of the proposed ops, with Keep / Discard. The
  canvas already has one for drafted pages; sheet, doc and deck each get theirs.
- **Undo for every op**, as a snapshot of what it touched, so making a change at once is always
  safe.
- **Provenance:** every result links back to the selection it came from ("from B2:D40 of Sales"),
  in the page feed and on the result.

## Order of work (one small PR each)

1. Conditional formulas: SUMIF(S), COUNTIF(S), AVERAGEIF(S), with tests.
2. Structured range selection sent to the agent.
3. `shared/sheetOps.ts` with `pivot`, `sort`, `filter` and `total`, plus tests. Sheet menu
   commands for people.
4. The `sheet-ops` proposal kind: prompt, schema, checks, apply and undo through approvals.
5. Ghost preview on the sheet with Keep / Discard; the new range presets.
6. The `chart` op (drawn on the sheet).
7. The general selection type and action registry, moving `edit-doc` and `edit-cells` onto it.
8. Then page by page, most used first: document (table to sheet, lines to steps), canvas
   (group, lay out), chat (decision, steps), deck, then cross-page live charts.

Steps 1–5 are the sheet feature Dylan asked for. Steps 6–8 bring it to the rest of the app.

## Assumed (say if wrong)

- Pivots are live formulas, not a separate pivot object. This keeps sheets plain cells and keeps
  the Google Sheets and Excel link working. A refresh is needed only when new groups appear.
- Results go beside the data by default, not onto a new page.
- Sheet tabs are out of scope here.

## Not decided

- Whether a filter hides rows for everyone or only for you. Recommended: for everyone, shown as a
  bar ("Filtered: Region = North · Clear"), because a sheet is shared.
- Chart types beyond bar, line and pie.

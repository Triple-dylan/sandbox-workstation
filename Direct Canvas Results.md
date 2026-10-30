# Direct canvas writing and spatial interaction revision

October 29, 2026. Implements the user's “proceed” after their direct-writing clarification and the preceding drag, chat and fixed-module review. This is a local interaction trial, not user acceptance or a completed multi-user product.

## Review translated into implementation

| User feedback / measured failure | Implemented behavior |
| --- | --- |
| Writing should start by clicking the canvas, without spawning a text box | Click empty Canvas to place a caret at that location. Type directly in frameless text on the surface. There is no Write launcher, card, header or textarea around it. |
| A blank canvas should remain blank until useful work exists | An unused caret is transient. The first non-whitespace text creates the private source and placement together; leaving empty focus creates no saved resource. |
| Held dragging only moved an outline; grid drawing and geometry disagreed | The actual content follows the pointer continuously through valid positions. A separate destination guide shows the snapped result. Drawing, movement, placement and keyboard steps use one 24px grid. |
| Modules should snap without surprising collateral changes | A normal move preserves neighbours. Shift-drag deliberately requests an edge pair. Collision/bounds checks apply to both; invalid moves retain the last valid position. Escape, pointer cancellation and window blur abandon the move. A cancelled drag cannot become a canvas-writing click. |
| Fixed right modules must never scroll | Fixed cards, bodies and stack use non-scrolling overflow. Short summaries show a bounded number of records with explicit complete-view actions. At short heights they reduce to actionable headers. The full goal database stays in the canvas plan; complete sources use the resource explorer. |
| Work modules should differ from fixed utilities | Document/agent inspection and conversation work use paper-like surfaces, 6px corners and shallow work shadows. Fixed summaries use compact 12px glass cards without those shadows. Native writing, pins, visuals and planning retain content-specific treatment. |
| Navigation/chat views conflicted and shifted work 104px | Conversation is now a retained work surface inside the workspace row, with its composer attached. The navigation list uses the retained conversation width; opening history preserves the canvas's horizontal origin. The beside-work relationship remains. |

## Text behavior and identity

Click existing writing to edit/select normally. Its unobtrusive controls appear on hover or focus. Enter splits text at the caret, Shift+Enter keeps a newline, and heading/list/checklist insertion retains the existing block model. Text wraps and grows within available space. Long writing can scroll within its own content area when bounded space is exhausted; this is separate from the prohibition on scrolling fixed utilities.

An empty-canvas keyboard focus plus Enter is an alternative entry point. Move/resize controls are separate from editing. Moving typed content uses the same geometry checks as other canvas objects. Closing writing closes its placement, retaining the source for search/reopening. Canvas, Files, private Graph and source reader use one local resource ID; edits and Markdown export retain that identity. Graph clicks retain graph navigation and inspection rather than creating writing.

`contenteditable="plaintext-only"` supplies direct text entry and strips rich paste formatting. The implementation follows the browser editing model described in [MDN's contenteditable reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/contenteditable). This remains lightweight structured writing, not a full word processor: cross-block structural undo, advanced selection/formatting and document revision history remain further work.

## Review it locally

1. Open Canvas at port 4174. Click an empty location and type. No setup dialog or editor box appears. Click away from an unused caret; reload and confirm no blank source was saved.
2. Open Conversations → #product-direction. Discussion and its input stay together beside work. Return to the list and reopen history; the canvas horizontal origin stays stable. Draft recipients remain unchanged by opening a source.
3. Drag a work header or the writing grip. Content moves before release; its guide indicates the grid destination. Escape restores the starting arrangement. Use Shift near an adjacent module edge only when requesting paired placement.
4. Open Project tools. Sources, Project agent and Goals remain compact independent summaries. Open plan / View all sources reaches complete records. Date editing, reordering and creation belong in the complete plan, not an ever-growing utility list.
5. Open a source on Graph. The graph remains the main surface; inspection and fixed utilities have different visual roles. No working agent is invented from a saved local definition.

## Evidence and limits

- [Light: direct text, source-linked pin, beside conversation and compact utilities](workstation/evidence/direct-canvas-light.png)
- [Dark: the same intentionally opened work](workstation/evidence/direct-canvas-dark.png)
- [Graph with document inspection and independent fixed utilities](workstation/evidence/direct-graph-inspection.png)

Captures are made through actual interactions in isolated browser contexts. They illustrate a deliberately composed work state, not a new populated default. The user's preview storage has not been reset or seeded. Existing browser-local resources, goals, messages, drafts, layouts and image records remain.

Capacity still matters: extremely short/narrow windows may require closing a supporting view or enlarging the window before a complete work tool can fit. The app explains that limit and retains records. Summary links do not grant access or replace missing authoritative permissions. This revision does not make the beside-work conversation freely draggable onto the canvas.

Real accounts, human delivery, collaborative persistence, server authorization, canonical image indexing/sharing, deployed/executing agents, automatic context maintenance and live agent-job activity on Graph remain unbuilt. A dedicated project definition is still local configuration. No provider, production stack or paid service was silently selected.


## Final verification

All **51 browser scenarios passed in one complete run**, with no skipped/cancelled cases. This includes exact click/caret location, no empty persisted records, first-character focus, caret splitting, source reader/Graph/reload identity, actual held movement, drag cancellation, visible-grid alignment, stable list/history horizontal origin, and fixed utility scroll rejection under a 60-goal fixture at 1000/720/500/320px heights. The complete plan's last goal was reached at the 1000/720px sizes; header-only short states retained all records. A short-window text reopening check uses text minimums rather than full-tool dimensions.

TypeScript/production build, Prettier and whitespace checks passed. Build still reports the upstream Lucide `use client` directive warning and a 502.74 kB minified JavaScript chunk above Vite's default 500 kB warning threshold. These are recorded performance/bundling work, not test failures.

The initial verification run caught a drag-cancellation click accidentally placing an empty caret; the implementation now suppresses that trailing click. Existing source-reader/writing checks were updated for contextual controls and complete-source navigation, then the finished full suite was rerun. Passing tests cover the exercised local interactions; they do not prove visual acceptance, real multiplayer or permission enforcement.

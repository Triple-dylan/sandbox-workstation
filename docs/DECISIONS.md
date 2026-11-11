# Decision log

Newest first. Confirmed by Dylan unless marked *assumed* or *open*.

## 2026-11-11 — review and interview

- **Foundation:** keep the demo server; rebuild the client on it. Dylan wants a real version to test locally before deploying, and left the technical choice to the builder.
- **Order of work:** look and feel, then a canvas worth using, then agents.
- **Visual:** evolve the monochrome glass. Colour only for people, agents and content.
- **Canvas:** living board. Opening an object grows it into a full working view while the rest of the board folds into a shelf; closing returns to the board as it was. Chosen from three concepts shown as screens.
- **Agents:** animated orbs for now. The small clay "character with eyes" style was rejected. Characters are welcome later only if they are fun without doing too much.
- *Open:* how private items appear on a shared board. A dashed "Only you" outline is built for review; Dylan was unsure what the question meant, so judge it in the running app.

## 2026-11-05 — direction reset

- **Build the real product** (backend, real identities and data, running agents). Stop the UI-only redesign loop. Overhauls are welcome.
- **Demo first:** local first and zero-cost. If it goes on the web, use Cursor app publishing rather than paid Convex, Clerk or Vercel. No paid providers yet.
- **Agents:** a pluggable runtime. A scripted stub is the default; OpenAI turns on when `OPENAI_API_KEY` is set server-side, with a cheap model and a daily token guard.
- **Multiplayer** from the first real build (Dylan plus a second and ideally a third person).
- **All five first-message situations** must work.
- **Agents are characters;** the style is still open.
- **Canvas starts blank but usable;** no demo planning-doc content.
- `prototype/` deleted; recoverable from tag `archive/prototype-2026-10-28`.
- Repo moved off the iCloud Desktop to `~/sandbox-workstation`.
- *Assumed:* docs consolidated into SPEC / DECISIONS / STATE with an archive; adopt an off-the-shelf rich-text editor later; Office and browser modules deferred until the core loop works.
- *Demo simplifications (assumed, revisit after the demo):*
  - Shared canvas notes keep one shared position; per-person placement layers come later.
  - Demo sign-in is "pick your name on this server" with no passwords. It is not real auth.

## 2026-10-31 — agent presence interview

- Graph shows agent avatars **at active resources**.
- Clicking an agent shows **work and conversation first**.
- Agents can be created both conversationally and with a deliberate Create agent action.
- Style: tentative interest in soft 3D characters and restrained avatars ("1 and 3 maybe").
- **No universal first-send audience.** Expectations vary by situation (instruction, private ask, person, selected work, delegation). Explore these together.

## 2026-10-29

- **Unsolicited agent replies allowed** (not @mention-only).
- Click-to-write directly on the canvas (no spawned text box).
- Right utilities never scroll. Work modules look distinct from fixed utilities.
- No overlapping popups. Other users get profile photos and colored names (a color exception).
- Graph document reading is required (an earlier ambiguity was resolved).
- Notion is a positive reference for native content (not a schema to copy).

## 2026-10-28

- Rebuild approved. Tiled six-pane layout rejected; Graph and Canvas are full primary surfaces.
- Monochrome controls (replacing blue accents). Decorative graph-center glyph removed.
- Project context is the starting point, not a boundary. Routine context upkeep needs no approval; consequential shared edits do.
- Sharing changes the original; variants carry ancestry.

## Open

- First-send default per situation and reply presentation (the demo uses an explicit audience chip; review it).
- Agent character art direction and whether agents carry color.
- Production stack and LLM budget beyond the demo.
- Whether retiring an agent drains its running jobs or stops them.

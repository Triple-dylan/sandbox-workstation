# Decision log

Newest first. Confirmed by Dylan unless marked *assumed* or *open*.

## 2026-11-05 — agent character: dynamic Orb (thinking-orbs)

- Dylan confirmed **dynamic particle orbs** via npm `thinking-orbs@0.2.0` (same as DropDeployment), not the SVG ring.
- State → verb: idle → `breathing`, working → `working`, waiting-for-approval → `shaping`; brief failed holds a static breathing frame.
- Sizes stay chat/rail 18, canvas 26, graph 28, panel 40 (nearest package preset 20/64 for particle tuning).
- Package is monochrome; faint per-agent hue tint stays a host wash. Respects `prefers-reduced-motion`.

## 2026-11-05 — agent character: Orb

- **Orb** is the agent character (option 2 from the comparison page). Abstract core inside a thin ring; no face.
- *Superseded for motion/renderer by the thinking-orbs decision above;* name and tint intent remain.
- State is motion: idle pulse, working = sweeping arc, waiting = held dot with pulsing ring.
- Monochrome-first with only a faint per-agent tint from hue. Shape (round / tall / wide) still varies identity.
- Replaces the pastel gradient blob as the default everywhere (chat/rail 18, canvas 26, graph 28, panel 40).

## 2026-11-05 — direction reset

- **Build the real product** (backend, real identities and data, running agents). Stop the UI-only redesign loop. Overhauls are welcome.
- **Demo first:** local first and zero-cost. If it goes on the web, use Cursor app publishing rather than paid Convex, Clerk or Vercel. No paid providers yet.
- **Agents:** a pluggable runtime. A scripted stub is the default; OpenAI turns on when `OPENAI_API_KEY` is set server-side, with a cheap model and a daily token guard.
- **Multiplayer** from the first real build (Dylan plus a second and ideally a third person).
- **All five first-message situations** must work.
- **Agents are characters;** style later settled as Orb (see above).
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
- Whether agents should carry more color than Orb's faint tint.
- Production stack and LLM budget beyond the demo.
- Whether retiring an agent drains its running jobs or stops them.

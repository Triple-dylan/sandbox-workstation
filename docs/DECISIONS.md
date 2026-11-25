# Decision log

Newest first. Confirmed by Dylan unless marked *assumed* or *open*.

## 2026-11-07 — expanded MVP scope

Dylan confirmed OpenAI gpt-6-luna exclusively for all agents, with no user ability to change models. Google login and MVP deployment preparation are required, along with reachable/movable Canvas components, native documents/sheets, group goals, deployable agent instructions/routines/skills/resources and redesigned group conversations. See [the phased plan](project/mvp-plan.md). These requirements are not claims of implementation.

## 2026-11-06 — repair implementation after “proceed”

Implementation choices, not new user-confirmed visual decisions: one independently expandable navigation tree; app strip for visibility/new chat/account; participant identity opens private conversation; settings expand within agent conversations; a bounded Graph reader and existing ancestor nodes replace the side column and Full graph button. Details and verification: [experience-repair-plan.md](project/experience-repair-plan.md).

Live execution is now the default in accordance with the user's real-use requirement. Missing keys and budget exhaustion never substitute scripted output. Live model verification was attempted Nov 7 after configuration; it is now blocked by the provider response HTTP 429, no credits remaining. External plugin integrations and the older prototype's richer Canvas remain explicitly unimplemented.

## 2026-11-06 — corrections to the implemented UI

- [Consolidated corrections and review gates](project/product-corrections.md) govern the next UI changes. Older plans and implemented components do not override these corrections.
- Arial for now; open Canvas/Graph, fixed floating minimizable tools, no tool column or hidden tools rail, and no full-height Graph reader column.
- Keep both left navigation areas with distinct jobs. Workspace headings collapse/expand in place instead of switching the active view. Current private/workspace switching and Members placement need revision.
- Collaborative agents are participants; real work/conversation/status comes first. The standalone project-agent view and agent popup are rejected.
- A group sees its messages with or without a mention. Personal agent chats are private. Private questions during collaboration must be simple; no new dedicated button. The current recipient mechanism is not approved merely because it was implemented.
- Remove delegation mode and pointless single-option dropdowns. The standalone Full graph button is rejected and reported to stick; preserve Graph navigation and investigate the state issue.
- Real use is required. Only populated Graph folder structure may be mock data. The earlier default scripted demo is not acceptance evidence for live use.
- Additional far-left destinations and the exact reader, agent-module and private-question interactions remain open. Do not invent approval for a replacement layout.

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

- Precise private-question interaction and workspace reply presentation. Group visibility and personal-chat privacy are settled; do not re-ask who can read those messages.
- Whether agents should carry more color than Orb's faint tint.
- Production stack and LLM budget beyond the demo.
- Whether retiring an agent drains its running jobs or stops them.

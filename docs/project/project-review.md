# Sandbox Workstation — project review

_Snapshot from Nov 5, 2026 (pre-cleanup / pre-demo). For current direction see [project-context.md](./project-context.md) and [overhaul-plan.md](./overhaul-plan.md); for what ships today see [../STATE.md](../STATE.md)._

Reviewed Nov 5, 2026. Read the working tree that later moved to `~/sandbox-workstation` (remote `Triple-dylan/sandbox-workstation`, then on `main`) without changing it. Checks run are listed in §2.4.

## TL;DR

- **Intent:** a general-purpose, canvas-first workstation where people and agents work together. It has a physics graph of permitted context, and agents **automatically maintain project context**. That automatic context upkeep is the stated core value.
- **Reality:** a browser-only React interaction proof (`workstation/`, about 5.8k lines of TS/TSX plus 3.5k lines of CSS) with no backend, no real users or delivery, and no executing agents. The data is a single localStorage blob plus images in IndexedDB. None of the core value exists yet, and the build stages that would deliver it (Rebuild Plan stages B–F) were never started.
- **Trajectory:** 19 commits in 5 days (Oct 27–31). The cycle repeated: user rejects the UI, then a review, then a plan, then an implementation, then the next rejection. Oct 30–31 was interview-only. The last code commit is `12bb1e2` (Oct 29).
- **Biggest problems:** (1) about 46k words across 21 root docs that contradict each other and are hedged in every paragraph; (2) a 2,000-line `main.tsx` god-component; (3) CSS layered in four iteration-named files; (4) the repo sits in iCloud Desktop sync (5,380 `node_modules` files evicted; build took 8 min); (5) unresolved product decisions about chat and agents block further UI work.

---

## 1. Product intent vs. current state

**Intent** (from `README.md`, `AGENTS.md`, `Conversation Context.md`):
- General-purpose (work, design, dev, finance, hobbies), explicitly *not* coding-only and *not* messaging-first.
- Two primary surfaces in one harness:
  - **Canvas:** bounded, snapping, modules never overlap, no zoom.
  - **Graph:** full-surface, always-on anchored physics, folder nesting, typed nodes. Agents appear as avatars at the resources they are actively using.
- Shell: left rail, floating composer, independent right utilities (Sources, Agent, Goals) that never scroll.
- Private and shared spaces. Sharing keeps one canonical identity; a variant is a new item with ancestry. Provenance must not leak private sources.
- Every collaborative project gets a dedicated agent by default. Agents gather and maintain context automatically. Consequential shared changes need approval. Unsolicited agent replies are allowed (confirmed).
- Lightweight sequential goals: owner, agent assignment, deadline.
- Web is the delivery target.

**Current state (`workstation/`, port 4174):**

| Area | State |
| --- | --- |
| Canvas | Click-to-write text (contenteditable plaintext blocks), message pins, image references (IndexedDB), sequential plan, 24px grid, collision-checked drag/resize, one saved "arrangement" snapshot |
| Graph | d3-force graph of 4 repo docs plus private local docs, folder focus, one reusable inspector. No agents, jobs or activity data path |
| Conversations | Local-only messages, drafts per conversation and thread, local search. Authors are plain strings; no participant model, delivery or unread state |
| Agents | Local definition/version editor and export. Test/deploy honestly shows "no runtime" |
| Backend / identity / sharing / retrieval / agent runtime / Office / browser engines | **None.** No provider or stack has been chosen |
| Seed content | Self-referential: the "resources" are the project's own planning docs, copied in by `scripts/snapshot-sources.mjs`; seed messages are Dylan's interview quotes; goals are dev tasks |

User acceptance: nothing is accepted. The latest record says "Chat remains rejected… has not meaningfully changed," and the floating-bar model is unapproved.

## 2. Architecture and stack

### 2.1 `workstation/` (current)
- React 19.3, Vite 8.3 (rolldown), TypeScript 7.0, d3-force, lucide-react, react-markdown and remark-gfm, DM Sans. Prettier only: no ESLint and no CI.
- Main files:
  - `main.tsx` (2,000 lines, 72 KB): the whole `App` (~1,700 lines, ~30 `useState`/`useRef`), all commands and layout policy.
  - `canvas-layout.ts`: pure geometry (`fits`, `arrange`, `pairSnap`).
  - `state.ts`: hand-written localStorage migration and validation.
  - `model.ts`: types and seed data.
  - Feature components: `Graph`, `Conversation`, `Composer`, `WorkActions`, `AgentEditor`, `CanvasText`, `CanvasWriting`, `CanvasContent`.
  - `components.tsx`: a grab-bag (`DocumentView`, `BrowserProof`, `Materials` specimen, `Workspace` context).
- Persistence: the whole `State` is `JSON.stringify`'d into one localStorage key (`workstation-layout-proof-v1`) on **every** state change, keystrokes included. Image blobs live in IndexedDB with no cleanup of orphans.
- Tests: `tests/workspace.test.mjs` is one 1,721-line file of ~50 Playwright cases run with `node:test`. It needs a dev server already running on 4174 and the installed Chrome channel. There are no unit tests for the pure geometry or migration code.
- Build: `prebuild`/`predev` copy four root `.md` files into `public/resources/` (gitignored), so the app depends on the repo-root docs.
- History: Dockview/Gridview was added in `58bc355` and removed in `2c1438b` after the six-pane rejection. `splitters.ts` was deleted. `legacyLayout` is still carried in state for migration.

### 2.2 `prototype/` (rejected, superseded)
- Vanilla JS in dense, semi-minified style (`app.js` is 57 KB in 148 lines, with lines up to 2,300 characters), plus a Python loopback `server.py` with `office_import.py` for DOCX/XLSX/PPTX parsing.
- It has an infinite pan/zoom canvas, sample people (Maya, Alex, Sam), Office previews and a 250-person directory fixture. Its tests are Playwright snippets meant for an external runner plus Python unittest.
- It shares no code with `workstation/`. Only the ideas carried over; the Office parser has no successor in `workstation/`.

### 2.3 `research/`
- `research/references/` holds style and rejection screenshots (Codex module style, chat list/transcript references, rejected composer/menus/tiles).
- `research/reviews/2026-10-29/` holds evidence for the Oct 29 review: Playwright probe scripts (`probe.mjs`), JSON measurements, screenshots and an HTML options mock (`chat-canvas-options.html`).
- Many of these files are **iCloud-evicted (dataless)** on disk.
- `workstation/evidence/` and `prototype/*.png` add about 30 more tracked screenshots. In total about 60 binary images are in git (`.git` is 11 MB).

### 2.4 What I ran

| Check | Result |
| --- | --- |
| `tsc -p tsconfig.json --noEmit` | ✅ pass (27s, slow because of iCloud) |
| `prettier --check` | ✅ pass |
| `vite build --outDir /tmp/...` (skipped prebuild) | ✅ pass in **8m03s**, mostly iCloud hydration. Single 502 kB chunk warning plus a lucide `"use client"` directive warning. Output deleted afterwards |
| Browser suite (`npm test`) | ⚠️ **Unverified.** The dev server I started for it was killed after the Mac went offline, and I didn't rerun it under the no-servers rule. The docs claim 57/57 passed on Oct 29 |
| `prototype/` | Not run (superseded) |

**Environment finding:** the repo lives on the iCloud-synced Desktop. 5,380 files in `workstation/node_modules`, plus parts of `research/` and the evidence images, are "dataless" (evicted). That makes every install, build and test slow and flaky. Fix: move the repo off Desktop or `.nosync` `node_modules`.

## 3. Git history

| Date | Commits | Direction |
| --- | --- | --- |
| Oct 28 | `456d472` | Initial vanilla `prototype/` plus the handoff docs |
| Oct 28 | `246cfe7`, `c3e5f21` | Interview leads to `Rebuild Plan.md` (approved); fresh start |
| Oct 28 | `58bc355` | Stage A: React/Vite `workstation/` with Dockview tiles, about 7.9k lines. **Rejected** (six-box tiling) |
| Oct 28 | `1ae6233`, `2c1438b` | Primary-surface fix: Dockview removed, full Graph/Canvas, content-sized utilities |
| Oct 28 | `7e2496f`, `3f0e6b3` | Maturity refinement: monochrome, composer, conversations, agent definitions |
| Oct 28 | `c98ba8a` | Canvas content: pins, images, plan |
| Oct 29 | `d55f427`, `1eeb027`, `507d053` | Review-only cycles (no code) |
| Oct 29 | `979a882` | Beside-work chat. **Then rejected:** dragging, rail look, scrolling utilities |
| Oct 29 | `17eff69`, `12a76d5`, `8652e56` | Review, then direct click-to-write plus drag/grid rework |
| Oct 29 | `12bb1e2` | Text/graph continuity repairs plus the proposed unified conversation model. **Last code commit** |
| Oct 30–31 | `6fb33d0`, `ae454db` | Agent presence research (OpenAI Dots, Grok Bot, OpenDot) and interview answers. Docs only |

**Abandoned directions:**
- the vanilla prototype, infinite canvas and zoom
- Office import
- the Dockview/tiled six-pane layout
- the all-in-one Project module
- blue control accents
- the "Write" launcher / text-box spawn
- canvas-colored chat rail
- scrolling utilities
- @mention-only agents
- the arbitrary recipient form
- fake identity cycling

**In flight (uncommitted, 15 added lines across `AGENTS.md`, `Agent Presence Research and Interview.md` and `Conversation Context.md`):** these record that Dylan did **not** choose a universal first-send audience and wants situational exploration first. They are safe to commit as-is.

There is one branch, no stash and no open PR. All commits are by Triple-dylan (agent-authored).

## 4. Doc sprawl

There are 21 root `.md` files, about 46k words, against about 5.8k lines of app code. Every doc repeats disclaimers ("not acceptance", "not implemented", "proposal, not decision"), which buries the signal. `AGENTS.md` (3.4k words) is an append-only log, not a spec, and it contradicts itself.

| Status | Docs |
| --- | --- |
| **Current: source of truth** | `Conversation Context.md` (canonical interview record, 9.5k words, append-only); the Oct 30–31 sections of `AGENTS.md`; `Agent Presence Research and Interview.md` (latest decisions plus pending questions) |
| **Current: behavior** | `Direct Canvas Results.md`, `workstation/README.md`, the "implemented repairs" section of `Conversation and Canvas Interaction Plan.md` |
| **Current proposal, unaccepted** | the communication contract in `Conversation and Canvas Interaction Plan.md`; `Object and Access Model.md` (still the only data/access contract, still relevant) |
| **Nominal master plan, stalled** | `Rebuild Plan.md`. Stages A–F are approved, but only stage A (UI proofs) was ever worked; B "real identities and canonical data" onward never started |
| **Partly historical** | `Workstation Review 2026-10-29.md` (6.3k words). Its P1s for image atomicity, utility focus and search are reportedly fixed in `Beside Work Results.md` (unverified). Its §4 sequence and §8 module audit are still the best gap list. `Research Review.md` is useful for T3 Code and references; its requirements are partly superseded |
| **Superseded: archive** | `Design Research and Revision Plan.md`, `Interaction Contract.md`, `prototype/README.md`, `Stage A Review.md`, `Primary Surface UX Review.md`, `Primary Surface Fix Plan.md`, `Primary Surface Fix Results.md`, `Maturity Refinement Plan.md` (4.4k words), `Maturity Refinement Results.md`, `Canvas Use Plan.md`, `Canvas Use Results.md`, `Beside Work Results.md` |

**Contradictions to resolve:**
1. `AGENTS.md` opens with "Approved joint chat/canvas choice… Do not reopen the settled layout choice." Its end and `Agent Presence…` say "Chat remains rejected… beside work does not establish approval of a fixed full-height column… existing fixed chat-column implementation is not accepted."
2. `AGENTS.md` still says Workstation Review "P1s are unfixed", while `Beside Work Results.md` and `Direct Canvas Results.md` claim fixes.
3. The Notion reference was put on "hold" (Conversation Context) and later became a "positive reference."
4. Blue accents in the Rebuild Plan and Stage A conflict with the later monochrome rule. The later rule wins, but the older docs aren't marked.
5. Test counts quoted as acceptance evidence differ across docs (66 / 51 / 57) and partly validate rejected behavior.
6. The "No Notion comparison" and "Notion positive" statements and the graph "no document viewer" ambiguity are resolved only in the latest doc.

**Recommendation:** collapse everything into four documents and move the rest to `docs/archive/`:
- `SPEC.md`: confirmed requirements only, no hedging.
- `DECISIONS.md`: dated decision log with the open questions.
- `STATE.md`: what is built and what isn't.
- A short `AGENTS.md` that routes agents to the other three.

## 5. Problems, ranked by impact

1. **The core product is unbuilt, and the process loop avoids it.** There is no identity, space, resource-revision, message-delivery or agent-runtime layer. The Oct 29 review itself warns: "Do not let another sequence of cosmetic iterations indefinitely substitute for the core service proof." Every UI decision about agent presence, chat audience or graph activity depends on data that doesn't exist.
2. **Unresolved interaction model for composer, chat and agents.** The first-send audience, reply placement, chat column and agent visual identity are all open. The docs forbid further chat/agent UI until there is an "integrated scenario" review.
3. **`main.tsx` god-component.**
   - Layout policy, persistence, commands, gestures and rendering all live in one ~1,700-line function.
   - Magic numbers (260 for the utility width, 100, 300, the 12 gap, 540) are duplicated across `roomFor`, `resizeChat` and `toggleUtilities` and are hard-coupled to CSS widths.
   - Layout fallback logic is scattered, which is the root cause of the earlier "utilities hide active work" bugs.
4. **Persistence fragility.** Whole-state localStorage writes happen on every change. There is no schema library: about 190 lines of ad-hoc validation in `state.ts`. Images are never garbage-collected. A quota failure only shows a toast. There is no export/restore for all data.
5. **Spatial model split.** Canvas objects, the inspector, utilities, popups (Open work, Account, attachments) and the conversation column each have separate placement code. The no-overlap rule has to be enforced in several places.
6. **CSS sprawl.** `style.css` (1,455 lines), `workspace.css` (1,477), `beside.css` (310) and `direct.css` (286) are named after iterations and override each other for the same selectors (`.composer` and `.conversation` appear in all four). Five `!important`s. There is no token system, despite the monochrome/glass design-system intent.
7. **Text editing is homemade.** Contenteditable blocks have no structural undo, inline formatting, range anchors or collaboration readiness. The Interaction Plan itself recommends a proven editor foundation.
8. **Weak typing of core entities.**
   - `Message.author` is a string with an optional `authorId`.
   - `Goal.owner` is free text with no agent assignment field.
   - Tool IDs are string-prefix encoded (`pin:`, `visual:`, `writing:`).
   - Graph node kinds are only project/folder/document.
9. **Test harness.** One giant browser-test file depends on a manually started server and system Chrome, with no unit layer. Pass counts were used as "evidence" while the user still rejected the behavior.
10. **Repo hygiene.**
    - iCloud location (see §2.4).
    - About 60 screenshots committed to git, some labelled superseded but still tracked.
    - The dead `prototype/` (including `__pycache__` on disk) sits beside the live app.
    - The `/materials` specimen route is shipped in the app bundle.
    - Seed content is the project's own docs, which makes the demo meaningless to anyone but the builders.
    - No CI; bundle is 502 kB with no code splitting.
11. **UX gaps** (from the docs; I didn't visually verify them):
    - Narrow-pane Graph document reading is blocked by the capacity policy, and Dylan has said it is required.
    - There is no participant identity (photos or colored names) in chat.
    - There is no click/tap alternative to dragging.
    - Saved arrangements are a single unnamed geometry snapshot.
    - Close, unpin, delete and undo semantics are undefined.
    - Browser and Office modules are honest placeholders with no function.

## 6. Candidate overhaul areas

Effort is given as scope: **S** is localized, **M** spans several modules, **L** is a new subsystem or service.

| # | Overhaul | Scope / risk | Effort |
| --- | --- | --- | --- |
| 1 | **Repo reset and hygiene:** move off iCloud; archive `prototype/` to a tag or branch and delete it; move evidence images to LFS or the store; add CI (tsc, prettier, tests against `vite preview`); add ESLint | Mechanical, low risk | S |
| 2 | **Docs consolidation** into `SPEC` / `DECISIONS` / `STATE` / a short `AGENTS`, with the rest archived | Mostly editorial; needs Dylan to confirm the contradictions in §4 | S |
| 3 | **Pick a service foundation and build a thin real backend:** auth/identity, spaces and memberships, resources with revisions, messages, goals, and agent jobs/events (per `Object and Access Model.md`). Options include Postgres plus a sync layer, or a hosted realtime DB | New subsystem; stack and provider choice needed from Dylan | L |
| 4 | **App-state refactor:** extract a store (reducer or zustand) with a command layer, a persistence adapter (debounced, IndexedDB, schema-validated with zod, export/import) and typed entity IDs. Shrink `main.tsx` to composition | Touches nearly all of `main.tsx`; the browser suite is the safety net | M |
| 5 | **Unified spatial allocator** for objects, inspector, utilities, popups and the chat column. Move layout constants into one source shared with CSS. Add unit tests for `canvas-layout` | Core interaction risk; isolated in pure code | M |
| 6 | **Design-system and CSS rebuild:** tokens for monochrome glass light/dark, component-scoped styles, the four iteration files removed | Visual regressions likely; needs a review gate | M |
| 7 | **Rich editor foundation** (ProseMirror/Tiptap, Lexical or BlockNote) for canvas writing and documents. This enables range-anchored discussion | Data migration from `WritingBlock[]` | M |
| 8 | **Agent runtime plus on-graph activity:** job model and states (idle, queued, running, awaiting approval, failed, done), an event stream, avatars at active resources, and the automatic orientation and context-maintenance loop | Depends on #3; this is the defining feature | L |
| 9 | **Communication model:** an actionable audience selector, DMs, agent replies and source-linked discussion through one composer and history | Blocked on Dylan's interaction decisions; depends on #3 | M–L |
| 10 | **Real seed / demo content:** a non-self-referential sample project, or real onboarding | Small, but changes the demo's credibility | S |

Suggested order: 1, then 2, then decisions, then 4 and 5 in parallel with 3, then 8 and 9, with 6 and 7 as design gates permit. Avoid more pure-UI iteration until #3 exists.

## 7. Open questions for Dylan (decision-shaped)

1. **Keep or kill `prototype/`?** Delete it, keeping a git tag. Is anything there (for example the Office DOCX/XLSX/PPTX parser) worth porting?
2. **Next phase: service or UI?** Should the next phase be a real backend and agent-runtime slice (Rebuild stage B onward), accepting the current UI as "good enough to build on"? Or does the UI need another redesign first?
3. **Stack and provider:** may we choose a production stack now (database/sync, auth, agent runtime/LLM provider, hosting) and spend on it? Is there a cost ceiling or a preferred vendor (for example Railway, Supabase, Convex)?
4. **First real user loop:** single-player first (you plus your agents, real persistence, real agent context upkeep) with multiplayer later? Or must the first real build include a second human?
5. **Chat column:** is the current beside-work chat column a keeper to refine, or rejected outright? The docs say both.
6. **Composer audience:** of the five situations recorded (workspace instruction, private agent ask, message a person or group, discuss selected work, delegate ongoing work), which two must work first? Or should we prototype all five as clickable scenarios before choosing?
7. **Agent look:** soft 3D characters or restrained monochrome avatars? May agents carry color when the shell stays monochrome?
8. **Docs:** okay to collapse the 21 docs into `SPEC` / `DECISIONS` / `STATE` and archive the rest, and to drop the per-paragraph "not acceptance" hedging?
9. **Editor:** okay to adopt an off-the-shelf rich-text editor (ProseMirror/Tiptap-class) and migrate the current text blocks?
10. **Office and browser modules:** in scope for the MVP (which means choosing an engine or embedding approach), or out of scope until the core loop works?
11. **Repo location:** okay to move the working copy off the iCloud Desktop, for example to `~/Code/sandbox-workstation`?
12. **Demo content:** replace the self-referential seed data (the project's own docs and your interview quotes) with a realistic sample project, or keep the canvas blank and require real use?

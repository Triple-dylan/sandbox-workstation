# Sandbox Workstation — overhaul plan

Nov 5, 2026. Based on [project-review.md](./project-review.md) and Dylan's decisions in [project-context.md](./project-context.md). Repo: `~/sandbox-workstation`.

## Demo track (current priority)

_Added after Dylan's direction update (Nov 5): get a usable demo working, local first, with no paid providers and no LLM spend unless he adds his own OpenAI key. Sections 1 onward are the longer-term production plan, and are parked until the demo has been tried._

### What "usable demo" means

1. **Several people at once.** Two or three people use it together from one machine (separate browsers) or a trusted local network, with live sync and presence.
2. **The five first-message situations** all work from one composer with an explicit audience:
   - instruct the project agent
   - privately ask your own agent
   - message a person
   - discuss selected work
   - delegate ongoing work
3. **A blank but usable canvas.** A new person sees an empty canvas, clicks anywhere and types. Notes save, sync, move on the grid, and can be private or shared.
4. **Agent characters.** Each agent has a recognisable character that shows its state (idle, working, waiting for approval) in chat, on the canvas, in the graph and in the agent card.
5. **Agents that do something real** without a model: answer from project context, keep the Orientation doc current, propose docs that need approval, and take on delegated work that can be stopped. With an OpenAI key, they use a real model.

### Architecture (zero cost)

| Piece | Choice | Cost |
| --- | --- | --- |
| Server | One Node 22 process (`node:http`), TypeScript run directly, no framework | $0 |
| Storage | Built-in `node:sqlite`, one file (`workstation/data/workstation.db`) | $0 |
| Sync | Server-Sent Events push a version; clients refetch an access-filtered snapshot | $0 |
| Identity | Demo sign-in (pick or create a name). HttpOnly cookie, CSRF header. Not real auth; trusted networks only | $0 |
| Access | One access gate in the store; snapshots, agents and presence all go through it | — |
| Agents | Pluggable `AgentRuntime`: **scripted** (default, deterministic) or **OpenAI** when `OPENAI_API_KEY` is set in the gitignored root `.env`. Default model `gpt-4.1-mini`, 200k tokens per day, then fallback to scripted | $0, or a few cents a day with a key |
| Client | React 19 + Vite, the same visual language as the October proof | $0 |

**Run:** `cd workstation && npm ci && npm start`, then open http://127.0.0.1:4174. Use `HOST=0.0.0.0 npm start` for the local network.

### Status (Nov 5)

- **Cleanup: done.** Branch `cursor/cleanup-588c`.
  - `prototype/` deleted (tag `archive/prototype-2026-10-28`).
  - Docs consolidated into `SPEC`, `DECISIONS` and `STATE`; old docs moved to `docs/archive/`.
  - CI added.
- **Frontend restructure, backend and sync, the five situations, and agent characters with a pluggable runtime: done.** Branch `cursor/demo-foundation-588c`, stacked on the cleanup branch.
  - The October browser-only app and its seed content are replaced.
  - Tests: 14 server and client-logic unit tests, plus a two-browser end-to-end test. CI runs all of them.
- **Not in the demo:**
  - real accounts
  - hosting
  - images and file uploads
  - search
  - undo
  - rich-text documents (docs are Markdown)
  - the October proof's pins and plans

### Publishing through Cursor (optional, not done)

The `publish-app` tool exists, but it can only publish the workspace of the agent session that calls it. This worker's workspace is a different repo, so it can't publish `~/sandbox-workstation`.

To publish:
- run an agent session whose workspace is this repo
- swap SQLite for the Postgres that `publish-app` can attach
- swap demo sign-in for Cursor sign-in on private or team apps

The store interface is small enough for a Postgres adapter. The live-events endpoint would need checking against the host's request limits.

### Next demo steps (if Dylan wants more before production)

1. Try it with 2–3 people and collect friction.
2. Decide on the agent model: keep the scripted runtime, add an OpenAI key, or approve the production LLM choice in section 1.
3. Decide whether to publish via Cursor (Postgres + Cursor sign-in) or keep it LAN-only.

---

**Goal (production plan):** stop iterating on UI alone and ship the real product: real identities and data, live multiplayer for 2–3 people, and running agents that handle all five first-message situations, on a blank but usable canvas.

**Size key** (scope, not time):
- **S:** one area, a few PRs.
- **M:** several modules, about 5–10 PRs.
- **L:** a new subsystem, more than 10 PRs or meaningful design risk.

---

## 1. Recommended stack and providers

| Concern | Choice | Why | Alternatives considered |
| --- | --- | --- | --- |
| Backend, database and realtime | **Convex** (TypeScript functions plus a reactive document DB) | Live queries make multiplayer the default rather than an add-on. Everything is TypeScript, matching the frontend. It has scheduled functions and durable workflows for agent jobs, plus file storage and vector search, which removes 3–4 separate vendors | Supabase (Postgres, row-level security, Realtime) plus Liveblocks plus a job queue: more moving parts and three permission models to keep in sync |
| Auth and identity | **Clerk** (Google, GitHub and email magic link; invitations) | Polished sign-in and invite flows for 2–3 people, real profile photos (a stated requirement) and first-class Convex integration | Convex Auth: free and in-house, but the invite and profile UI would have to be built |
| Collaborative rich text | **Tiptap** (ProseMirror) plus **`@convex-dev/prosemirror-sync`** | An off-the-shelf editor (the assumed default) synced through the same backend, with stable node IDs for anchored discussion | BlockNote (built on Tiptap, more opinionated); Lexical (weaker collaboration story); Yjs plus Liveblocks (a second realtime vendor) |
| Presence | **`@convex-dev/presence`** component | Shows who is in this project and on which resource. It is transient and kept separate from stored data | Liveblocks presence |
| Agent runtime | **`@convex-dev/agent`** (threads, tools, message history) plus **`@convex-dev/workflow`** (durable multi-step jobs, retries) on Convex actions; LLM calls through the **Vercel AI SDK** | Agent runs, job state and activity events live in the same database the UI already subscribes to, so graph activity is just another query. No separate worker fleet | Trigger.dev or Inngest plus a worker: more control but another deployment; Cursor SDK / hosted agents: a good fit for coding tasks, not for general workspace context work |
| LLM provider | **Anthropic Claude** as the main model (a Sonnet-class model for work, a Haiku-class model for triage and proactive-trigger checks); OpenAI embeddings (`text-embedding-3-small`-class) | Strong at tool use and long context; a cheap model screens which events deserve a proactive reply | OpenRouter for multi-model routing later; Voyage for embeddings |
| Frontend hosting | **Vercel** (Pro), with per-PR preview deploys paired with Convex preview deployments | Zero-config Vite hosting with preview URLs that testers can click | Cloudflare Pages (free; preview pairing is more manual) |
| Errors and observability | **Sentry** (free developer tier) plus the Convex dashboard logs; an LLM usage table in Convex | Enough for 3 users | PostHog later, for product analytics |
| CI | **GitHub Actions** | The repo is already on GitHub | — |

### Estimated monthly cost (2–3 users)

Prices are approximate as of my knowledge; verify them at sign-up.

| Item | Estimate |
| --- | --- |
| Convex | $0 (free tier) → **$25** (Pro, one developer seat) once preview deployments or limits are needed |
| Clerk | **$0** (free tier covers far more than 3 users) |
| Vercel | **$20** (Pro, needed for non-hobby use and team previews) |
| Sentry | $0 |
| Embeddings | under $5 |
| **LLM usage** | **$50–300**, the dominant and variable cost. It is driven by proactive replies, automatic context maintenance and delegated recurring jobs |
| **Total** | **about $75–350/month** |

⚠️ **Flag:** LLM spend is the one significant cost. The plan builds in per-space and global monthly token budgets, a usage table, and automatic downgrade or pause when a budget is hit. Recommended starting hard cap: **$200/month** (a decision for Dylan, see §7).

## 2. Architecture

```
apps/web (Vite + React 19 + TS)          convex/ (backend)
 ├ routes: /s/:space/(canvas|graph)       ├ schema.ts
 │         /s/:space/r/:resource          ├ access.ts   ← single permission gate
 ├ ui store (zustand): layout, panels     ├ spaces, members, invites
 ├ layout engine (pure, unit-tested)      ├ resources, revisions, folders, files
 ├ Tiptap editors ── prosemirror-sync ──► ├ conversations, messages, anchors
 ├ Graph (d3-force) ◄─ live queries ───── ├ goals
 ├ Composer (audience + intent)           ├ agents, assignments, jobs, jobEvents, approvals
 └ presence avatars                       ├ placements, arrangements (personal views)
                                          ├ agent runtime: @convex-dev/agent + workflow
Clerk (identity) ──JWT──► Convex           └ LLM (Anthropic) / embeddings (OpenAI)
```

### Core data model

These records realize the existing [Object and Access Model](../archive/Object%20and%20Access%20Model.md).

- **users** (from Clerk: name, avatar, color).
- **spaces**: `personal | project`, with an owner.
- **memberships**: role `owner | member`.
- **invites.**
- **resources**: kind `folder | doc | image | link | orientation`. Each has `spaceId`, `parentId` (the folder tree that the graph renders), `visibility` (`private | space`), `ownerId` and `currentRevisionId`. Sharing changes visibility on the *same* record. A variant is a new resource with `derivedFrom`.
- **revisions**: `resourceId`, author (human or agent plus `jobId`), content reference, `derivedFrom`. Images are immutable stored files; publishing a new pointer is atomic.
- **conversations**: `dm | channel | thread | agent-private | resource-discussion`, with participants. **messages** carry an `authorKind` (`human | agent`), an `authorId`, and optional `anchors[]` (`resourceId`, `revisionId`, `nodeId` or range, quote).
- **goals**: ordered, with `ownerUserId`, `assignedAgentId`, `due` and optional source anchors.
- **agents**: identity, `characterId` (a placeholder art slot), `definitionVersionId` and scope. **assignments** link an agent to a space or goal. **jobs** have status `queued | running | awaiting_input | awaiting_approval | failed | done | cancelled`. **jobEvents** record operation and target resource, and feed graph activity and avatars. **approvals.**
- **placements**: per user and per space; a view of a resource or pin with its geometry. It never grants access. **arrangements** are named sets of placements.

### Three architecture rules

1. **One access gate.** Every query, mutation, search, graph projection and agent tool goes through `access.ts` (`canRead`, `canWrite`, `visibleResources`). Agents act with an explicit principal: the assigning space plus the agent's scope. They never use superuser reads.
2. **Agents are participants, not features.** Agent output is written as messages, revisions, proposals and jobEvents through the same mutations people use, with `authorKind: agent`. A shared change marked consequential creates an approval instead of applying directly.
3. **Nothing simulated.** UI states are derived only from real job and presence records.

### How the five first-message situations map

The composer always shows an explicit **audience chip**. It defaults from the current context and never changes silently.

| Situation | Audience | What happens | Where the reply appears |
| --- | --- | --- | --- |
| Workspace instruction | Project agent, in this space | A job is created with space context | The space's agent thread. Artifacts open as proposals or revisions in the viewer |
| Private agent ask | The personal agent | An `agent-private` conversation | That private conversation; nothing is visible to others |
| Message a person | A verified user | A DM, with no project required | The DM; unread state in the navigator |
| Discuss selected work | The resource's audience | A `resource-discussion` thread with an anchor; mentions notify people who have access | The thread on the resource; the anchor stays visible in the editor |
| Delegate ongoing work | An agent, via an assignment | An assignment with a trigger (schedule, event or goal) that creates jobs over time | Agent thread updates plus graph activity at the resources it touches |

## 3. Cleanup phase (Phase 0)

1. **Commit Dylan's pending decision record:** the 15 uncommitted lines across 3 docs.
2. **Prototype:** tag `archive/prototype-2026-10-28` at the current HEAD, push the tag, then `git rm -r prototype/`.
3. **Docs consolidation:**
   - Write `docs/SPEC.md` (confirmed requirements only, no hedging), `docs/DECISIONS.md` (a dated log, including the Nov 5 decisions and the open items) and `docs/STATE.md` (what is built and what isn't).
   - Cut `AGENTS.md` down to a short router plus working rules.
   - Move `Conversation Context.md` to `docs/record/` verbatim, as the canonical interview record.
   - Move the other root docs to `docs/archive/` without edits.
   - Rewrite `README.md` as a short readme.
   - Move the evidence screenshots under `docs/archive/media/`, or drop them from the tree; history keeps them.
4. **Remove demo seed content:** the `snapshot-sources.mjs` script, the predev/prebuild hooks, the seeded messages and goals, and the `/materials` route.
5. **Tooling:** ESLint (typescript-eslint plus react-hooks), Vitest, and Prettier kept as-is. GitHub Actions runs typecheck, lint and unit tests on every PR; e2e runs once Phase 2 provides a preview target. Add `.nvmrc` (Node 22).

**Size:** S. **Done when:** the root has only `README.md`, `AGENTS.md`, `docs/`, `workstation/` (or `apps/`) and config. CI is green on a PR. The tag exists on origin. A fresh clone runs `npm ci && npm run dev` to a blank canvas.

## 4. Frontend restructure (Phase 2)

- **Layout:** move to `apps/web/` with `convex/` at the root, using one npm workspace. Keep Vite, React 19 and TypeScript.
- **Routing:** TanStack Router (or React Router) with URLs for space, surface and resource, so shared links and deep links work.
- **Split `main.tsx`** (2,000 lines):
  - `app/shell` (rail, navigator, utilities host)
  - `features/canvas` (placements, gestures, writing)
  - `features/graph`
  - `features/conversations` (navigator, history, composer)
  - `features/agents`
  - `features/goals`
  - `lib/layout` (a pure allocator)
- **State:** server data comes from Convex `useQuery`/`useMutation`; nothing is mirrored into localStorage. UI-only state (open panels, drag preview, focus) lives in a small zustand store. Delete `state.ts`'s manual migration layer and the `legacyLayout` field.
- **One spatial allocator.** Canvas placements, the inspector, utilities, popovers and the conversation column all request space from `lib/layout`, which enforces no-overlap in one place. Constants (grid 24, utility width, gaps) live in one `tokens.ts` that is mirrored to CSS custom properties. Port `canvas-layout.ts` with Vitest unit tests first.
- **Design system:**
  - Replace `style.css`, `workspace.css`, `beside.css` and `direct.css` with `tokens.css` (monochrome glass, light and dark) plus CSS Modules per component. No `!important`.
  - Participant colors and avatars are the only color exception; agent characters are a placeholder slot.
- **Editor:** canvas writing and documents use Tiptap. Canvas text is a compact Tiptap instance bound to a doc resource, so click-to-write keeps working.
- **Keep and port:**
  - the d3-force graph behavior: anchored center, folder focus, single inspector
  - click-to-write
  - the 24px grid drag with cancel
  - non-scrolling utility summaries
  - honest disconnected states
- **Drop:** the seed data, the `/materials` route, browser-only persistence and the `BrowserProof` placeholder (Office and browser modules are deferred).
- **Tests:** Vitest for the layout engine, access logic (`convex-test`) and reducers. Playwright e2e against `vite preview` plus a local Convex backend, split by feature, started by the test runner itself rather than a hand-run server.
- **Bundle:** split the code by route and lazy-load the graph and editor (the single chunk is currently 502 kB).

**Size:** M. It runs in parallel with Phase 1. **Done when:** `main.tsx` is gone; every existing interaction listed above works on Convex data; e2e runs in CI; no CSS file overrides another.

## 5. Phases in order

| # | Phase | Scope | Size | Done when |
| --- | --- | --- | --- | --- |
| 0 | **Cleanup** | §3 | S | See §3 |
| 1 | **Foundation: identity, spaces, access** | Convex project, Clerk, schema v1 (users, spaces, memberships, invites), `access.ts` with tests, a personal space created automatically on sign-up, project creation (folder, orientation doc, resources folder and default agent *record*), invite by email, deploys (Vercel plus Convex prod and previews) | M | Dylan and a second person sign in on the deployed URL, join one shared project, and each has a personal space the other provably cannot read (access tests plus a manual check) |
| 2 | **Frontend restructure** | §4 | M | See §4 |
| 3 | **Shared content and live collaboration** | Resources, folders and revisions; Tiptap docs with prosemirror-sync; images in Convex file storage; canvas placements and named arrangements per user; the graph built from the real folder tree; presence avatars on resources; full-text search through the access gate; share-in-place and variants with ancestry | L | Two users co-edit one doc live and see each other's presence on the graph and canvas. A private doc never appears in the other user's graph, search or presence. Sharing it keeps the same ID and history |
| 4 | **Conversations** | Channels, DMs, threads, resource-discussion anchors, unread state, a composer with an audience chip, per-destination drafts and attachments that must be shared before use | M | Situations 3 (message a person) and 4 (discuss selected work) work between two users live, with anchors surviving edits. Opening a resource never changes the recipient (e2e-tested) |
| 5 | **Agent runtime** | Agent identities with a character placeholder; a default project agent; the personal agent; the job state machine; tools (read, search, propose revision, post message, update goal) all going through the access gate; approvals for consequential shared changes; proactive replies screened by a cheap triage model and throttled per thread; agent avatars on the graph at active resources; cancel and retry; per-space LLM budgets and a usage table | L | Situations 1, 2 and 5 work end-to-end with a real model. A job's progress shows on the graph and in its thread. A proposed shared change waits for approval. Hitting a budget pauses jobs visibly. No simulated states anywhere |
| 6 | **Automatic context maintenance** | The project agent keeps the orientation doc current (purpose, decisions vs. tentative discussion, goals, key references) on meaningful events; embeddings and vector search for retrieval; provenance on every agent revision; staleness indicators | M–L | After a session of real discussion and edits, a **fresh** agent with no chat history orients from maintained context and answers project questions correctly, citing sources. Private sources are never cited to people without access |
| 7 | **Polish and hardening** | Agent character art direction, accessibility (a click-or-tap alternative to drag, contrast), performance, export/backup, error states, the deferred Office and browser modules if still wanted | M | Dylan plus 2 testers use it for real work with no blocker bugs in a review pass; Dylan accepts the visual direction |

Order rationale: 0 → (1 ∥ 2) → 3 → 4 → 5 → 6 → 7. Phases 3–4 can partially overlap once the schema is stable. Phase 5 depends on 3 and 4, because agents write resources and messages. Phase 6 depends on 5.

## 6. First milestone: M1, "Two people, one live project"

This covers Phase 0 plus the vertical slice of Phases 1 and 2 needed for real multiplayer chat. Each line is one PR.

1. **Record decisions:** commit the pending 15 doc lines and add `docs/DECISIONS.md` with the Nov 5 decisions.
2. **Archive the prototype:** tag `archive/prototype-2026-10-28` and remove `prototype/`.
3. **Consolidate the docs:** `SPEC.md`, `STATE.md`, a short `AGENTS.md` and `README.md`; move the rest to `docs/archive/`.
4. **Tooling and CI:** ESLint, Vitest, `.nvmrc`, and a GitHub Actions workflow (typecheck, lint, unit). Add first unit tests for `canvas-layout.ts`.
5. **Blank canvas:** remove the seed docs and messages, `snapshot-sources.mjs`, the predev/prebuild hooks and the `/materials` route; update the e2e tests that relied on the seed data.
6. **Workspace restructure:** set up `apps/web` and `convex/` as npm workspaces, with no behavior change.
7. **Convex and Clerk bootstrap:** a sign-in gate, a `users` table synced from Clerk, and env/secrets docs.
8. **Schema v1 and access gate:** spaces, memberships and invites, plus `access.ts` with `convex-test` unit tests covering private vs. shared.
9. **Spaces UX:** a personal space created on first sign-in; create project (folder, orientation doc stub, resources folder, default agent record); invite by email; rail navigation backed by real spaces.
10. **Extract `main.tsx`, step 1:** a zustand UI store plus a `data/` adapter interface; conversations read from Convex instead of localStorage.
11. **Live conversations:** channels and DMs with real authors (Clerk avatars and colors); messages appear live for both users; per-destination drafts kept.
12. **Presence:** who is in this project, shown in the rail and the conversation.
13. **Deploys:** Vercel prod plus per-PR previews paired with Convex preview deployments; e2e against the preview in CI.

**M1 done when:**
- On the deployed URL, Dylan and a second tester both sign in and land on a blank canvas in their own personal space.
- Dylan creates a project and invites the tester.
- Both see the project folder on the graph.
- They exchange channel messages and a DM that appear live, with real names and avatars.
- Each sees the other's presence.
- Neither can see the other's personal space.
- CI is green.

## 7. Decisions Dylan still needs to make

1. **Approve the stack** (Convex, Clerk, Tiptap, Vercel, Anthropic plus OpenAI embeddings) and a **monthly LLM hard cap**. Recommendation: $200.
2. **Testers 2 and 3:** who they are (email addresses for invites), and which sign-in methods to offer (Google, GitHub, email link).
3. **Confirm the assumed defaults:** docs consolidation, Tiptap, and deferring Office and browser modules to Phase 7.
4. **Old local preview data:** discard it, with no import into the new backend. Recommendation: discard.
5. **Composer audience model:** approve the "explicit audience chip plus five-situation mapping" in §2 as the starting point. It gets a concrete review at the start of Phase 4.
6. **Agent character style:** can wait until Phase 5. A neutral placeholder slot is used until then.

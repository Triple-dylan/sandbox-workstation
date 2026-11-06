# Dynamic orb reference search (read-only)

Search date: 2026-11-05. Research note; no product code changed in that pass. Integration status: [thinking-orbs-integration.md](./thinking-orbs-integration.md).

## Verdict

Dylan already wired a dynamic orb into **DropDeployment**. The upstream package is **`thinking-orbs`** (Jakub Antalik): canvas particle/dot orbs with nine animated agent states. That is the saved reference — not a separate orphan clone under Desktop/Downloads.

## Ranked candidates

### 1. PRIMARY — `thinking-orbs` via DropDeployment

| | |
|---|---|
| **Where Dylan saved it** | `/Users/dylandahl/DropDeployment` (git: `https://github.com/Triple-dylan/DropDeployment.git`) |
| **Upstream package** | npm `thinking-orbs@0.2.0` → installed at `/Users/dylandahl/DropDeployment/node_modules/thinking-orbs` |
| **Upstream repo / demo** | https://github.com/Jakubantalik/thinking-orbs · https://orbs.jakubantalik.com |
| **Local clone of upstream?** | **No** standalone clone found. Only the npm install inside DropDeployment. |
| **Harness glue** | `/Users/dylandahl/DropDeployment/apps/harness/src/thinking-orb.ts` |
| **State mapping** | `/Users/dylandahl/DropDeployment/apps/harness/src/agent-visual-state.ts` |
| **Usage** | `/Users/dylandahl/DropDeployment/apps/harness/src/main.ts` (hydrate `[data-thinking-orb]` hosts in chat/panes/agent detail) |

**What the package does:** MIT React+canvas library of dotted “thought orbs” for AI/agent UIs. Nine hand-tuned verbs, two size presets (64 chat / 20 inline), monochrome auto dark/light, reduced-motion static frame, pause when offscreen/hidden.

**How orbs work (tech):**

- Plain **2D canvas** (`arc` / `stroke` dots and lines only — no WebGL, no `ctx.filter`).
- Exports `ThinkingOrb` (React) plus headless `MODE_DRAWS` + `resolvePreset` (what DropDeployment uses without React).
- State → mode: `working→orbits`, `searching→globe`, `solving→rubik`, `listening→wave`, `connecting→web`, `weaving→braid`, `composing→ribbon`, `breathing→ring`, `shaping→morph`.
- Each frame: `resolvePreset(state, size)` → draw fn with time `t`, dark flag, and size-tuned opts (particle counts, radii, speeds).
- DropDeployment’s `mountThinkingOrb` runs `requestAnimationFrame`, maps composer intent → orb verb (`orbStateForIntent`), and maps job status → `working` / `shaping` / `breathing` via `agentVisualState`.

**What to copy into Sandbox Workstation Orb:**

1. Prefer **`npm install thinking-orbs`** (or vendoring the same canvas draw API) over inventing new CSS keyframes.
2. Reuse DropDeployment’s **vanilla host pattern** (`MODE_DRAWS` + `resolvePreset` + rAF) so Orb works at chat / canvas / graph / panel without requiring a React tree at every mount site — Sandbox already has React, so `<ThinkingOrb />` is also fine for React surfaces.
3. Map Sandbox job states to verbs: at minimum `idle→breathing`, `working→working` (orbits), `waiting→shaping` or `listening`, `failed→` a held/static frame or `shaping`. Optionally enrich later with search/compose/connect verbs like DropDeployment.
4. Keep Sandbox’s **faint per-agent tint** as a host concern (package is strictly monochrome); wrap or tint the canvas host, don’t fork the particle math first.
5. Copy a11y/perf: `prefers-reduced-motion`, pause on hide, `role="img"` + state aria-label, size presets rather than naive CSS scale.

**Design note:** Nov 5 Sandbox decision describes Orb as “abstract core in a thin ring” (SVG + CSS arc/ripple in `workstation/src/features/agents/Character.tsx`). `thinking-orbs` is a **dotted particle sphere**, not that SVG ring. Dylan’s “fully dynamic” ask points at the DropDeployment/thinking-orbs behavior; if both must hold, use thinking-orbs for motion/presence and keep ring geometry only if it still reads after a side-by-side check against the live demo.

### 2. DropDeployment graph “agent orbit” (related, not the character)

- `/Users/dylandahl/DropDeployment/docs/logs/2026-08-16-agent-orbit-ontology.md`
- Agents as peripheral hexagonal markers in an orbital shell around knowledge — presence/layout semantics, not the animated orb character.
- Useful for graph placement rules later; **do not** treat as the Orb art reference.

### 3. Pixel-Agents (Desktop clone)

- `/Users/dylandahl/Desktop/Pixel-Agents/pixel-agents` → `https://github.com/pablodelucca/pixel-agents`
- Animated **pixel-art office characters** driven by Claude Code activity — strong “agent as character with live state,” wrong visual language for Orb.

### 4. CampaignOS “orbit” screenshots

- `/Users/dylandahl/Desktop/CampaignOS/.audit-screenshots/orbit-*.png`
- Workspace/graph orbit UI shots — not an agent orb character library.

### 5. Current Sandbox Orb (already in-repo, insufficient alone)

- `/Users/dylandahl/sandbox-workstation/workstation/src/features/agents/Character.tsx` + CSS in `app.css`
- SVG core + ring; CSS `@keyframes` for pulse/spin/ripple. Matches the Nov 5 silhouette decision but is **not** the canvas particle presence Dylan remembered saving.

## Places searched (negative / empty)

- `~/Desktop`, `~/Documents`, `~/Downloads`, `~/DropDeployment`, `~/sandbox-workstation` docs/archive/research — no other orb character repo.
- Common clone roots: only `~/src` exists (Vite starter, unrelated).
- Browser bookmarks (Chrome Default, Brave Default): **no** hits for orb / jakub / thinking-orbs / particle.
- Spotlight/`mdfind` for thinking-orbs / orbs.jakubantalik.com: no extra hits beyond noise system fonts.
- Planning docs at search time recorded the Orb character decision but not a path to thinking-orbs.
- No standalone `Jakubantalik/thinking-orbs` git remote under the scanned home git repos.

## Follow-up (done on `cursor/thinking-orbs-character-92f2`)

`thinking-orbs` is wired into Sandbox `Character` / actor surfaces. See [thinking-orbs-integration.md](./thinking-orbs-integration.md) and [../STATE.md](../STATE.md).

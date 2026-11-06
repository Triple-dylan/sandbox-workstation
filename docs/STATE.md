# Current state

_Updated 2026-11-05._

- `workstation/` is the browser-only interaction proof from October: canvas click-to-write, pins, images, plan, d3-force graph, local conversations, a local agent-definition editor. All its data lives in localStorage and IndexedDB. Nothing in it is multiplayer, and no agent runs.
- The demo track (local server, real multi-person sync, five message situations, agent characters) is being built on top of it; see the branches and PRs.
- `prototype/` was removed (tag `archive/prototype-2026-10-28`).

Checks: `npm run typecheck`, `npm run format:check` and `npm run build` from `workstation/` (CI runs these). The October browser suite (`npm test`) needs `npm run dev` running on port 4174.

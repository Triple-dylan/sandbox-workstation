# GitHub sync audit (SB-14)

Point-in-time check on 2026-11-06. `git fetch origin` on `~/sandbox-workstation`. Remote: `https://github.com/Triple-dylan/sandbox-workstation.git`. Working tree was clean; no unpushed commits; no force-push; no history rewrite.

## Branch → remote SHA → pushed

| Branch | Remote tip SHA | Pushed | URL |
|---|---|---|---|
| `main` | `ae454db3c9229348ae07602adb146c3bcb49169b` | yes | https://github.com/Triple-dylan/sandbox-workstation/tree/main |
| `cursor/cleanup-588c` | `3d5d0a1a922de4a7fe9b7a2ce683bc653e0de8e3` | yes | https://github.com/Triple-dylan/sandbox-workstation/tree/cursor/cleanup-588c |
| `cursor/demo-foundation-588c` | `b4dbccebd80c76c8d6644f42d2f8a5fd9cd09473` | yes | https://github.com/Triple-dylan/sandbox-workstation/tree/cursor/demo-foundation-588c |
| `cursor/agent-character-orb-3f54` | `3aebd92b42cbe1e8866df7f4435bd47b54fddf00` | yes | https://github.com/Triple-dylan/sandbox-workstation/tree/cursor/agent-character-orb-3f54 |
| `cursor/agent-character-options` | `a6398d5a8a6c191595bfb91c613e3bb06e94bb68` | yes | https://github.com/Triple-dylan/sandbox-workstation/tree/cursor/agent-character-options |
| `cursor/thinking-orbs-character-92f2` | `2c8b411f9f29f817c22d656b4401d71524513a18` | yes | https://github.com/Triple-dylan/sandbox-workstation/tree/cursor/thinking-orbs-character-92f2 |

Local matched remote for every listed branch (ahead 0 / behind 0). No other `cursor/*` branches locally or on origin at audit time.

Stack: `main` ← cleanup ← demo-foundation ← agent-character-orb ← thinking-orbs; `agent-character-options` also branches from demo-foundation.

## PRs

| PR | Head | headRefOid | Matches origin tip? |
|---|---|---|---|
| [#1](https://github.com/Triple-dylan/sandbox-workstation/pull/1) cleanup → main | `cursor/cleanup-588c` | `3d5d0a1…` | yes |
| [#2](https://github.com/Triple-dylan/sandbox-workstation/pull/2) demo → cleanup | `cursor/demo-foundation-588c` | `b4dbcce…` | yes |

At audit time there were no open PRs for `thinking-orbs-character-92f2`, `agent-character-orb-3f54`, or `agent-character-options` (branches were on GitHub; compare available).

## Harness checkout

**Best tip for shared work:** `cursor/thinking-orbs-character-92f2` — demo + Orb + thinking-orbs stack.

Fallback for PR #2 demo without particle Orb: `cursor/demo-foundation-588c`.

Planning notes that used to live only in Cursor Context are now under [../project/](../project/).

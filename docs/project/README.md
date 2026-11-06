# Project planning notes

Shared planning for every harness (Cursor, Codex, etc.). Confirmed product rules stay in [../SPEC.md](../SPEC.md), [../DECISIONS.md](../DECISIONS.md), and [../STATE.md](../STATE.md); this folder holds review, plan, context, and character/ops notes that used to live only in Cursor Context.

## Work tip

- **Branch:** `cursor/thinking-orbs-character-92f2` (demo + Orb + `thinking-orbs`)
- **Open PRs:** [#1](https://github.com/Triple-dylan/sandbox-workstation/pull/1) cleanup → `main`; [#2](https://github.com/Triple-dylan/sandbox-workstation/pull/2) demo → cleanup
- **Run locally:**

```sh
cd workstation
npm ci
npm start      # http://127.0.0.1:4174
```

## Files

| File | What it is |
| --- | --- |
| [project-context.md](./project-context.md) | Dylan's durable decisions and direction updates (Nov 5) |
| [project-review.md](./project-review.md) | Deep codebase/docs review snapshot (Nov 5, pre-demo) |
| [overhaul-plan.md](./overhaul-plan.md) | Demo-first plan plus longer production stack/phases |
| [orb-reference.md](./orb-reference.md) | Where the dynamic orb reference (`thinking-orbs` / DropDeployment) was found |
| [thinking-orbs-integration.md](./thinking-orbs-integration.md) | How `thinking-orbs` is wired into Sandbox agents |

Ops snapshot: [../ops/github-sync-audit.md](../ops/github-sync-audit.md) (branch/PR push check).

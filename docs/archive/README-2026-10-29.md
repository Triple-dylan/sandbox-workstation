# Sandbox Workstation

A general-purpose workstation for people and agents, with private and collaborative work, a bounded canvas and a graph of permitted context. Agents maintaining context automatically is the core product goal; the current browser-local implementation does not execute that service.

**Latest follow-up:** [Conversation and Canvas Interaction Plan.md](Conversation%20and%20Canvas%20Interaction%20Plan.md) records the latest text/corner-click and graph continuity repairs plus the proposed unified communication model. The user confirmed proactive shared-agent replies; no live replies or delivery are implemented.

**Previous implementation:** [Direct Canvas Results.md](Direct%20Canvas%20Results.md) records the latest authorized revision on port 4174. Click empty Canvas to write directly at that location. Conversation stays beside work with its composer, live dragging uses the visible grid, and fixed right utilities show non-scrolling summaries with links to complete views. Existing pins, images, goals, local sources and agent definitions remain. This is an implementation for review, not final user acceptance or the complete MVP.

**Service boundary:** real accounts/contact lookup/delivery, multiplayer, server authorization, Office/browser engines, authoritative sharing/retrieval, deployed agents, automatic context maintenance and working-agent Graph telemetry remain unbuilt. Local definitions/versions are not deployments. No production provider or stack was selected.

## Handoff

1. Read [AGENTS.md](AGENTS.md) and [Conversation Context.md](Conversation%20Context.md) in full. Later confirmed requirements supersede earlier proposals and rejected implementations.
2. Read [Direct Canvas Results.md](Direct%20Canvas%20Results.md) and [workstation/README.md](workstation/README.md) for current behavior, checks and limits.
3. [Workstation Review 2026-10-29.md](Workstation%20Review%202026-10-29.md) preserves revision-specific findings and remaining priorities. Its section 9 prompted this latest implementation. [Beside Work Results.md](Beside%20Work%20Results.md) records the preceding trial, not acceptance of its old writing launcher or rail treatment.
4. [Object and Access Model.md](Object%20and%20Access%20Model.md) remains a proposed record/access contract, not implemented server permissions.
5. Earlier [Rebuild Plan.md](Rebuild%20Plan.md), [Research Review.md](Research%20Review.md), [Maturity Refinement Plan.md](Maturity%20Refinement%20Plan.md), [Maturity Refinement Results.md](Maturity%20Refinement%20Results.md), [Canvas Use Plan.md](Canvas%20Use%20Plan.md) and [Canvas Use Results.md](Canvas%20Use%20Results.md) explain the successive design/research history. The `prototype/` implementation and its camera/zoom model are superseded. Do not restore rejected defaults from historical documents.

Private handoff repository: [Triple-dylan/sandbox-workstation](https://github.com/Triple-dylan/sandbox-workstation).

## Run and verify

Requires Node 22.12+ and npm. From `workstation/`:

```sh
npm ci
npm run dev
```

Open [the local preview](http://127.0.0.1:4174/). Reuse the existing server. No hosted Sites publication or live shared service is configured.

```sh
npm run build
npm run format:check
npm test
```

Browser checks use isolated contexts and retain the user's actual preview records. Port 4173 is the older proof. `workstation/evidence/` contains deliberately composed review states, not a preloaded dashboard or claims of live collaboration.

# Sandbox Workstation

A general-purpose workstation for people and agents, with private and collaborative work, bounded snapping modules and a graph of permitted context.

**Latest user review:** the beside-work trial remains unaccepted. [Review section 9](Workstation%20Review%202026-10-29.md#9-review-after-the-beside-work-implementation) records real drag feedback/grid mismatch, conflicting navigation/chat presentation, similar work/utility styling and nested right-utility scrolling. The user now prohibits scrolling fixed right utilities. This follow-up reviewed the implementation without modifying app source; its proposed corrections are not yet built.

**Current implementation — Conversation beside work:** the user selected this layout, and port 4174 now implements the trial. Chat has a resizable history/composer column; Canvas supports direct private writing, source-linked evidence and shared goals. Search/account/attachments receive space, and crowded native content can reflow without hiding another view. Read [Beside Work Results.md](Beside%20Work%20Results.md) for the review flow, evidence and service boundaries. This is actual local implementation for review, not final acceptance or the complete MVP. The audit-only status below describes preceding cycles.

**Latest review — October 29:** [Workstation Review 2026-10-29.md](Workstation%20Review%202026-10-29.md) records the new source/browser audit, primary research and second reflection. It reproduces an image replacement/save inconsistency, active-work hiding when utilities open, and incomplete reference search. It ranks repairs and the remaining canonical context-service proof with concrete acceptance journeys. This cycle changes documentation/evidence only; the preview is unchanged and the findings are not fixed. Read this report before relying on older recovery claims or passing test counts.

The user's follow-up broadens this review: **section 8** covers visible working agents on Graph, real profile photos/colored names, chat rework, native canvas use and every module's behavior. New evidence reproduces popup/work overlap and utility replacement during reading. It records specific Notion patterns and revised integrated acceptance journeys. These changes remain an audit/specification, not implemented fixes or accepted visuals.

**Current work:** the user authorized the researched refinement plan. `workstation/` now has monochrome glass controls, a coherent composer, anchored work search, editable private local documents, improved conversation/thread continuity and an agent definition/version editor. Read [Maturity Refinement Results.md](Maturity%20Refinement%20Results.md) for evidence and limits, and [Maturity Refinement Plan.md](Maturity%20Refinement%20Plan.md) for the researched proposal. This implementation is for review, not an accepted or completed MVP.

Real accounts, contacts/delivery, collaboration, server authorization, Office/browser engines, retrieval, deployed/running agents and automatic context maintenance remain unimplemented. Local agent definitions and versions are not live deployments. The existing full-surface Graph/Canvas, bounded snapping, reusable document inspection and content-sized utilities are retained.

**Latest canvas iteration:** source-linked message pins, captioned private images and an editable sequential plan now work directly on the canvas. Pins can become sourced steps using the existing project goals. Read [Canvas Use Results.md](Canvas%20Use%20Results.md) for the flow, evidence and limits.

## Handoff

1. Read [AGENTS.md](AGENTS.md) and [Conversation Context.md](Conversation%20Context.md) in full. Apply later confirmed answers.
2. Read [Workstation Review 2026-10-29.md](Workstation%20Review%202026-10-29.md) for current reproduced gaps and proposed priorities. Follow the approved [Rebuild Plan.md](Rebuild%20Plan.md) and its design-review gate. [Research Review.md](Research%20Review.md) records the historical evidence and proposals.
3. Read [Maturity Refinement Results.md](Maturity%20Refinement%20Results.md) for the current implementation and [Maturity Refinement Plan.md](Maturity%20Refinement%20Plan.md) for its researched direction. [Primary Surface Fix Plan.md](Primary%20Surface%20Fix%20Plan.md) and [Primary Surface Fix Results.md](Primary%20Surface%20Fix%20Results.md) describe the current code. [Stage A Review.md](Stage%20A%20Review.md) describes its rejected predecessor.
4. [Object and Access Model.md](Object%20and%20Access%20Model.md) remains a proposed record/access contract, not implemented server authorization.
5. The older `Interaction Contract.md`, `Design Research and Revision Plan.md` and `prototype/` contain superseded/rejected implementation evidence. Do not use their camera/zoom behavior or old test count as the current acceptance contract.

Private handoff repository: [Triple-dylan/sandbox-workstation](https://github.com/Triple-dylan/sandbox-workstation).

## Run the new proof

Requires Node 22.12+ and npm. From `workstation/`:

```sh
npm ci
npm run dev
```

Open [the layout proof](http://127.0.0.1:4174/) or the separate [component/material proof](http://127.0.0.1:4174/materials). The component page is a review specimen, not the product landing page. A fresh workstation starts blank.

`predev` and `prebuild` snapshot the four actual project Markdown sources into the local proof. Their generated copies are ignored by Git and retain stable source IDs in the UI. The loopback preview has no authentication; it must not be deployed as an authorized shared service.

See [workstation/README.md](workstation/README.md) for the review flow, controls and exact limits.

## Verification

With the new server running and Google Chrome installed:

```sh
cd workstation
npm run build
npm run format:check
npm test
```

Browser checks use separate temporary contexts. They do not overwrite the user's preview records. A passing suite establishes the exercised layout/interaction behavior, not visual acceptance, production access control or completed integration.

## Source map

| Path | Responsibility |
| --- | --- |
| `workstation/src/main.tsx` | Primary navigation, record updates, inspection, utilities and work-command routing |
| `workstation/src/Composer.tsx`, `Conversation.tsx` | Message composition, attachment handling, transcript/thread/search and reading continuity |
| `workstation/src/WorkActions.tsx` | Anchored resource/command search and keyboard cancellation |
| `workstation/src/AgentEditor.tsx`, `agents.ts` | Local agent definitions, immutable versions, restore/export and runtime readiness |
| `workstation/src/Graph.tsx` | Actual source/folder graph, subject focus, bounded drag and spring return |
| `workstation/src/canvas-layout.ts` | Bounded object sizing, collision checks and snap placement |
| `workstation/src/state.ts` | Versioned local records and legacy-layout migration |
| `workstation/src/components.tsx` | Source reader, conversation content, preferences and material specimen |
| `workstation/src/model.ts` | Proof resource identities, recorded discussion excerpts and local record shapes |
| `workstation/src/style.css`, `workspace.css` | Retained materials/content styles and corrected primary-surface layout |
| `workstation/scripts/snapshot-sources.mjs` | Reproducible source snapshots with content hashes |
| `workstation/tests/workspace.test.mjs` | Browser interaction and allocation checks |
| `research/references/` | User's supplied module-style and broken-flow evidence |
| `prototype/` | Preserved rejected buildless implementation and historical tests |

The old prototype can still run with `python3 prototype/server.py --port 4173`. It is historical output, not the review build.

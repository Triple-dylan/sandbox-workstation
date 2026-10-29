# Sandbox Workstation

A general-purpose workstation for people and agents, with private and collaborative work, bounded snapping modules and a graph of permitted context.

**Current work:** the user rejected the tiled stage A structure, then explicitly authorized reviewing, planning and implementing its correction. `workstation/` now has full-surface Graph/Canvas navigation, a left conversation/resource extension, reusable inspection, content-sized utilities and deliberate bounded canvas tools. Read [Primary Surface Fix Results.md](Primary%20Surface%20Fix%20Results.md). This is an implementation for review, not a completed or accepted MVP. Real accounts, delivery, collaboration, server permissions, Office editing, browser sessions, retrieval and running agents remain unimplemented.

## Handoff

1. Read [AGENTS.md](AGENTS.md) and [Conversation Context.md](Conversation%20Context.md) in full. Apply later confirmed answers.
2. Follow the approved [Rebuild Plan.md](Rebuild%20Plan.md) and its design-review gate. [Research Review.md](Research%20Review.md) records the evidence and proposals.
3. Read [Primary Surface Fix Plan.md](Primary%20Surface%20Fix%20Plan.md) and [Primary Surface Fix Results.md](Primary%20Surface%20Fix%20Results.md) for the current correction. [Stage A Review.md](Stage%20A%20Review.md) describes the rejected predecessor.
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
| `workstation/src/main.tsx` | Primary navigation, conversation/resource extensions, inspection, compact utilities and explicit canvas tools |
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

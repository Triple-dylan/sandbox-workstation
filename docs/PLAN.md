# Plan

_Written 2026-11-11 after a full review of the record, both codebases and a short interview. Confirmed requirements stay in `SPEC.md`; decisions in `DECISIONS.md`._

## Diagnosis

Earlier rounds fixed each complaint literally and documented it at length. The product became a list of prohibitions without a centre:

- The canvas had no job. It was an empty page beside panels.
- Agents were a settings form or a status card, not visible participants.
- Private and shared were navigation destinations, not something you could see on the work itself.
- "Never fake it" became "show nothing", so the experience could not be judged.
- The graph was a file tree with springs. It showed no activity, access or relationships.
- The server-backed demo made the product real but put four boxed panels on screen again.

## What we are building

One working surface where the work lives, with people and agents visibly present on it, and one map (the graph) of everything the space knows and who is touching it. Chat, agents and context float over the work rather than boxing it in.

## Decisions from the 2026-11-11 interview

- **Foundation:** keep the demo server (SQLite, live sync, access check, agent jobs). Rebuild the client on it. Goal: a real version that runs locally, then deploys.
- **Order:** look and feel, then a canvas worth using, then agents.
- **Visual:** evolve monochrome glass, light and dark. Colour only for people, agents and content.
- **Canvas:** leaning "living board". Options were shown as screens; final choice pending. Working assumption: living board, where opening an object grows it into a full working view and the rest folds into a shelf.

## Build order

Each step ends in something you can open and use locally, not a document.

1. **Shell and look.** Full-bleed surface. Floating glass rail, floating composer with explicit audience, presence cluster. No boxed panel columns. Menus open in reserved space, never over work. Shared design tokens for both themes.
2. **Graph.** Real physics with an anchored subject, unframed typed nodes, folder nesting, people and agent avatars at the resource they are touching, read a document without leaving the graph.
3. **Canvas.** Object types on the board: text, image, document, sheet, plan, pinned message, agent result. Click to write, drag on the grid without overlap, open into a working view and back. Private items carry a visible "only you" treatment on the shared board; sharing changes the same item.
4. **Agents.** One character per agent everywhere. Present on the board and graph where they work. Replies land above the composer and in the conversation. Proposals are accepted or declined on the object. Project agent keeps the orientation document current. Add a Claude runtime beside the scripted and OpenAI ones.
5. **Together.** Two or three people in one project: live selection outlines, presence, shared and personal agents side by side, shared context visible in the graph, per-person board arrangement.
6. **Deploy.** Real sign-in and hosting once the local version is right.

## Working rules

- Show screens, not essays. Ask only when the answer changes what gets built.
- Example content is allowed in mockups and tests, never seeded into a real space.
- Keep this file, `SPEC.md`, `DECISIONS.md` and `STATE.md` short and current. No new long review documents.

# Project handoff and working instructions

## Read first

Read `Conversation Context.md` in full before proposing designs or changing this project. It contains the original context, subsequent confirmed interview direction, and a proposed MVP implementation plan. Later confirmed clarifications supersede earlier exploratory statements. The MVP plan is a proposal, not an approved stack or implemented system.

This file was explicitly requested by the user to prevent context decay. Its creation supersedes the earlier request to keep this fresh folder to one Markdown file. Do not discard the conversation document or replace the project with assumptions from another repository.

## Product purpose

Build a general-purpose, canvas-focused workstation where humans and agents work together across private and collaborative spaces. It supports work, design, development, finance, marketing, hobbies, and informal collaboration. Do not narrow it around a single example use case.

A central problem is the burden of gathering, organizing, updating, and repeatedly handing context to AI. Agents maintain useful context automatically as work happens; people govern access and sharing without maintaining that machinery manually.

## Settled experience requirements

Latest visual correction after reviewing the first prototype: the user rejected its appearance and clarified that open canvas means a blank page. The only persistent visible shell is the left rail and floating chat. No title of any size, logo, hero, marketing copy, top header/menu, inset canvas frame, or preloaded dashboard/card grid. Use monochrome with strong contrast and a modern, restrained treatment. Content and tools appear through intentional interaction. This correction supersedes any earlier populated-default canvas recommendation; shared modules still exist as project records and can be opened in context. Do not claim the original prototype design was accepted.

The subsequent interaction review also rejected the second pass. Read `Interaction Contract.md` before changes. Creation belongs in the composer's integrated controls, not a rail Add to canvas menu. Use Slack/Discord-style channels with nested threads. The later scale review supersedes rail membership/count summaries: people and agents belong in searchable on-canvas directories. Resource review must stay within Graph when initiated there. History/sharing/details change the existing resource surface and must not spawn windows. Physics is always on with no toggle. Provide a subtle spatial grid, snapping, unrestricted world coordinates, reliable zoom/pan, resizing, and recovery of distant components. No generic View menu, numbered navigation badges, or project-name pill in the composer. These are confirmed corrections, not optional polish.

The latest review rejects ornamental or inconsistent icons, summary labels such as “4 members · 1 agent,” Project context in the rail, rounded-square module styling, generic document/sheet/deck viewers, and bordered graph tiles containing icons. Read `Design Research and Revision Plan.md` for primary production references, the second review and remaining work. Keep navigation in the rail; goals, knowledge, people and agents are local tabs of an intentionally opened on-canvas Project module. Use search/filter/pagination for large directories. Graph content uses distinct unframed miniatures/anchors. Content-specific viewers must operate on actual content; parsed Office previews must never be called full-fidelity native Office integration.

- Graph and canvas are separate tabs in one harness. Projects open directly into canvases, without project overview pages.
- Both surfaces retain a left rail and a floating chat bar at the bottom. The later floating-bar requirement supersedes the original rejection of a fixed composer. Preserve the open workspace feel; avoid large pop-up windows and drawers.
- The graph visualizes knowledge, folders, relationships, and permitted human/agent activity. It supports meaningful actions such as opening a resource or initiating contextual agent work.
- Graph physics and magnetism are required. Use nested folders to manage visual density and intentional visual differences between content types. Do not show everything as identical, simultaneously expanded nodes.
- Agents retrieve from the underlying context represented by the graph. Do not describe agents as being deployed into or living inside the graph.
- Graph activity can show a teammate working on a shared document in a project and the knowledge domains an agent is accessing. Document edits do not inherently reshape graph nodes or layout.
- Canvas surfaces include browser windows, documents, conversations, integration/connector modules, goals and milestones, and shared agent work.
- Personal canvases are freely adjustable with saved presets. Collaborative canvases have common required modules, while participants can adjust their own views. Shared content and personal layout are distinct.
- Goals and milestones are lightweight, sequential coordination: human ownership, agent assignment, and simple deadlines. Avoid turning this into a complex project-management suite.

## Context, privacy, and agent behavior

- Private agents, jobs, tasks, chats, projects, and activity coexist with collaborative equivalents. Respect privacy in resource access, retrieval, graph visibility, presence, and provenance.
- Creating a project creates a folder represented by a folder node. Private chats/projects appear in the private graph; collaborative projects/sessions appear in their shared graph.
- Agents automatically create project orientation Markdown and a resources/context child folder. Exact filenames and internal organization remain open. Maintain purpose, relevant context, goals, useful history, and resource references automatically.
- Every collaborative project receives at least one dedicated agent by default. It remains assigned through completion or retirement, including manual retirement. Persistent assignment does not imply continuously running inference.
- Project context is the starting point, not an absolute retrieval boundary. Wider access depends on configured permissions. This was explicitly answered; do not ask it again as unresolved.
- Accessible conversations, shared goals, and history give agents clues about tentative versus settled direction. Do not introduce mandatory human approval for every context update. Formal confirmation mechanisms may be explored later.
- Sharing makes the original item shared, retaining one canonical identity. Do not silently create private/shared duplicates or private-source synchronization. A later private variant is a distinct item with ancestry.
- Retain contributor attribution, origin, sharing history, revisions, and variant ancestry over time. Provenance must not reveal private source conversations.

## Current state and next work

The private handoff repository is `https://github.com/Triple-dylan/sandbox-workstation`. The root README maps the source, review documents, current limits and reproducible local checks. Preserve this repository’s own confirmed direction; its existence is not approval of the prototype design.

The MVP plan is recorded in `Conversation Context.md`. The user subsequently authorized proceeding with the interaction prototype and object/access model and explicitly asked work to continue after the voice call.

A buildless local interaction prototype now exists in `prototype/` with source, a run/review guide, and documented verification limits. `Object and Access Model.md` defines the proposed object/access contract. “Common” is only a provisional prototype label. No production stack or hosted service is selected. The prototype uses browser-local persistence and simulated collaborators/agent activity, not real multiplayer, server permissions, connectors, retrieval, or model execution. Do not claim phase 2–5 are implemented.

As of October 28, the interaction implementation has been rebuilt without the Common branding. `prototype/spatial.js` supplies shared world/screen geometry; `prototype/app.js` contains the local records, channel/thread flows, canvas, and graph-local inspection. Current checks include six spatial categories, ten formula cases, six Office parser tests and 66 browser assertions across spatial, workflow, scale/import and content-editing scenarios; see the current README for what was actually verified and what remains unimplemented. The new local storage key is `workstation-interaction-v3`; old sample storage was preserved. The latest revision also has local bounded Office imports through `prototype/server.py`, content-specific document/sheet/deck surfaces and paginated project directories. Full-fidelity document engines, real access enforcement, collaboration and model execution remain unimplemented. No user acceptance of this rebuild has been recorded yet. Do not use the earlier JPG screenshots as evidence of the current design.

The proposed sequence is:

1. Define the object/access model and create a populated interactive prototype of the harness, graph, and canvas.
2. Build persistent identity, membership, folders, resources, conversations, revisions, and canonical sharing.
3. Connect graph and canvas to real data, live collaboration, browser/connector modules, and personal layouts.
4. Add dedicated project agents, permission-filtered retrieval, automatic context maintenance, and visible job/activity state.
5. Validate complete workflows with real persistence, multiple users, privacy checks, and agent execution.

The populated interaction prototype and object/access model are the phase 1 review artifacts. Continue from them rather than restarting discovery. Investigate browser embedding/authentication constraints before selecting the production shell; they may affect its architecture. Runtime/provider, connector, deployment, stack, schedule, and costs remain unresolved technical decisions. Do not present recommendations as user-approved choices.

## Collaboration discipline

- Apply the recorded answers. Do not restart a generic discovery interview or ask the user to justify the project through one first use case.
- Ask only consequential questions genuinely unresolved by the documentation, using concrete language. Avoid ambiguous phrases such as moving something in the graph.
- Continue toward concrete, reviewable artifacts when authorized. Do not end planning with an offer to stop or ask whether the user wants an already-requested plan.
- Keep confirmed requirements distinct from proposals and implementation facts. Record new decisions and meaningful changes in the conversation document; update this handoff when durable instructions change.
- Do not claim progress from empty graphs, static screens, disconnected data, or placeholder agent behavior. Demonstrate the intended end-to-end experience and state limitations plainly.
- Preserve this project's fresh start. The earlier effort failed by missing the open canvas experience and disregarding interview answers; do not import its design or code without an explicit reason grounded in these requirements.

# Sandbox workstation — conversation and interview context

October 27, 2026. This document records the user's direction from today's written conversation and voice interview. It is not an implementation plan or a chosen design.

## What we are trying to create

A canvas-focused workspace or sandbox where multiple people and multiple agents can work live together. The user described it as a customizable workstation, with shared projects and routines, individual chats and jobs, and a graph central to shared knowledge and context.

The first real-use milestone should serve the user doing real internal work. Intended uses include creative and design work, coding and development, finance and RevOps, and hobbies.

Both browser surfaces and application/tool surfaces should be first-class objects. The experience must account for seeing agents, deploying them, assigning work, and using components and modules within the workspace. The user wants the whole experience considered end to end: what graph nodes represent, their appearances and variations, interactions, different views, and layouts. They want something fresh and innovative, with depth and coherent behavior.

## Canvas and visual direction

The user repeatedly emphasized an open canvas workspace/sandbox. They rejected a fixed composer at the bottom of the screen and rejected earlier static or sloppy graph presentations. Moving a chat box within the old application did not establish the experience they were describing.

The graph should feel physically interactive like Obsidian. A physicsless graph is not acceptable. Nodes, labels, and what is shown must be understandable and intentional.

Two references discussed earlier, Allume/Muse and FLORA, felt substantially closer to the open canvas/sandbox experience the user expected. These were starting references, not approval of a particular screen or implementation.

The user briefly compared customization depth to Notion, then explicitly said to hold that comparison for now. It should not be treated as a requirement for a Notion-like product or schema system.

When asked whether the graph should be the underlying workspace, a movable/resizable surface beside tools, or either depending on the workstation, the user tentatively preferred the third option and said the other options were not very clear. This remains exploratory rather than a settled architecture.

## Voice interview: shared project entry and organization

The user wants shared projects to open directly into the canvas. They explicitly rejected project overview pages: “No, no overview pages. Like that's the kind of stuff that we're trying to avoid.”

A shared collaborative canvas should have some fixed/common aspects that everybody has and shares. It can be somewhat less customizable than an individual canvas. Personal canvases should allow more flexibility.

Shared projects should have Slack- or Discord-like chats/channels, with different conversations and threads relevant to that project. The user wants organization without excessive clicks or many separate windows: things should be nested together into one simple, open experience.

## Voice interview: goals and milestones

Shared goals are a key part of the project canvas. The user described a Goals & Milestones module or tab with some nested features.

They want to:

- Work toward shared goals and milestones.
- Quickly assign an agent to a goal or milestone.
- Assign or tag a human collaborator so ownership is clear.
- Set a simple deadline.
- See goals and milestones presented sequentially.

This is lightweight project coordination, not a deeply complex project-management system. The user described it as “loosely functional” and enough to communicate what is being worked toward and who owns it.

## Voice interview: focused context and agent access

The broader workspace has a context graph of its associated resources. A particular project may need a more focused branch or selection of that graph.

The user clarified that selecting this focused context may not be a module of its own. It is more like choosing the resources or branch relevant to a project while retaining the relationship to the wider workspace graph.

When asked whether agents are restricted to that selection, the user answered through analogy: a project has a primary folder, plus other folders the agent can look into. The agent should know what to look at first but be able to dig elsewhere when needed and permitted.

That means:

- Selected project context is the starting point, not an absolute boundary.
- Wider access is governed by agent setup and permissions.
- The multiplayer space should have natural guardrails.
- Those settings should be easy to edit.

The user explicitly confirmed this interpretation. This question was answered in the voice conversation and should not be asked again as if unresolved.

## Knowledge activity and collaboration

The graph should help show how agents are accessing knowledge while they work.

The user also considered showing where other people are working, such as actively accessing certain documents, but said that particular presence detail might not be necessary for now. That was not a decision to remove people working together or multiplayer from the core concept.

## Working location

The user explored moving orchestration into a cloud conversation, then abandoned that approach because the repository was inaccessible there. They already have mobile remote access and chose to continue locally.

## Why this is a fresh folder

The prior work repeatedly missed the intended look, feel and structure, and the user felt their interview answers were not being applied. The latest preview showed “Brain graph is not connected” and was effectively empty, making the claimed progress impossible to evaluate.

The user requested a fresh Desktop folder and a fresh Codex project to leave the earlier work behind. They then specified that this folder should contain exactly one Markdown file recording the conversation and interview context, and nothing else.

## Subsequent interview: confirmed direction

The following clarifications supersede earlier exploratory statements where they conflict. The user has now requested an MVP implementation plan.

- This is a general-purpose workspace for work, creative activities, hobbies, and informal collaboration. A single department or sample project must not determine its product scope.
- Graph and canvas are separate tabs within the same harness. Both retain a left rail and a floating chat bar at the bottom. This floating bar is the clarified direction, superseding the earlier rejection of a fixed composer. Large pop-ups and drawers should not interrupt the open workspace.
- The graph visualizes the underlying folder structure, knowledge, shared context, and permitted activity. It supports actions, including opening resources and starting agent work with relevant context. Agents use the underlying context; they are not deployed into the graph.
- Physics and magnetism are essential. Folder nesting manages visual density. Different content types need intentional visual treatments; every resource need not appear as a simultaneously visible, identical node.
- The graph shows which shared document and project a teammate is working on and which knowledge domains agents are accessing. Editing a document does not inherently change its graph node or layout.
- Private agents, jobs, tasks, chats, and projects coexist with collaborative equivalents. Private activity is not broadcast to collaborators.
- A personal canvas is freely adjustable and supports saved presets. A collaborative canvas contains common required modules, such as goals and milestones and shared agent activity, while each participant can adjust their own view around those modules.
- Canvas surfaces include browser windows, integrations, and connector modules, alongside work artifacts and conversations.
- Creating a project creates an underlying folder represented by a folder node. New private chats and projects appear within the private graph; collaborative projects or sessions appear within the appropriate shared graph.
- Agents automatically create project orientation Markdown and maintain useful context as work happens. Exact filenames and document organization are undecided. Each project also has a resources/context subfolder for references, inspiration, and supporting material.
- Reducing the burden of collecting, organizing, updating, and handing context to agents is a central product purpose. Users govern sharing, rather than manually maintaining the context machinery.
- Sharing an item makes the original item shared, rather than creating a duplicate private/shared pair. A later private variant is a distinct item with ancestry. Sharing is not an automatically synchronized private-source copy.
- Origin, contributor attribution, sharing history, revisions, and variant ancestry should remain traceable over years. Provenance must not expose private source conversations.
- Agents use accessible conversations, goals, and history to distinguish tentative discussion from settled direction. A mandatory human confirmation process is not an initial requirement; more formal mechanisms can be explored later.
- Every collaborative project receives at least one dedicated agent by default, remaining assigned until project completion or agent retirement, including manual retirement. This is a persistent assignment, not a requirement to run inference continuously.

## Proposed MVP implementation plan

This section is a proposed build sequence grounded in the confirmed requirements. Technical choices below are recommendations to validate during implementation, not additional interview decisions. The MVP must demonstrate the complete experience with real persistence and collaboration; an empty graph or static visual mockup is insufficient.

### 1. Establish the product contract and interaction prototype

Define the initial object model and produce a populated, interactive prototype of the shared harness, graph, and canvas before expanding implementation.

- Model users, private/shared spaces, memberships, projects/folders, chats, resources, revisions, sharing events, agent assignments, jobs, goals, milestones, and activity events.
- Give each resource a stable identity independent of its graph position, folder placement, or canvas view. Treat variants as new identities with recorded ancestry.
- Define membership and access rules, including what sharing changes and which origin details remain private. A collaborator's ability to see a node must match their ability to access the represented resource.
- Prototype folder expansion, physics, distinct resource treatments, activity indicators, resource opening, canvas modules, the left rail, and floating chat interaction together.
- Show required shared modules alongside two different personal arrangements of the same collaborative canvas. Clarify shared module configuration versus personal placement during this prototype.

Acceptance: a reviewer can navigate a populated workspace and understand what is shared, what is private, how graph and canvas relate, and how to act on resources without large drawers or pop-ups. This is the first concrete design review checkpoint.

### 2. Build persistent workspace and sharing foundations

Implement identity, membership, folders, resources, conversations, revision history, and access enforcement as the authoritative foundation. Recommended architecture: transactional records plus durable resource storage and an event stream; retrieval indexes and graph views derive from authorized source records.

- Create private and collaborative spaces and open projects directly into their canvases.
- Create folders and graph representations from actual project/chat creation events.
- Store artifacts and revisions with attribution and timestamps.
- Implement an explicit share action on an existing item, retaining its identity while changing its sharing scope. Show the destination and resulting access clearly in the open workspace flow.
- Create a private variant only through an explicit separate action; preserve lineage without leaking inaccessible source content.
- Persist personal canvas arrangements and shared project modules separately.

Acceptance: two signed-in users can access the same shared project, while private resources, activity, search results, and source history remain isolated. Sharing preserves one canonical item and its audit history.

### 3. Deliver the first complete graph-to-canvas workflow

Connect the interactive surfaces to persisted data and live events.

- Build graph physics with nested folder expansion and collapse, readable labels, distinct content types, and actions to open resources or start contextual work.
- Support document editing, project conversations, goals/milestones, and shared agent status as initial canvas modules.
- Include a working browser surface and one real connector module. Validate browser embedding constraints early: arbitrary sites may reject embedding, so choose a supported browsing surface and make its actual capabilities explicit.
- Add personal presets and personal arrangements within collaborative projects.
- Broadcast permitted document presence and agent activity live, with reconnect behavior and activity expiration. Activity indicators should not arbitrarily rearrange the graph.
- Make document collaboration preserve simultaneous edits through an established collaborative editing approach rather than overwriting whole documents.

Acceptance: two people can work in one project, use their own arrangements, collaborate on a document, and see the corresponding shared activity from the graph. The browser and connector operate on real content.

### 4. Add the dedicated project agent and automatic context maintenance

Create each collaborative project with a dedicated agent assignment and automatically generated orientation Markdown plus a resources/context child folder.

- Trigger context maintenance from conversations, resource changes, goals, sharing events, and completed agent work. Queue and combine updates so normal editing does not cause uncontrolled duplicate jobs.
- Maintain project purpose, current goals, useful decisions, open questions, resource references, and change history. Preserve uncertainty rather than presenting every brainstorm as settled direction.
- Use permission-filtered retrieval over accessible resources. Start with project context, then permit wider retrieval only within the agent's configured access.
- Record source references and the resource revisions used for generated context. Keep generated summaries distinguishable from source material and recoverable through revision history.
- Allow users to assign an agent to a goal or milestone, inspect job status, stop a job, and retire an agent. Also support private agent work without broadcasting it.
- Show actual knowledge-access events in the graph at a readable level of detail, respecting both viewer permissions and the job's visibility.
- Handle failure, retries, stale indexes, and retirement explicitly. A failed maintenance job must remain visible and retryable without silently claiming context is current.

Acceptance: a fresh agent can orient itself to an existing project using automatically maintained context and cited resources. A shared reference is recorded in the context folder, becomes retrievable, and appears in relevant project context without manual packaging. Private material never enters shared retrieval or activity feeds.

### 5. Integrate and validate the MVP

Validate the whole product across more than one kind of work, such as a financial analysis and a creative collaboration, without tailoring the core model to either.

Required end-to-end demonstrations:

1. Create a collaborative project; its folder, graph node, context folder, orientation Markdown, and dedicated agent are created automatically.
2. Invite another participant; both collaborate on shared artifacts with independent canvas arrangements and common project modules.
3. Work privately, share an existing item into the project, inspect its origin and revision history, and explicitly create a private variant with ancestry.
4. Share a reference, discuss an idea, settle a direction, and change a goal; the agent updates useful project context while retaining source traceability and uncertainty where appropriate.
5. Start agent work from relevant context, follow its permitted activity in the graph, inspect the result, and assign work to a milestone with an owner and deadline.
6. Reconnect after interruption and recover document state, history, layout, and job status. Retry failed context maintenance and verify retired agents stop receiving new jobs.
7. Check privacy through direct resource access, graph visibility, retrieval, activity, provenance, and sharing—not only through hidden UI controls.

Acceptance: these workflows work against persisted data with real users and agent execution. Graph responsiveness and context freshness should be measured on representative nested workspaces; set numerical targets after the initial prototype establishes the practical workload.

### MVP boundaries and implementation decisions

The initial release includes the whole core loop: private and collaborative spaces, physics-based graph, open canvas, live collaboration, lightweight goals, browser and connector surfaces, dedicated project agents, automatic context maintenance, canonical sharing, and provenance.

Defer a broad connector catalog, module marketplace, extensive role customization, formal decision approval workflows, advanced branch/merge tooling, and enterprise administration. These are expansion areas, not reasons to omit the core collaboration or context behavior.

Resolve the application shell, agent runtime/provider, first connector, deployment environment, and supported browser implementation through short technical investigations before committing to the build stack. Evaluate the browser shell early because authenticated browsing and embedding restrictions may materially affect it. No stack, provider, schedule, or cost estimate has yet been approved.

The immediate next implementation artifact is the populated interaction prototype and accompanying object/access model from phase 1. Keep subsequent work tied to these acceptance criteria so visual fidelity, multiplayer behavior, and autonomous context maintenance are evaluated together.

## Implementation progress after the interview

The user authorized building the phase 1 interaction prototype and object/access model, and explicitly asked work to continue after ending the call.

Created `prototype/` as a buildless local HTML/CSS/JavaScript prototype, using “Common” as a provisional label. It demonstrates populated canvas and physics-based graph surfaces, graph resource actions, nested resources, personal layouts and saved views, editable documents, milestones, conversation entry, canonical sharing, explicit private variants, provenance events, project initialization, and locally generated orientation Markdown. `Object and Access Model.md` records the proposed authoritative records, permission boundaries, and lifecycle contract.

The prototype persists sample state on the device. Participants and agent activity are simulated, context is generated from local templates, and browser/connector modules are illustrative. Live multiplayer, server authorization, immutable content revisions, real retrieval, external integrations, and model execution remain later phases. See `prototype/README.md` for running, reviewing, and verification details. These artifacts do not select a production stack or claim the MVP is complete.

## User review: visual correction

The user rejected the initial prototype design. Open canvas means a blank page filling the space beside the left rail, with the floating chat as the other persistent control. There must be no title (not merely no large title), logo, hero section, marketing copy, top menu/header, inset frame, or default card dashboard. They requested monochrome, stronger contrast, and a modern, restrained surface that leaves users room to think. The Codex app's own chat treatment was closer to their expectation; the praise in the call referred to that, not the prototype's composer.

The revised prototype removes the visible header/hero/branding and defaults to no open canvas modules. Modules can be intentionally opened through the rail/chat add control or from graph resources; personal open-module sets persist locally. Existing sample resources remain available in the graph. This supersedes the populated-default canvas guidance in the earlier proposed phase 1 plan.

## Subsequent interaction review and rebuild

The user rejected the second pass too. They specifically required visible shared membership and counts, Discord/Slack-style channels and threads, creation through the chat's integrated controls rather than a rail Add to canvas menu, spatial grid/depth cues, snapping, unrestricted dragging, reliable pan/zoom, and a way to recover distant components. They rejected components spawning more windows, the generic View menu, the graph physics toggle, numbered navigation badges, and the project-name pill in the composer. Graph resource inspection must remain on the graph rather than automatically navigating to Canvas. Physics must always run. The reference for the composer was the Codex app's own treatment, not the earlier prototype composer.

The user explicitly said to think through the requirements, do it again, and continue; on October 28 they asked to pick it up. `Interaction Contract.md` records the resulting interaction rules. The local implementation was rebuilt around one world/screen coordinate system, per-user scope/surface cameras and layouts, channel/thread records, visible sample memberships, and resource inspection in place on either surface. History/sharing/context now remain within the same resource component. No production backend or agent execution is implied by those changes.

Verification on October 28 passed geometry checks and 33 browser assertions across canvas navigation, persistence, graph-local editing, memberships, channels, threads, canonical sharing, variants, project initialization, and goal settings. A separate real-pointer graph check also passed. Current screenshot evidence and run/review instructions are in `prototype/README.md`. The revised implementation has not yet been accepted by the user. Earlier verification claims refer to earlier versions unless expressly repeated here.

## Latest user review: production quality, scale and content surfaces

October 28. The user rejected the icons and labels, especially “4 members · 1 agent,” and required the design to account for substantially larger groups and agent populations. Project context belongs in a module on the canvas, not in the left rail. Rounded-square features and generic document, spreadsheet and presentation viewers were rejected. Graph nodes must not be bordered boxes containing icons. The user explicitly asked for production-reference research, deeper reasoning, an updated plan, a review of all previous feedback after the first pass, and further iteration. These are corrections to the prototype, not acceptance of its current design.

Primary-source research and the implementation/review plan are in `Design Research and Revision Plan.md`. References include official Codex screenshots, Slack channel organization, Linear membership roles, FLORA typed canvas surfaces, tldraw camera behavior and ONLYOFFICE's distinct document-engine configuration. Proposed applications of these references are identified as design judgments, not user-approved product or stack decisions.

The local revision removes project context and member/agent summary sentences from the rail. Project navigation and channels remain there; Goals, Knowledge, People and Agents are local tabs in an intentionally opened Project module. People and agent directories support search, filters and bounded pages, checked with 250 people and 40 agents. Assignment retirement is an in-place record change. Icons use one SVG family; work surfaces have nearly square edges. Graph projects/folders/content have separate unframed treatments, with real text/cell fragments in content miniatures, semantic detail reduction and always-on physics.

Added distinct document, spreadsheet and presentation surfaces plus a loopback-only, bounded DOCX/XLSX/PPTX import parser. Real fixture files exercise document headings/tables, worksheet values/formulas/tabs and slide text/aspect/geometry. Local documents, cells and slide text/notes can be edited. Imported Office previews are explicitly limited: they do not provide full-fidelity Office rendering, binary round-trip saving or co-editing. A production document engine remains an investigation, not a selected provider. `prototype/server.py` is now the preview entry point; it does not add authentication or authoritative resource storage.

The required second review produced further changes: removed repeated filename bars; added readable structured worksheet/slide history; preserved graph inspector cell/sheet/project-tab state across redraws; kept document/sheet scrolling local rather than panning the canvas; fixed formula editing redraw errors; added direct text editing for local slide drafts; strengthened graph anchor contrast and initial spacing; and kept new surfaces readable when created from a zoomed-out canvas. These are verified corrections, not claims of user acceptance.

Current verification, exact commands, screenshots and limits are in `prototype/README.md`. The work remains a browser-local interaction prototype. Production identity, memberships/access enforcement, durable files, collaboration, real connectors, agent execution, permission-filtered retrieval and autonomous context maintenance remain the next integration stages of the proposed MVP.

## GitHub handoff

The user requested a GitHub project to hand the work to other agents. Created the private repository `https://github.com/Triple-dylan/sandbox-workstation`. The initial handoff contains the current prototype, requirements and interview record, interaction/access contracts, production-reference research, current visual evidence and generated test fixtures. Superseded screenshots remain local and are excluded from Git.

The root `README.md` is the entry point for the next agent. Browser fixture imports now load through the local preview server rather than absolute paths from the original Mac. `prototype/tests/run-browser.cjs` provides an optional standalone Playwright harness. These packaging changes do not select a production stack or imply design acceptance.

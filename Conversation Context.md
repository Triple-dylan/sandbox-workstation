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

## Walking review: conversation behavior and direct messages

The user is reviewing by voice while walking and cannot inspect the interface visually. Focus this review on user experience, behavior and general refinement; avoid substantial visual changes during it.

The user agreed that working context and message destination are distinct: opening a document must not silently change who receives a message. Unsent drafts should remain with their channel/thread when navigating elsewhere. These are confirmed behavior requirements; draft isolation has not yet been implemented.

The user also confirmed that this is a workstation with messaging as an important component, not a messaging-platform product. Support one-to-one messages between people without requiring a project. Direct conversations need independent identities and participant access rather than hidden projects. The current owner-only private-chat sample does not implement person-to-person direct messaging; add this to the implementation backlog. No new visual layout was approved by this clarification.

## Approval clarification during voice review

The user confirmed that collaborative agent work needs an approval/prompting process. Private agent conversations can have configurable autonomy preferences, potentially in agent settings or an agent module. Do not keep asking whether these two settings differ. Specific approval routing, autonomy controls and placement were not decided. The assistant's later background-job and retirement proposals were not confirmed by the user.

## Evening rejection and required research/interview reset

The user supplied a Codex popout reference and screenshots of overlapping/broken prototype modules. They rejected the current interaction model: modules must snap with organized layout allocation, must never overlap, and must not form an endless open pan/zoom canvas. No workspace zoom controls belong in the chat bar. The unexplained Agent toggle, inline New chat naming form and bottom-left identity cycling are rejected. The combined Goals/Knowledge/People/Agents Project module is rejected.

Some modules are fixed on the right by default. The user clarified that these are sources/context, agent and goal modules, not conversations, and several need to be available concurrently. The left rail may extend to show conversation threads. Opening a DM can switch the active conversation while an existing document stays open; quick reply remains a potential supplement to research. Human DMs do not require projects.

The graph's central node must be centrally anchored, only slightly draggable and forced back to its original placement; other nodes have greater movement. Folders/documents need meaningful interactions. Selecting them should open a node explorer or document viewer as a module. The precise relation between expanded viewers and the non-overlap rule still needs a concrete follow-up answer. The Codex screenshot specifies general module style and quality rather than post-it cards; it does not mandate copying the popover's exact behavior.

The user chose the proposed desktop-style snap behavior: placement preview and neighboring modules resizing. Their answer about an extended left conversation rail does not settle what happens when an additional work module cannot fit. Do not invent an answer from that response.

The user requested a new UI/design system. Muted gray is explicitly rejected; they want more Liquid Glass. This supersedes earlier monochrome-only and nearly square-card design prescriptions. New defaults for chat creation and quick reply should be grounded in research rather than pushed back as generic design questions.

The user explicitly requires questions, research, more questions and then a plan before implementation. The plan must address the actual product, avoid generic/half-built output, prevent broken behavior and trace the cumulative feedback from October 27–28. They named the open-source T3 Code repository as a research source and then stressed that research must cover the whole system, not just harnesses.

`Research Review.md` records pinned T3 Code source inspection, reassessment of earlier references, other production interfaces, and research into layout, design/materials, collaboration/conflicts, file editing, authenticated browsing, automatic context, permissions, provenance, approvals/recovery, graph hierarchy and accessibility. These findings are not a selected stack, completed implementation or approved plan. Copies of the four supplied reference screenshots are preserved under `research/references/`. The app was not changed during this research round.

## Research follow-up answers

The user clarified that there is one document viewer showing one document at a time. This is not a universal one-window limit: browser windows, agent-editing surfaces and other extended modules have their own roles. Do not infer unlimited document windows or a single universal viewer for all module types.

The graph centers on its current subject node. Leaving that focused interaction or returning to the canvas/full graph restores the centered full view. Combine this with the previously confirmed limited central-node drag/restoring force; do not reintroduce workspace zoom.

The user selected web for now, particularly for sharing and demos. An installed desktop application is not the current delivery target. Browser embedding/session limits remain engineering constraints to research and explain, not grounds to quietly change that decision.

The user confirmed light and dark glass variants following the OS. They did not specify a color family; the design work should exercise judgment and offer a coherent direction for review.

The phrase “beside any snapped document” was unclear to the user. Exact placement of the actual message history remains to clarify in plain language, distinct from the extended left rail's conversation list. “Integration action” was also unclear: explain it as using an account in a connected service. A private/personal versus explicitly shared project connection policy remains a proposal, not a confirmed new decision.

## Coexistence, shared connections and final reflection

The user clarified that chat, the graph and an open work window must be able to coexist; the interface is not always one or another. Preserve this alongside a single document viewer and independently useful browser/agent-editing/utility modules. The earlier question's “central area” must not become an exclusive-page restriction.

The user accepted the proposed connected-account distinction: personal connections stay personal, while projects can explicitly add connections shared agents are allowed to use. This is now a confirmed direction rather than merely a proposal. Connection ownership and access need actual enforcement.

The user requested a final reflection and, if useful, more research into innovative features, interesting actions and anything overlooked. `Research Review.md` now distinguishes missing core behavior from optional extensions: precise selection-based questions, source-linked personal catch-up, recorded-dependency impact checks and explicit navigation to a collaborator's shared work. These ideas remain proposals. The additional research also found a web-first interactive remote-browser approach worth a feasibility proof; no browser provider, service account or paid service was selected.

## Proposed rebuild plan after reflection

`Rebuild Plan.md` is the concrete proposal produced after the two question rounds, primary-source and T3 source research, final clarifications and additional action research. It covers the working interaction contract, a new light/dark glass design system, technical feasibility proofs, authoritative collaboration/context/agent foundations, sequenced implementation and feedback-to-acceptance evidence. Optional actions are labeled separately and not treated as approved MVP scope. No app implementation, paid service selection or claim of user approval accompanied its creation.

## Rebuild approval

The user said “great, approved” after reviewing the researched plan and reflection. Stage A is now authorized: new material/component and bounded-layout proofs, plus narrow feasibility checks. The existing plan's subsequent design-review gate remains; this is not acceptance of the new visuals before they exist, selection of paid services or a claim that the full MVP is complete. Work starts in a separate `workstation/` app, preserving the rejected prototype and its local records.

## Stage A review build after approval

A separate React/TypeScript layout and material proof now exists in `workstation/`, served locally on port 4174. The old prototype and its browser-local records remain preserved. A fresh new entry is blank. The new split layout supports conversation, graph, one document viewer and separate simultaneous Sources/context, Project agent and Goals utilities. The first document receives a full-height reading region; conversation and graph share the adjacent column. Other module types remain independent. Placement previews, cancellation, shared dividers, keyboard resizing, focus/restore and narrow-window recovery are implemented without application zoom or persistent overlap in the exercised workflows.

The proof uses the actual plan, conversation record, access model and research as read-only Markdown sources. Graph folders/actions use those identities, with an anchored subject and spring return. Interview excerpts are labeled as imported records rather than fake live collaborators. Conversation/main-thread drafts and explicit source attachments are separate; opening files leaves the recipient unchanged. Human DMs remain local drafts without contact lookup or delivery. Local goals, personal preferences and one work-pane preset are demonstrable; named/per-project presets and durable utility sizing/order/pinning are not complete.

The composer plus was kept specific to source attachments. General module opening lives in a work-area menu, contextual empty-surface menu and Command/Ctrl+K picker. Account opens local status/appearance rather than cycling identities. The new light/dark glass and opaque content material proof is at `/materials`; it is a review specimen, not the product landing page.

All 14 automated browser scenarios passed after the final substantive layout change. They exercise multiple viewport sizes, real pointer/keyboard behavior, document reuse, draft isolation, graph actions/spring return, cancel/drop, utility collapse, narrow-window recovery, local DM behavior, attachment without accidental submission, preset restoration and damaged-state recovery. Manual review also exercised the module picker and disconnected Browser pane. Passing checks are not visual acceptance. Build and format checks are separate; warnings and exact limits are recorded in `Stage A Review.md`.

The movement proof caught a layout-library failure: resolving a destination before removing an origin could leave an invalid location when the split tree collapsed. The new movement wrapper resolves after removal and restores the prior snapshot if allocation fails. Other corrected defects included thread/main draft coupling, menu clipping, hidden-pane keyboard exposure, reading-position loss on pane remount and source-menu buttons unintentionally submitting the composer.

No real Office engine or interactive browser session was connected, and no running agents, multiplayer, authoritative permissions, persistent shared resources or real message delivery were added. Local headless LibreOffice availability is not a web editing proof. The Office round-trip/shared-editing and isolated authenticated-browser/input/reconnect/expiry proofs remain open technical gates. No paid service was selected. The next user review is of the concrete material/layout artifact, as required by the approved plan, before expanding full implementation.

## Stage A rejected: primary surface, rail behavior and utility sizing

The user reviewed the new build with screenshots from 8:34 and 8:36 PM. They said the colors are better, the left rail is more beneficial and the right-hand modules feel better. Retain these improvements; this is not complete visual acceptance.

They rejected the cluttered windows and said the canvas has been lost because the interface is six boxes smashed together. The graph should take up the whole canvas. The left rail should not open windows or modules into the canvas; that behavior was not requested. The Goals screenshot shows utilities consuming large amounts of empty space without useful content. The user asked for a thoughtful self-review grounded in sound UX principles.

`Primary Surface UX Review.md` records the audit and separates these confirmed corrections from proposed remedies. The implementation wrongly conflated navigation, primary surfaces, resource inspection and supporting utilities into generic split panes. Its flexible utility sizing expands remaining modules to consume unused height. Non-overlap and coexistence remain requirements, but they do not imply filling the viewport with equal-status tiles or opening unrelated modules during navigation. The fourteen passing browser scenarios do not establish product acceptance; several assert the rejected structure.

The next design work must restore full-canvas Graph/Canvas hierarchy, keep rail navigation distinct from opening work, size supporting modules to their content and demonstrate inspection/conversation continuity without a proliferating window layout. No app changes were made during this audit. Do not resume full backend/engine/agent implementation on the assumption the stage A design was accepted.

## User-authorized primary-surface implementation

The user then instructed: “ok well lets fix it. review, plan, and implement,” emphasizing that the major mistakes were unacceptable. `Primary Surface Fix Plan.md` records the implementation decisions made in response, without treating every placement detail as a new user-provided requirement.

The correction removes whole-workspace docking. Graph and Canvas are primary destinations. Graph is rendered directly across the working canvas, with its centered subject and physics retained; compact right utilities do not reduce it to a window or reserve an empty full-height column. Graph nodes avoid the occupied utility area. The rail opens conversation/resource navigation in a left extension and never creates canvas work objects. Selecting a conversation opens its transcript there and leaves work/context state alone.

Folders and documents reuse one supporting inspection area. Opening a file replaces the folder contents in that area; it does not add another explorer/document window. Closing inspection restores the prior utilities and graph space. An explicit Place on canvas action moves the one document viewer onto the canvas. Browser and agent settings are independently available intentional tool types, with disconnected services clearly identified. A small Add a canvas tool action, Command/Ctrl+K and the empty-surface context menu provide deliberate creation.

Canvas work objects have purpose-sized bounds, snap previews, collision rejection, pointer/keyboard movement and resizing, pairwise edge snapping, focus/restore and capacity recovery. The canvas retains unoccupied space. Utilities fit their content and scroll when needed: the three-goal module measured about 212 pixels both with its neighbors present and after those neighbors closed. Empty date inputs are replaced by optional date actions. The improved palette, rail and utility material treatment were retained.

Existing local conversation/message/draft/attachment/goal/appearance records are retained under the same storage key, with new view state versioned separately from preserved legacy split data. Main/thread drafts, recipients and reading positions remain independent of document navigation. A failed source fetch has a working retry action. Real accounts, delivery, collaboration, permission enforcement, Office editing, browser sessions, agents and automatic context maintenance remain unimplemented. The correction is ready for user review, not declared accepted. Current evidence and verification are in `Primary Surface Fix Results.md`.

The final correction was also checked for an invisible-column regression: compact utilities occupy only their content area on both Graph and Canvas, and deliberate canvas work can use the space below them while collision checks prevent covering them. Twenty-one final browser scenarios passed. Project-agent details disclose inline; personal preferences remain an independent explicit tool. Current records are retained, and the latest review captures/results are preserved with the handoff.

## Subsequent review: mature interactions, monochrome chrome and agent lifecycle

The user supplied three screenshots from 8:58–8:59 PM. They rejected the textbox/focus highlighting, the Add a tool menu and subsequent creation catalog, immature conversation tabs/features, the agent preferences page's lack of building/deployment, and the graph's decorative center symbol. They explicitly required the graph, rail, icons and right modules to be monochrome. The earlier blue-control palette is no longer a retained design choice. Preserve glass depth, readable content and light/dark support; do not interpret monochrome as returning to the rejected flat low-contrast gray appearance.

The user said the product is improving but choices made during coding still appear random and shallow compared with the discussions. They requested another cycle of research, reflection, planning and looping back against previous goals, then instructed the work to continue. This is not acceptance of the current preview or approval to pretend missing services exist.

`Maturity Refinement Plan.md` records the new screenshot/source audit, reinspection of pinned T3 composer/draft/panel sources, primary research into Slack conversation semantics, Dify's build/preview/publish lifecycle, LangSmith registration versus execution, durable approvals, conditional writes and accessible focus/popovers. Proposed changes distinguish opening canonical work, creating content, attaching context, editing agents and arranging views. They specify conversation identity/delivery/recovery and an agent definition → test → publish/activate → run/revise lifecycle, preserving default project agents and automatic context maintenance. Exact proposed UI/state/service choices remain proposals. No runtime/provider or paid service was selected.

The second reflection checks these proposals against the general-purpose workstation, canvas hierarchy, canonical sharing/provenance, private/shared access, real engine constraints and context automation. The latest screenshots are preserved under `research/references/rejected-creation-menu.png`, `rejected-tool-picker.png` and `rejected-composer-focus.png`. This cycle updated research, plan and handoff, with no application changes or new browser validation claimed. The current preview retains the rejected treatments. The existing design-review gate before broader application implementation remains in effect.


## Refinement implementation authorized and delivered

After the researched refinement plan was delivered, the user said “proceed.” Implemented the interaction/configuration revision in `workstation/`; `Maturity Refinement Results.md` records current behavior, review captures, checks and limits. The earlier statement that the preview was unchanged describes the planning cycle only.

The shell/graph/rail/utilities and control states are monochrome in both themes. The graph center glyph/gradient is removed; anchored physics and full working-surface behavior remain. A single composer boundary replaces the nested highlighted textbox, with per-thread context, inspectable attachments, IME-safe sending and a send-shortcut preference. A direct anchored resource/action search replaces the Add a tool cascade. New document creates an editable private local resource with stable identity and a private folder in the local graph. One viewer is retained; no native Office engine is claimed.

Conversations have readable transcript grouping, message search, per-conversation thread restoration, separate main/thread drafts and session reading positions. Local messages are explicitly local. The arbitrary name/email DM creation form is removed because no authoritative identity or delivery service exists; existing unverified DM drafts remain accessible. Private local resources cannot silently attach to channels or DM drafts, and send preserves the draft when this restriction is hit. Actual canonical sharing still requires the service layer.

The agent surface now creates and edits local definitions, purpose/instructions, scope, context preference and private autonomy; saves immutable versions; restores a version into a draft; and exports definitions. The dedicated project definition keeps project scope. This is real browser-local configuration behavior, not a deployed/assigned production agent. Tests/deployment remain unavailable without an executing service; no fake success, job or context-maintenance result is generated. Runtime/provider, identity/storage/collaboration, file/browser engines and other production integrations remain unresolved implementation work. This revision is not user visual acceptance or completion of the full plan.


## Canvas usefulness: messages, visuals and planning

The user asked to make the canvas more useful and distinct, naming pinned messages, visuals and planning tools directly on the canvas. `Canvas Use Plan.md` records a focused interpretation: keep evidence and actions together, rather than making the canvas only a launcher for work windows. Primary research considered Slack source pins, Miro planning over existing records, FigJam organization and Milanote's distinction between documents and board content. These sources did not override bounded snapping, blank entry, privacy or the general-purpose product.

Implemented source-referencing message pins with original navigation, private local visual references with captions and IndexedDB image persistence, and a sequential canvas plan using the same existing goal IDs as the right-hand module. A project-channel pin can explicitly become one sourced plan step; repeating the action does not duplicate it. Private pins cannot silently become links in a shared plan. Closed views can be reopened without copying their underlying record. Existing layouts and personal drafts remain. `Canvas Use Results.md` records behavior, checks, evidence and the remaining local-only/service limits. No automatic agent execution, shared persistence, authoritative permissions or visual acceptance is implied.

## October 29: another review, research and reflection cycle

The user requested: “launch another review, research, reflect cycle.” Reviewed the full record, current source revision `c98ba8a` and compound browser journeys in isolated contexts. No application source or user preview records were changed. `Workstation Review 2026-10-29.md` contains ranked findings, primary sources, proposed next work, acceptance criteria and a second reflection against the complete feedback history. Reproducible measurements and screenshots are under `research/reviews/2026-10-29/`.

The new probes expose gaps beyond the earlier passing scenarios. Opening Project tools with a pin, plan and image visible hides the pin and actively edited plan, focusing the last-added image. All records survive; after a settled shrink/return the objects recover, while conversation navigation remains closed. This is a visible-work continuity failure, not evidence of deleted records or persistent overlap. A controlled localStorage quota fault during image replacement leaves old saved metadata pointing to replacement pixels after reload because Blob and metadata writes are separate. This is injected failure evidence, not actual exhaustion of the user's browser storage. Closed pins cannot be found by text after character 65; image captions are not searched. One source is limited to one step, content lifecycle/undo/export are incomplete, and the saved arrangement contains geometry only.

The canonical knowledge gap remains central: private images have browser-local visual metadata but no common resource/private-graph/retrieval path. Their absence from shared project Sources is correct and must not be “fixed” by automatically sharing private work. Research into Heptabase, Notion, Vivaldi, browser storage, W3C provenance/accessibility and MCP resource contracts informs separation of canonical records, personal placements, source uses/revisions and authorized derived context. These are design inferences, not newly approved services or permission policies.

The report proposes consistent/recoverable local content, intent-aware layout, full-content recall and named arrangements, source-to-multiple-action behavior, then a narrow real context-service proof rather than indefinite visual polishing. Exact remedies are proposals; no fixes, runtime/provider, backend or paid service were selected in this cycle. Preserve the design-review gate. Routine context upkeep remains automatic, consequential shared changes follow shared approval policy, and saved views never grant access or silently change message recipients. Earlier recovery/search statements and test counts must be read with the new findings.

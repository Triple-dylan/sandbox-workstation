# Project handoff and working instructions

## Read first and current work gate

Read `Conversation Context.md` in full. Later confirmed clarifications supersede earlier exploration and earlier implementation plans. Read `Research Review.md` for the latest requirements, screenshot evidence, source-level T3 Code review and research beyond harnesses.

The user approved `Rebuild Plan.md` on October 28 after the required questions, research, follow-up questions and reflection. Proceed with stage A: behavior/material/layout proofs and the narrow feasibility evidence. The new design is not yet accepted; the plan retains a user design-review gate before expanding full application implementation. Paid services/providers are not selected by this approval. Research findings and proposed defaults are not user decisions. Do not ask the user to justify the product through a first use case or repeat questions already answered.

This handoff was explicitly requested to prevent context decay. Preserve the conversation history. The older `Design Research and Revision Plan.md` and earlier `Interaction Contract.md` describe rejected/superseded work where they conflict with the latest review. Passing old checks does not validate the new behavior or imply acceptance.

## Product purpose

Build a general-purpose workstation where people and agents work across private and collaborative spaces: work, design, development, finance, marketing, hobbies and informal collaboration. Do not narrow the product to coding merely because a coding harness is a research reference. Messaging is important, but this is not primarily a messaging-platform product.

Agents automatically gather, organize, update and hand over useful context as work happens. People govern access and sharing without maintaining this machinery manually.

## Latest settled experience requirements

- The canvas is a bounded workspace with desktop-style snapping, placement feedback and neighboring modules resizing. Working modules must never overlap. Replace the endless free pan/zoom interpretation; no workspace zoom or zoom controls in the composer.
- Chat history/input, the graph and an open work window must be able to coexist. Do not make them universally mutually exclusive pages. Keep one document viewer while preserving independent browser/agent-editing modules and concurrent utilities.
- Graph and canvas remain separate surfaces in one harness. Projects open into work, with no overview/hero pages, workspace title, logo, marketing copy or top-menu clutter. Content/tools appear through intentional interaction; do not preload a dashboard to fake usefulness.
- Preserve the left rail and floating chat input. Conversation navigation can extend from the left rail. The exact chat-creation and quick-reply flow is being researched; do not restore an inline naming form in the composer.
- Right-side sources/context, agent and goal modules are independently useful and can be visible concurrently. Conversations do not belong in the right utility region. The all-in-one Goals/Knowledge/People/Agents Project module is rejected.
- Opening a DM can switch the active conversation while an open document remains. One-to-one human messaging does not require a project. Preserve message destination and drafts per conversation/thread; opening a document must not silently change recipients. The owner-only private-chat sample does not implement human DMs.
- Private and collaborative conversations need clear audience/scope, channels and nested threads. Avoid summary labels such as “4 members · 1 agent.” Large directories need useful search/filtering, not rows or totals repeated throughout the shell.
- The bottom-left account control must not cycle fake identities. Remove demo fluff and unexplained Agent toggles. No implemented/executing state may be simulated and described as real.
- Module style should have the quality, hierarchy and depth shown in the user's Codex popout reference, not post-it cards. That screenshot is a style reference; it does not settle every popover/overlay behavior.
- A new UI/design system with more Liquid Glass is required. The muted gray appearance is rejected. Earlier monochrome-only and nearly square-card prescriptions are superseded. Color, typography, materials, icon meaning, focus and motion require a coherent design, not an added blur effect.
- Graph physics/magnetism always apply, with no toggle. Its central node is anchored, can be dragged only slightly and returns to its original position. Other nodes have greater movement. Do not apply a global zoom/camera to the harness.
- Folder nesting manages graph density. Nodes must communicate meaningful types and actions, without bordered boxes containing icons or an identical node for everything. Selecting a folder/document opens a node explorer or document viewer module. Keep access to the graph; do not silently navigate to Canvas. Expanded-view placement remains a follow-up decision against the no-overlap rule.
- Graphs visualize folders, resources, relationships and permitted activity: a teammate working on a shared document and the knowledge domains an agent accesses. Document edits do not inherently reshape the graph. Agents retrieve underlying context; they do not live in or get deployed into the graph.
- One document viewer shows one document at a time; this does not impose a single-window limit on browser, agent-editing or other distinct module types. The graph centers its current subject and restores the centered full view when exiting focus/returning to the canvas/full graph. Web is the current delivery target for sharing/demos; do not quietly substitute a desktop-first shell. Support light/dark glass variants following the OS; no color family was specified.
- Work surfaces include browsers, documents, sheets, slides, conversations, integrations/connectors, goals/milestones and agent work. Real content-specific viewer/editor behavior is required. Parsed Office previews must never be called full-fidelity native Office integration.
- Shared content and personal layout are separate. Personal arrangements/presets remain part of the product. Collaborative projects have common required modules while people can adjust their own views.
- Goals/milestones are lightweight and sequential: human owner, agent assignment, simple deadline. Do not turn this into a complex project-management suite.

## Context, privacy and agent behavior

- Personal service connections stay personal; projects can explicitly add connections that shared agents may use. Enforce account ownership/scope; project membership does not expose a personal browser session or connection secrets.
- Private agents, jobs, tasks, chats, projects and activity coexist with collaborative equivalents. Enforce privacy across resource access, graph visibility, retrieval, presence and provenance.
- Project creation creates a folder represented in the graph, automatic orientation Markdown and a resources/context child folder. Agents maintain purpose, relevant context, goals, references and useful history. Exact filenames/internal organization remain open.
- Every collaborative project receives at least one dedicated agent by default until completion or retirement, including manual retirement. Assignment does not imply continuous inference. Whether retirement drains or immediately stops running jobs remains unresolved.
- Project context is the starting point, not an absolute retrieval boundary. Wider access depends on configured permissions. This was explicitly answered; do not ask again.
- Accessible conversations, goals and history help distinguish tentative discussion from settled direction. Routine context maintenance is automatic; do not introduce mandatory human approval for every update.
- Collaborative agent work requires approvals or prompting for consequential changes. Private agents have configurable autonomy preferences in their module/settings. Exact approval routing and settings placement are not approved designs. Do not treat private preferences as authorization to override shared access rules.
- Sharing makes the original item shared, retaining one canonical identity. Do not silently create private/shared duplicates or private-source synchronization. An explicit private variant is a distinct item with ancestry.
- Retain contributor attribution, origin, sharing history, revisions and variant ancestry. Audit/provenance must not reveal private source conversations.

## Implementation facts and repository

Private handoff repository: `https://github.com/Triple-dylan/sandbox-workstation`. The root README maps the existing source and local checks. The repo's creation is not acceptance of its design.

`prototype/` is the rejected browser-local implementation. It has canvas/graph code, template context, sample identities, limited content viewers/imports and browser-local records. It does not implement real multiplayer, authoritative server permissions, durable resources, live presence, retrieval, executing agents or real connectors. Current human DMs, isolated drafts and agent approval/preferences remain unbuilt. Named presets and private project creation remain incomplete.

`workstation/` is the separate stage A rebuild proof on port 4174, with a component/material specimen at `/materials`. It uses a tab-free Gridview split layout rather than the old absolute-positioned camera. It includes local conversation/thread drafts and source attachments, one read-only Markdown source viewer, folder exploration/subject-centered physics, independently visible right utilities, local goals/preferences and a local work-pane preset. Recorded interview excerpts are labeled; no sample teammates or executing agents are presented as live. DMs are local drafts without delivery. Browser and agent panes explicitly identify disconnected services. Read `Stage A Review.md` and `workstation/README.md` for observed checks and limitations. The new material direction still requires user review; do not expand full implementation or call stage A's engine proofs complete on this basis.

Old tests checked six spatial categories, ten formula cases, six Office parser tests and 66 browser assertions. Some explicitly validate the now-rejected infinite-canvas/zoom behavior. They are historical implementation evidence, not current acceptance criteria. The user supplied actual overlap/broken-flow screenshots despite those checks.

No production stack, runtime/provider, document engine, shell, connector, deployment, schedule or cost was approved. Investigate authenticated browser behavior, file engines, collaboration/conflicts, permission-aware context, provenance, durable jobs/approvals, accessible docking and the new material/design system together. T3 Code and other references inform concrete patterns; do not copy coding-specific assumptions or import their code without a reason grounded in this product.

## Collaboration discipline

Apply the user's recorded answers. Ask only consequential unresolved questions with concrete scenarios and evidence-informed recommendations. Keep sources, inference, proposals and implementation facts distinct. Update the conversation record and this handoff when durable instructions change.

Continue authorized work to concrete reviewable artifacts, while honoring the current research/interview gate. Do not count placeholder screens, fake participants, disconnected data or empty graphs as completed workflows. Preserve this project's fresh start and the reason earlier efforts were rejected.

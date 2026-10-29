# Workstation rebuild proposal

October 28, 2026. **Draft for user review; not approved for implementation.** This follows the required questions → research → follow-up questions → reflection sequence. It replaces the earlier prototype plan where they conflict. No new application code was written to produce this proposal.

Read the complete [conversation record](Conversation%20Context.md), current [handoff](AGENTS.md) and [research evidence](Research%20Review.md). Confirmed requirements below are distinguished from recommended defaults and optional extensions.

## 1. Intended outcome

Deliver a web workstation for people and agents working privately and together. The user can converse, inspect the knowledge graph and work in an open resource module at the same time. Layout is bounded, snapping and non-overlapping. Useful utility modules coexist on the right. Context is maintained automatically and actions respect actual account/resource permissions.

The first usable release includes the whole loop: real identities, project/channel/DM conversations, canonical resources and revisions, shared editing, meaningful graph navigation/activity, lightweight goals, working file/browser/connector surfaces, persistent project agents, automatic context maintenance and approvals. An attractive shell alone is not that release.

## 2. The interaction contract to build

| Area | Confirmed requirement | Proposed implementation/default for review |
| --- | --- | --- |
| Overall workspace | No marketing/hero/logo/title/header clutter or overview page; open work directly. Chat, graph and a resource can coexist. | A bounded region layout with compact left navigation, optional expanded conversation list, independently allocated work panes and a right utility column. Empty central work remains empty until used. |
| Placement | Desktop-style snap feedback, neighboring modules resize; no working-module overlap or endless canvas. | Drag a header using a placement preview while actual modules retain allocated space; commit a valid drop into the layout tree. Resize shared dividers. Reject invalid placements; never use z-index to hide a collision. |
| Capacity | Modules must remain usable; a document is not an unlimited new window every time. | Minimum sizes per module. When another work pane cannot fit, offer focus/replace/close choices without silently losing existing work. Navigation and utilities can be collapsed and restored. No global scaling to fit. Exact thresholds must be proved at real browser sizes. |
| Documents | One document viewer, one document at a time. Other extended windows such as browser and agent editing are independent. | Selecting another document updates the existing viewer and retains prior reading state for return. A browser, agent editor, graph and conversation are distinct module types, not documents masquerading as generic cards. |
| Conversations | Left navigation/extended rail; private and collaborative work; DMs without projects; messages and documents can coexist. | The left extension lists conversations. The selected transcript occupies an allocated work region, which can coexist with graph/viewer panes or be focused. This is not a conversation panel in the right utility column. |
| New conversation | No naming form inserted in the composer. No unexplained Agent toggle. | Open a draft directly, retain its scope/recipient and infer a useful title after meaningful content. Start a human DM from person selection; reuse an existing one-to-one conversation. Project channels/threads retain their own audience. New private/project actions communicate scope before sending. |
| Composer | Floating input remains; no zoom controls or project-name pill. Working context does not silently change recipients. | Message entry, send, attachments/explicit context and only conversation-relevant controls. Draft text, attachments and thread target are keyed to the conversation. An actual agent participant or configuration is managed through its conversation/module/settings, not a global toggle. |
| Right utilities | Sources/context, agents and goals can appear together; conversations do not belong here; combined Project tabs rejected. | Separate utility modules with meaningful headers and compact controls. Relevant defaults are open in a project; individual modules can be resized, collapsed, pinned/reordered and restored without changing shared records. Large directories use their own purposeful views rather than being hidden under a generic Project tab. |
| Account | No cycling sample users. | Normal account/settings actions for the actual signed-in user. Sample identity and activity are reserved for explicitly identified test fixtures. |
| Graph focus | Center on the subject; center node has limited drag and springs home; leave focus/return to full graph restores center. | Keep full versus focused graph state explicitly, with an obvious return action/breadcrumb. The graph layout responds to its pane size, not a workspace zoom camera. Preserve orientation, branch state and focus when the viewer is opened/closed. |
| Graph actions | Useful folder/document interactions; viewer or node explorer opens as a module, without an unwanted switch to Canvas. | Folder selection reveals its relevant branch/explorer; document selection opens/reuses the canonical viewer. The graph remains available in the same working arrangement. An expanded viewer uses allocated/focused space and restores the prior arrangement when closed. |
| Graph meaning | Folder nesting, distinct resource types, permitted human/agent activity; no identical boxed icons. | Define a small node/edge grammar and readable labels before drawing the graph. Containment, explicit references, recorded source usage, live access and inferred similarity must not imply the same relationship. Explain a selected relationship using its actual evidence. |
| Menus and expanded views | Codex reference establishes module quality/style; working modules never overlap. | Temporary menus, tooltips and placement previews are a separate transient layer. Persistent viewers and expanded work are layout-managed. No chain of resource buttons spawning overlapping working windows. |

These defaults are not all newly confirmed user choices. Their review is part of this proposal; none authorizes changing the app yet.

## 3. New design system, before another product screen

Create a reviewable component/material proof in light and dark, following the OS. The user left the palette to design judgment. Propose crisp readable content surfaces, glass navigation/composer/module chrome, deliberate ambient color and one coherent accent family. Avoid a wall of muted gray, decorative gradient blobs or making reading content transparent just to demonstrate blur.

Define semantic tokens for content, glass, borders/highlights, shadow/elevation, text hierarchy, accent, selection, warning/error and presence. Define typography, spacing, type-specific minimum sizes, focus rings, motion and a coherent functional icon family. Use tabular numerals where data needs them and readable UI text rather than tiny low-contrast labels. Radius and depth follow component purpose and the supplied Codex module reference, not universal post-it-card styling.

The proof includes the composer; conversation list/message/thread; sources module; agent status/approval/settings; goals; file/browser viewer chrome; graph node/edge states; snap targets/dividers; and loading, empty, error and reconnect states. Display real representative content, long names and busy states. Do not populate the workspace with a default card dashboard. Include reduced-motion/transparency and keyboard/focus treatments without changing the product's identity.

**Review gate:** the user can assess the component system and several coherent working arrangements before the full interface is rebuilt. Do not claim acceptance from the references or from passing automated tests.

## 4. Architecture direction and early feasibility proofs

The current absolute-positioned canvas, shared global conversation state and layered CSS are not a reliable foundation for the changed interaction contract. Preserve the old prototype and browser data as historical evidence; reuse useful fixtures and domain knowledge, not the rejected layout assumptions.

Recommended direction, still subject to the proofs: a typed component web client, a bounded layout engine, authoritative server records/events and resource storage, content-specific engines/adapters, and a server-side agent/job/context layer. A component framework such as React/TypeScript and Gridview/Splitview-style layout primitives are candidates, not approved stack choices. Do not adopt full tabbed/floating docking just because it comes with a library. Record exact versions, constraints and rationale when choosing tools.

Separate these states explicitly: shared resource content/revision; conversation/message/thread/draft; user layout and reading/focus state; graph subject/expansion; ephemeral presence; durable job/approval; connection ownership; and derived context/index freshness. Opening a view must not create a resource, widen permissions or start/stop execution as a side effect.

Before promising the implementation, produce three narrow working proofs:

| Proof | Must demonstrate | Failure condition |
| --- | --- | --- |
| Bounded layout | Conversation, graph and single viewer coexist with multiple right utilities; snapping/reflow, readable minima, keyboard resizing, narrow-window handling and restoration | Any persistent overlap, lost offscreen module, unreadable forced shrink, background pan/zoom, or typing intercepted as a layout shortcut |
| Real files | Open/edit/save/reopen/export actual DOCX/XLSX/PPTX samples through an appropriate engine; retain canonical identity, revisions and permissions; demonstrate real shared editing where supported | Flattened text presented as native fidelity, silently lost formulas/layout/images, fake Save, or local-only edits presented as durable/shared |
| Web browser | An actual interactive browser module with navigation/login, explicit personal/project connection ownership, resize/reconnect and honest expiration/error state | Generic destination iframe presented as arbitrary authenticated browsing, leaked personal session, or a screenshot presented as interactive browsing |

Web-first is fixed. Embeddable supported services, connector modules and an interactive remote/connected browser are different capabilities. The research found a remote-browser display approach that can be embedded in a web client; prove its session, latency, input, account and lifecycle behavior before choosing a provider. Do not quietly substitute a desktop-first release or downgrade the requested browser to an illustrative iframe.

Office engine and browser-provider selection must follow demonstrated behavior. No paid service, credential, deployment or hosting choice is implied by this document. Missing credentials or an unsupported engine capability is a visible integration blocker, not an excuse to relabel a mock as complete.

## 5. Build sequence with reviewable exits

### A. Lock the behavior and visual proof

Turn the table above into module roles, layout transitions and actual interaction diagrams. Produce the light/dark component proof and the bounded-layout proof. Exercise meaningful content and the supplied overlap scenarios. Review before expanding feature work. Keep confirmed requirements, proposed defaults and open technical choices visibly distinct.

### B. Establish real identities and canonical data

Implement users, private/shared scopes, memberships, projects/folders, resources/revisions, conversations/participants/channels/threads, goals, agent assignments and connection ownership. Persist user views independently, including explicit personal layout presets that restore arrangements of the same records rather than copying content. Shared required-module configuration remains separate from personal placement. Enforce access on the server for direct reads/writes, search, graph queries, history, attachments, event subscriptions and retrieval.

Project creation transactionally initializes its folder, resources/context grouping and dedicated agent assignment. Orientation generation has pending/failure states until actual execution completes. Human DMs do not require a project. Invite/join/revoke flows and reconnect must work with two actual users; the account button is never the test identity switch.

**Exit:** a private item can be shared as the same original into a project, another real user can access it, an explicit private variant has a different identity/ancestry, and private source conversations stay inaccessible. A failed direct API request must not succeed merely because a UI control is hidden.

### C. Connect the shell, conversations, graph and resources

Use the proven layout and design system on real records. Implement channel/thread and DM navigation, drafts, sender/recipient clarity, context selection and state restoration. Connect the one viewer to actual file/resource identities and the graph to actual folders/references. Right utilities read shared project records while their arrangement stays personal.

Folder exploration, subject centering/return and resource opening must work with real pointer and keyboard interaction. The graph can remain visible alongside conversation and viewer. Actual authorized presence/access events expire and indicate work without rearranging the graph. Selecting a node does not silently create a new document or route the user away from the graph.

**Exit:** two users can discuss a shared resource, edit it, maintain different arrangements and see permitted activity; a private conversation or job is absent from another user's graph, direct queries and feeds.

A quick-reply extension can be considered after the core routing works: reply to an existing DM from an allocated inline area of the expanded conversation list, keeping the main conversation and draft untouched. It must retain the same DM identity and explicit recipient. This is an optional researched default, not a required new floating window.

### D. Connect file, browser and external-service adapters

Promote the feasibility proofs into integrated modules using the same resource, revision, access and connection contracts. Add an actual connector with useful operations and explicit account/scope state; choose the first service as an implementation configuration decision rather than narrowing the product around one department or coding use case.

A captured browser/reference selection records source URL, attribution/time and appropriate content references. It enters the resource/context model without duplicating entire files or exposing a personal session. Save, upload, reconnect, revoked access and expired sessions are genuine states with recovery actions.

**Exit:** demonstrate real file persistence/round-trip behavior, an interactive browser and one actual connected service. An unsupported integration stays visibly unsupported.

### E. Implement the project agent and automatic context loop

Create persistent assignments and durable jobs independently of UI visibility. Maintain purpose, relevant goals, references, useful decisions/open questions and history from authorized project conversations/resources. Coalesce repeated editing events, track source revisions, refresh indexes and generate orientation Markdown with uncertainty preserved. Project context is the starting point; broader retrieval remains permission-filtered. People do not manually package every handoff.

Add actual activity/job states: queued, running, awaiting approval/input, completed, failed and canceled. Configure private-agent autonomy in its settings/module; collaborative actions use project approval rules. Bind an approval to the exact proposed operation, target revision and effective access; revalidate stale proposals before applying them. Separate job checkpoints, long-term project knowledge and ephemeral activity. Retries must not repeat completed external actions.

Support simple user-configured routines for shared or private agents, alongside event-driven context maintenance. Persist the schedule, owner, connection scope, approval policy and each run separately; prevent duplicate runs on retry/reconnect. This is routine agent work, not a broad workflow-builder project.

Agent retirement prevents new work; whether to drain or immediately stop existing jobs still needs an explicit lifecycle decision before that control ships. Closing a module is not an implicit retirement/cancellation action.

**Exit:** a real newly assigned agent can orient using maintained sources; a changed conversation/goal/reference leads to a traceable context update; a shared modification follows approval; failed updates do not claim context is fresh; private material never appears in shared retrieval or output.

### F. Validate the complete release, not isolated screens

Run the acceptance scenarios below with real records/users and actual execution. Record observed results, source revisions, screenshots/video and remaining limitations. Fix failures before adding optional capabilities. Keep the original rejected version available as historical evidence without presenting it as current output.

## 6. Feedback-to-acceptance evidence

| Requirement/previous failure | Required evidence |
| --- | --- |
| Open working surface, no marketing/dashboard | Fresh private/project entry and deliberate module opening; no hero/logo/title/overview page or unsolicited card grid |
| Modules overlap and disappear | Open, move, resize, focus, close and restore all supported module types at representative 1280/1440/1920 widths and short/tall heights; test intermediate layout transitions and canceled gestures; no persistent intersections or lost modules |
| No infinite canvas or workspace zoom | Wheel/keyboard behavior scrolls content as intended; no application camera/zoom UI or handlers; graph drag stays bounded; normal browser accessibility remains available |
| Chat, graph and work coexist | One continuous interaction shows the transcript, focused graph and canonical viewer with right utilities, then restores a prior arrangement without losing a draft or graph subject |
| One document viewer, other modules independent | Open successive files: same viewer, correct current resource; browser/agent editor remain independent; no unbounded document-window spawning |
| Chats unclear; bad New chat | Private draft without mandatory title, human DM without a project, shared channel/thread, audience change and return; draft/attachment isolation; no naming form in composer or global Agent toggle |
| Account/demo fluff | Actual sign-in/account settings and two independent authenticated sessions; no identity cycling or invented live presence |
| Tabbed Project module rejected | Sources/context, agent and goals independently usable on the right, concurrently visible; no combined Project-tab container used to avoid layout design |
| Graph not actionable or understandable | Pointer and keyboard folder exploration, meaningful node/edge types, viewer/explorer opening, subject-center drag/rebound and full-view return; readable nested/busy graph with permission-filtered activity |
| File viewers superficial | Representative real files, formulas/images/layout, edit/save/reopen/export and collaboration; explicit unsupported cases; source binary and canonical identity preserved |
| Sharing creates copies/leaks | Same original ID after sharing; distinct explicit variant; contributor/revision/ancestry history; private-source chat and unauthorized attachments inaccessible |
| Personal layouts/routine work omitted | Save/restore a personal preset without changing another person’s arrangement or copying shared records; execute an authorized routine without its UI open; retry/reconnect does not create duplicate runs |
| Context burden remains manual | Project initialization, automatic source capture/maintenance, actual retrieval and a fresh agent handoff with source links; failures/retries and uncertainty observable |
| Shared approvals/private preferences | Private autonomy configuration; shared proposed edit; approve/reject; collaborator edits before approval; stale proposal revalidation and retry without duplicated external effects |
| Integration/account ambiguity | Personal and explicitly shared project connections; project agent uses permitted connection; revocation/expiry handling; personal browser session remains private |
| Styling feels generic/low contrast | Reviewed light/dark material/component proof with actual long/empty/busy/error content, accessible focus and readable text; coherent icons and purpose-specific geometry; no claim of acceptance from test counts |

Tests must cover behavior and invariants, including browser interactions and meaningful failure cases. Reuse relevant sharing/formula/parser cases, but replace the old camera/distant-object assumptions. A high assertion count is not an exit criterion by itself.

## 7. Optional action proposals after the core works

These are not approved additions to MVP scope:

- **Ask about this:** attach an exact selection/range/branch to the active conversation through canonical source/revision references. Highest-fit extension to the resource/chat integration.
- **Catch me up:** request a source-linked account of meaningful changes since a personal last-seen point. Builds on event/history/context foundations; not another overview dashboard.
- **What does this affect?:** inspect generated outputs that recorded an older source revision and offer a scoped recheck. Requires real dependency evidence; semantic similarity is insufficient.
- **Open their shared work:** navigate from permitted teammate/agent presence to the same item/selection, without camera takeover, duplicate files or private-activity exposure.

Keep these distinct from already-required automatic orientation, provenance, visible agent knowledge access and canonical sharing. The latter are foundational, not optional innovations. Research sources and constraints for each action are in `Research Review.md`.

## 8. What review of this proposal should settle

The next deliverable after approval is the behavior/material/layout proof in A, accompanied by the narrow feasibility evidence in section 4. Full application implementation follows those results and the user's design review. Do not silently execute a new visual redesign, select a paid runtime, call the MVP complete or present this draft as an approved specification.

# Maturity refinement: research, interaction decisions and implementation plan

October 28, 2026. **Research and planning artifact; not a new accepted design or an implementation report.** Responds to the user's 8:58–8:59 PM screenshots and subsequent instruction to continue. Read alongside `Conversation Context.md`, `Research Review.md` and the current primary-surface results. Later user decisions supersede proposals here.

The current preview has not changed during this cycle. Its source and the supplied screenshots establish the defects below. No new live-browser inspection or visual acceptance is claimed. The existing design-review gate remains: broader application implementation follows review of concrete interaction/material results, not a passing build or another assertion count.

## 1. What this review changes

The previous correction restored the primary canvas and stopped the six-pane layout. It did not establish a mature working product. This round must address the meaning and continuity of actions, not merely restyle the same controls.

**New confirmed direction:** make the graph, rail, icons and right-side modules monochrome; remove the graph's decorative center symbol; improve the composer and focus treatment; replace the inadequate creation menus; substantially mature conversations; provide an agent build/deployment experience rather than presenting personal preferences as agent management. The user has not accepted a particular replacement for these flows.

**Requirements retained:** primary full-canvas Graph/Canvas, blank fresh Canvas, left rail plus floating input, independent content-sized right utilities, bounded non-overlapping work modules, one document viewer, independent browser/agent editing, no application zoom, always-on graph physics, clear private/shared audiences, human DMs without projects, canonical sharing and provenance, automatic context maintenance, default project-agent assignment, permission-aware execution and collaborative approvals. The product stays general purpose and web first.

Monochrome now supersedes the earlier permission to retain blue control accents. It does not mean returning to the rejected flat, low-contrast gray appearance. Preserve light/dark material depth, readable opaque content, deliberate typography and strong neutral contrast. The user specified interface chrome; desaturating actual documents, images or other user content is not implied.

## 2. Evidence and causal audit

| Critique/evidence | Current cause in source | Required change in behavior |
| --- | --- | --- |
| [Nested highlighted textbox](research/references/rejected-composer-focus.png) | `style.css` applies a global blue `:focus-visible` outline directly to the textarea inside the outer composer. `main.tsx` presents a separate audience/status row. | One coherent composition surface. Design pointer focus, keyboard focus, selection, reply context and delivery separately; do not remove all focus indications to hide this defect. |
| [Large Add a tool menu](research/references/rejected-creation-menu.png) | `main.tsx` provides overlapping entry points: plus, ellipsis → Add a tool, keyboard picker and context menu. Arrangement controls are mixed with opening work. | One shared action model with direct verbs and predictable routing. Layout operations are secondary; opening content is not creation. |
| [Tools for the canvas modal](research/references/rejected-tool-picker.png) | Three unrelated choices: Document opens an already selected repository source; Browser opens a disconnected surface; Agent settings opens autonomy radios. | Search/open actual resources, create supported content, and build/configure agents through their own coherent workflows. Remove the generic three-card catalog. |
| Conversations feel immature | A local record/list/thread proof exists, but DM creation accepts an arbitrary name/email string. It has no authoritative participants, delivery acknowledgement, real unread state or search service. | Identity, audience, history, drafts, thread navigation and delivery need explicit contracts. New tabs or avatars alone do not solve them. |
| Agent preferences are inadequate | `components.tsx: AgentSettings` saves two local preference choices. It cannot define, test, deploy, run or revise an agent. | Provide a complete agent lifecycle. Keep autonomy as one part of effective execution policy. |
| Graph center icon is meaningless | `Graph.tsx` embeds a decorative `hub-glyph` SVG; `style.css` gives the hub a blue radial treatment. | Remove the glyph, not replace it with another logo. Use a restrained neutral subject anchor and readable project/folder label; retain spring behavior. |

These are observations about current source and supplied evidence. Prior passing layout scenarios remain useful regressions for bounded placement and continuity; they do not validate these missing workflows or the current visual treatment.

## 3. Research revisited and extended

Primary sources were read on October 28. Source patterns below inform proposals; none selects a framework, provider or copied product layout. This round revisited actual T3 source and composer documentation, rather than claiming another visual inspection of its running app.

| Source | Finding used in this plan | Deliberate boundary |
| --- | --- | --- |
| [T3 composer guide, pinned source](https://github.com/pingdotgg/t3code/blob/e34067edef2eba03c1e40bca7d2b2d933ae12b85/docs/user/composer.md) | Attachments, quoted context and queued work have identities, availability and recoverable failure states. A reference and the text surrounding it remain distinguishable. | Do not copy coding-specific model/worktree controls, numeric limits or every shortcut. Human messaging and project agents need different recipient semantics. |
| [T3 new-thread handler, same commit](https://github.com/pingdotgg/t3code/blob/e34067edef2eba03c1e40bca7d2b2d933ae12b85/apps/web/src/hooks/useHandleNewThread.ts) | Draft creation/reuse protects typed content and checks for navigation and asynchronous races. | New chat is an identified draft transition; it is not a naming textbox added to the composer. No T3 code was imported. |
| [T3 preview shell, same commit](https://github.com/pingdotgg/t3code/blob/e34067edef2eba03c1e40bca7d2b2d933ae12b85/apps/web/src/components/preview/PreviewPanelShell.tsx) | Collapsing a surface handles focus and makes hidden content inert; remembered widths belong to a surface. | Preserve these interaction qualities without copying its universal tab/side-panel geometry or introducing overlapping work windows. |
| [Slack send/read behavior](https://slack.com/help/articles/201457107-Send-and-read-messages) | Channels, DMs and threads are distinct message destinations; drafts and unread navigation persist around them. | Adopt destination and recovery semantics, not Slack's whole shell, engagement model or scheduling feature inventory. |
| [Slack threads](https://slack.com/help/articles/115000769927-Use-threads-to-organize-discussions-) | Replies retain a parent discussion; following a thread and notifying a person are separate from channel participation. | Use parent context and deliberate notification rules. Do not copy pop-out chat windows into this non-overlapping workstation. |
| [Slack Activity](https://slack.com/help/articles/19693583638803-Get-your-work-done-from-the-Activity-view) | A message can be acted on from activity while retaining its conversation identity. | Supports a later quick-reply supplement, not an extra hidden chat or another dashboard on entry. |
| [Dify: Build an Agent](https://docs.dify.ai/en/cloud/use-dify/build/new-agent/build) | Configuration, build assistance, preview and published versions are distinct. Its generated build note retains setup context. | This is evidence for a lifecycle, not a reason to adopt Dify, copy a workflow-node builder or require users to manually package project memory. |
| [LangSmith: Create an agent](https://docs.langchain.com/langsmith/create-an-agent) | Registering an agent record and hosting an executing agent are separate operations; identifiers and display names serve different purposes. | A saved definition/assignment must not be labeled as a deployed or running agent. LangSmith environments and runtime choices are not product requirements. |
| [LangGraph interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts) | Approval can pause durable execution and resume at an identified checkpoint. | An approval is an attributable action record, not a transient confirmation dialog. No runtime is selected. |
| [Conditional modification failures](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/412) | A write based on an obsolete resource revision can be rejected rather than overwrite newer work. | Approval/retry must revalidate the actual target and permissions; a prior approval is not unlimited future authority. |
| [W3C Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html) | Keyboard focus must remain identifiable. Its exact shape/color is not prescribed; Focus Appearance is a separate AAA criterion. | Replacing the blue rectangle does not justify global `outline: none`. Neutral focus can meet the visual direction. |
| [Radix Popover](https://www.radix-ui.com/primitives/docs/components/popover), [WAI modal pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | Anchored/nonmodal interaction and modal interruption differ in focus, dismissal and background availability. | Ordinary work opening should not block the whole canvas. A small transient menu is not a persistent working module and must not accumulate into a second window system. No component dependency is selected. |

Earlier research beyond harnesses remains applicable: [file engines and callbacks](https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler), [authorized collaboration](https://liveblocks.io/docs/api-reference/authentication), [context engineering](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents), [provenance](https://www.w3.org/TR/prov-primer/), [web-first interactive browsing](https://docs.browserless.io/baas/monitor-sessions/embedding-live-url) and [keyboard splitters](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/). Their detailed findings and limits are in `Research Review.md`; they have not become implemented capabilities. Apple's material page exposed only a JavaScript shell and an unavailable Markdown response in this pass; no fresh inspection of that content is claimed.

## 4. Proposed interaction system

### A. Compose and send

Keep the floating composer. Treat the entire surface as one control group: text, optional contextual references/reply information, attachment action and send. Text does not get its own framed box inside it. Use a caret and a restrained neutral container change while typing; keyboard navigation must still make the actual focused control visible. Selection highlighting is neutral and readable in both themes.

Show the destination once, in an intelligible form: the person's name, channel name or private agent chat. A static dot is not evidence of presence. Replying adds a compact parent-message excerpt and an exit action. It must be obvious whether the next message goes to the main discussion or a reply. Never replace an existing main draft when entering a thread.

The composer grows to a bounded multiline height, then scrolls internally. Enter/send behavior must respect IME composition; support an explicit send-shortcut preference rather than an expanding forest of buttons. Drag/paste/file selection use the same attachment pipeline. Each attachment can be inspected, removed or retried. Sending must preserve text when an upload fails or access changes. No zoom, unexplained Agent toggle or new-chat naming form belongs here.

For a real service, sending creates an identified pending message; acknowledgement promotes that same message to sent. Retry reuses its request identity. Failed delivery remains recoverable without duplicate posts. Agent job progress is attached to actual execution, not the send arrow. These states are requirements for the delivery implementation, not claims about today's local messages.

### B. Open work, create content, attach context, arrange views

These are different operations and must stop sharing the label “Add a tool.” Proposed routing:

| Intent | Entry and result | Must not happen |
| --- | --- | --- |
| Open existing work | Graph node, Sources row or a compact work-area **Open…** action → the same permission-filtered resource search/open command. Reuse the single document viewer; remember identity/reading position. | No defaulting to whichever source was accidentally selected; no second document copy/window. |
| Create content | Contextual **New document** or another genuinely supported content type → creates a canonical record in a visible destination and opens it. Minimal metadata can be edited in place. | No fake Sheets/Slides/native Office choices without a working engine/storage contract. No upfront naming paperwork for every chat. |
| Attach to a message | Composer attachment action → file/resource/selection references scoped to this draft. Show recipient access before an explicit share decision where needed. | Attaching does not retarget the conversation, create a work module or silently grant broader access. |
| Build or edit an agent | Agent module action → the agent editing surface for that definition; details below. | Personal autonomy settings must not impersonate an agent builder. |
| Open a browser | Explicit work command → an independent bounded browser surface when its service is available. | No generic iframe presented as authenticated browsing; no personal session exposed to a project. |
| Arrange work | Module header/edge snapping and a secondary arrangement action using the existing bounded allocator. | No arrangement submenu in the primary creation path; no application zoom or module overlap. |

The proposed compact work action surface is anchored to its invoking control, searchable when the set grows, with actual commands and resource results. Keyboard and context-menu entry points call the same commands. Escape/cancel restores focus and changes nothing. Do not replace today's static three-item modal with a larger static catalog. Ordinary commands should execute directly; a second step appears only when it resolves a real choice such as resource or destination.

Rail controls remain navigation. They may reveal conversations, files or a directory; they do not create canvas work. Opening a file is an intentional resource action inside that navigation, not a side effect of selecting the rail icon. New commands must state and honor capacity failure without losing the current arrangement.

### C. Conversations as a dependable part of work

Use the extended left region for conversation navigation/history; retain the main working surface and right utilities. The following is proposed, not user acceptance of exact widths or labels:

- One intelligible conversation list with pinned/recent items and project channels grouped under their project; private chats and human DMs remain distinguishable by actual audience. Avoid another permanent Conversations/Threads/People/Agents tab strip. Search narrows real accessible records. A long directory is virtualized/paged rather than rendered as an enormous list.
- Selecting a conversation restores its transcript position, main/thread state and draft. A thread shows its parent and a clear return to its discussion in the same history region, rather than opening a second working window. Deep links identify the conversation, message and optional thread.
- New private agent chat opens an identified empty draft without a name form. New human DM selects real people, reuses an existing conversation for that participant set where appropriate and does not create a project. Display names are not identity keys. Pending invitations and unavailable contacts must have honest outcomes.
- Transcript hierarchy comes from author, time grouping, date/unread separators, readable line lengths and restrained actions. Avoid a repeated decorative card for every message. Hover actions also have keyboard equivalents. Mentions refer to actual participants; agent outputs retain an identifiable author and linked run when one exists.
- Unread/mention/thread-following state is personal. New messages never open modules, change the recipient, scroll someone away from what they are reading, or rearrange the graph/canvas. Offer a jump to new content. DMs, mentions and followed threads can be prioritized without making every channel noisy.
- Edits/deletions, message search, attachment availability and reconnect need real service states. Do not decorate today's local imported transcript with fake “read,” delivery or online indicators. Exact retention/edit policy is a later service decision, not silently chosen in CSS.

Quick reply remains a supplement: reply from an existing activity/list item while preserving its destination and the main draft. It should be an allocated inline interaction in the left region, not an overlapping chat window or a newly invented conversation. First make normal sending and thread recovery reliable; do not add quick reply just to appear feature-rich.

Proposed record additions: stable conversation/participant IDs and explicit kind/scope, thread-root message ID, per-user read position/subscriptions, per-destination draft plus attachment state, message revision/tombstone state, and idempotent delivery requests with server acknowledgement. `Object and Access Model.md` remains the starting contract. Browser-local state alone cannot establish membership or authorization.

### D. Build, test, deploy and operate agents

The current two-radio preferences page is not an acceptable destination for “Agents.” It can survive as a small policy section inside meaningful agent settings. The replacement needs these distinct concepts:

| Concept | What it means | Observable state |
| --- | --- | --- |
| Definition | Stable identity, owner/scope, purpose and configuration | Editable draft; saved revision; unsaved/conflicting changes |
| Published version | A specific, attributable configuration available for execution | Version ID and change record, separate from newer draft edits |
| Assignment | Responsibility in a project or private space | Assigned/retired/completed; persistent even between runs |
| Deployment/activation | A published version connected to an available runtime in an allowed scope | Preparing/ready/failed, with actual service acknowledgement |
| Job/run | A particular request using a particular version and authorized context | Queued/running/waiting for approval/completed/failed/canceled |

**Project creation still supplies its dedicated agent and context structure automatically.** Building additional agents or customizing that default must not become a prerequisite for ordinary collaboration. If the runtime is not configured, show the assignment and precise unavailable capability; do not claim an orientation file has been generated by an executing agent when it has not.

Proposed editing experience: a purpose-led, independently allocated agent surface, opened from the Agent module. Start with its purpose/instructions, inherited project context, capabilities/connections and effective approval policy. More detailed model/runtime/routine options appear when relevant. Editing another agent uses the same definition editor rather than multiplying windows. This is an agent-specific working surface, not the rejected all-in-one Project tab card.

Natural-language build assistance is useful, but any generated configuration changes must be inspectable as changes to a draft. Keep ordinary agent conversation distinct from configuring the agent. Reusing the floating composer for build assistance requires an explicit destination/mode and restoration of the prior draft; do not silently reinterpret the next message as configuration. Manual editing must remain possible. A drag-node workflow builder is not justified by the knowledge graph.

Inherit context automatically. Show the project as the starting point and additional permitted knowledge as access, not a forced list of uploaded files. Capabilities expose which personal or project-owned connection they use; secrets are not shared by adding members. Private autonomy preferences cannot override a shared resource's approval requirements. Scope/ownership and capability checks are server-enforced.

Test against a bounded task with the chosen draft, visible context, enabled capabilities and actual execution evidence. Tests may need tool access and approvals; they are not automatically harmless. A disconnected runtime cannot return a successful test. Keep test results linked to the tested draft/revision so a later change cannot inherit a stale pass.

Deploy/activate a reviewed version to the intended private/project scope only after runtime/capability readiness. The resulting status comes from the service. Saving a local draft is not deployment. Runs bind to the version they started with; publishing edits must not quietly mutate their instructions. A published configuration history differs from the resource revision history the agent produces.

Agent module summary: responsibility, actual readiness/current work, the relevant pending approval or failure, and meaningful Open/Edit/Run actions when supported. Avoid empty status paragraphs and a second settings dashboard. Detailed execution shows sources/revisions used, tool effects and recoverable failures in the allocated agent surface. Graph activity derives from authorized run events, not random animation.

Approvals display a concrete target/change, requester, proposed action, relevant starting revision and reviewer scope. Resume checks whether access or the target changed. Closing a module is not cancellation. Stopping a run is not retirement; retirement stops new assignment work. Whether existing jobs drain or cancel remains unresolved and must be made explicit before implementing retirement. Routine context maintenance remains automatic within its established authority.

### E. Graph and material refinement

Remove the current roof/M glyph. The subject remains an anchored neutral visual point with its actual name, connected to the real folder structure. Its limited drag and restoring force remain. Focus changes center the selected subject; leaving focus restores full centered orientation. A document/folder action uses the existing inspector/viewer and preserves Graph as the primary surface.

Replace blue structural tokens across graph, rail, icons, utilities and focus/selection chrome with a coherent neutral scale in both themes. Differentiate action, selected, disabled, keyboard focus and actual execution states through contrast, weight, shape and words, not arbitrary colored dots. Keep folder/resource types legible without enclosed icon boxes. Actual content can retain its own color.

Glass belongs to control/navigation chrome, with restrained edges, translucency and depth. Reading bodies need stable contrast. High contrast/reduced-transparency fallbacks and browser zoom must remain usable; the rejection of application zoom does not disable browser accessibility features. Avoid another pile of CSS overrides: define shared surface/text/edge/focus/state tokens and remove superseded blue literals from scoped interface styles. No new palette should accidentally recolor document content.

## 5. Implementation sequence and reviewable exits

This is a proposed sequence inside the existing approved MVP, not approval to select a backend/provider or call disconnected flows finished. Preserve current local records and the rejected layout's legacy data.

| Slice | Scope and likely implementation boundary | Exit evidence required |
| --- | --- | --- |
| 1 — Coherent controls | `style.css`/`workspace.css`: neutral chrome/material/state tokens; composer container/textarea focus and growth; `Graph.tsx`: remove decorative glyph, retain anchor physics. No unrelated layout rewrite. | Same meaningful screen states in light/dark: rest, typing, keyboard traversal, text selection, reply and attachment. Verify narrow view, IME, long input and no hidden focus. Show full Graph and content-sized utilities. Build/test success alone is insufficient. |
| 2 — Action semantics | Extract an action registry and route existing open/attach/arrange operations consistently; replace the modal catalog/cascade in `main.tsx`. Keep only capabilities the proof actually supports. | Open the intended resource, cancel without change, reuse its viewer, handle capacity, restore focus. No rail-driven module spawn; no silent resource selection. Creation actions are shown only when their actual resource contract is implemented. |
| 3 — Conversation continuity | Isolate conversation/navigation/composer state from work placement. Introduce the record/service contracts above; make left history/thread/participant flows reviewable before connecting authoritative identity and delivery. | DM selection, channel/thread/main draft isolation, parent return, reading recovery, attachment failure, retry without duplicate delivery, unread jump and incoming-message non-interference. Local UI proof and real two-account delivery are separate milestones. |
| 4 — Agent lifecycle | Replace the preferences-only destination with a definition editor plus explicit version/assignment/run contracts. Show a concrete draft → test → publish/deploy → run → inspect/revise path. | Design review can use clearly labeled local drafts. Real acceptance requires actual runtime acknowledgement, source-linked test/run evidence, durable approvals and recovery. No placeholder Deploy success or fake live agents. |
| 5 — Integrated context loop | After the design/feasibility gates, connect the authoritative collaboration, storage, job and retrieval foundations already in the MVP plan. Integrate file/browser engines through their real capability contracts. | Two users create a project, receive its default agent/context structure, share one canonical resource, collaborate and receive maintained source-linked context. Verify private material, personal sessions and provenance remain private, including on reconnect and permission revocation. |

Do not collapse slices 3–5 into “add features” on the existing monolith. Separate conversation state, action routing, agent definitions/jobs and placement before wiring services. Preserve current resource identities and storage migration. Server service selection requires a narrow architecture decision backed by the existing file/browser/collaboration feasibility work; it is not determined by an attractive builder screen.

## 6. Quality control that addresses the repeated failures

Before adding a control, record: the user intent, where it lives, what identity it acts on, what state it changes, its success/failure/cancel outcomes and the evidence that will establish it works. If none of those are clear, do not invent a label and handler during coding. Every visible action must correspond to a real available operation or explain the specific unavailable dependency at its point of use.

Review complete journeys rather than isolated buttons:

1. On blank Canvas, start a private chat without metadata paperwork; type and attach context. Visit a channel, a thread and a document, then return. All destinations, text, attachments and reading positions remain correct.
2. On full Graph, open a folder and a document while a conversation is visible. Inspect context and goals. Return to full Graph. No generic tile grid, hidden focus, giant empty utility or duplicate document appears.
3. From Agent, customize the assigned project agent, test a draft, publish/deploy a specific revision and request work. A shared modification waits for the appropriate approval; a stale target requires renewed validation. A failed provider or expired credential never becomes a success badge.
4. Share an existing private artifact deliberately. Its canonical identity/history survives, the recipient gains only the intended access, and private source chat is not exposed. A later explicit private variant has ancestry.
5. Resize the web viewport or open/close navigation/utilities during real work. Work remains readable, bounded, reachable and non-overlapping. Background events do not rearrange it. Return focus and drafts correctly after cancellation or errors.

For each changed journey inspect actual light/dark, narrow/normal, pointer/keyboard, empty/populated/loading/error and reconnect states. Keep screenshots and causal test results adjacent to the critique they address. Existing placement/draft/graph regression tests stay where they reflect current requirements; assertions about rejected labels, blue visuals, generic modal catalogs or tiled layout must not become acceptance gates.

## 7. Second reflection: checking this proposal against the whole product

| Risk found in the first pass | Revision made before handing off this plan |
| --- | --- |
| Cosmetic monochrome could be mistaken for product maturity. | Separate immediate visual/control correction from creation semantics, conversation delivery, agent lifecycle and integrated context acceptance. |
| Agent creation could make users collect and upload project memory again. | Default project-agent assignment and automatic context inheritance are explicit invariants. Additional-agent build/edit is optional configuration, not onboarding paperwork. |
| Copying a messenger could consume the canvas again. | Communication stays in left navigation/history plus the floating composer; the main Graph/Canvas and independent right utilities retain their hierarchy. |
| A universal “tool” abstraction could rebuild the six-box system. | Distinguish navigating, opening canonical resources, creating content, attaching context, editing agents and arranging views. Reuse the single document viewer without forcing other module types into it. |
| A Deploy button could fabricate completion on browser-local state. | Published version, assignment, runtime activation and execution are separate service-backed states. No real acknowledgement means no deployed/running claim. |
| Private preferences could authorize shared effects or leak references. | Evaluate the actual target, participant access and connection ownership at execution/share time; preserve canonical sharing and private provenance. |
| Context maintenance could create runaway inference or lose decisions. | Reuse event coalescing/durable job work from the MVP: combine changes, retain source revisions/uncertainty, expose stale/failed maintenance and retry without repeating effects. Assignment is not continuous inference. |
| A shiny graph could still be semantically useless. | Preserve actual containment/reference/activity meanings and resource actions; remove decorative branding without removing useful type distinctions or physics. |
| New menus could hide engine gaps. | Resource creation/opening must expose actual content capabilities. Native Office editing and authenticated web browsing still require the existing feasibility proofs. |

Optional innovation remains subordinate to these foundations: precise selection-based questions, source-linked catch-up, recorded-dependency impact checks and explicit navigation to permitted teammate work. `Research Review.md` already records these proposals. Do not add another novelty layer before normal opening, chatting, sharing and agent work are reliable.

## 8. Decisions that remain genuinely open

No more generic discovery is needed. Exact approval routing by shared action, in-flight job behavior on retirement, message retention/edit policy and the production runtime/identity/storage/file/browser integrations remain open. Resolve these with concrete implementation scenarios and evidence before their service work; do not ask again whether the app is general purpose, whether private/shared work differs, whether agents need context, or whether the graph is actionable.

The next review should assess the replacement composer/actions and the complete conversation/agent journeys against this plan. The current preview still contains the rejected treatment. This document and the updated handoff prevent another agent from treating it as accepted or replacing missing lifecycle behavior with more disconnected controls.

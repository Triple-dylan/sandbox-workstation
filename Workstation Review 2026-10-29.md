# Workstation review — October 29, 2026

**Subsequent implementation:** the user selected Conversation beside work. [Beside Work Results.md](Beside%20Work%20Results.md) records actual application changes addressing the selected chat/canvas trial, popup placement, crowded native content, recall, action creation and image-save consistency. This report preserves the earlier observed failures at its stated source revision; do not read those historical findings as a claim that no implementation followed. Identity services, working-agent Graph telemetry and the real context loop remain open.

**Outcome:** the next iteration should repair data consistency, visible-work continuity and retrieval before adding more canvas object types or applying another visual skin. Useful native canvas actions now exist, but several cross-surface contracts remain incomplete.

**Follow-up scope correction:** the user then stressed working agents on the graph, profile photos/colored chat names, a broader module/chat audit, no overlapping popups, and useful content that feels native to the canvas, citing Notion. Section 8 records the additional live audit and research. The initial reliability findings remain; they are not a sufficient product-experience plan by themselves.

The user requested another review → research → reflection cycle. This report records that cycle against commit `c98ba8a`, the complete conversation record and current source. **No application source, user preview records, providers or services were changed in this pass.** Browser probes used isolated contexts and were closed afterward. The proposals below are not user-approved implementation details or claims that production collaboration is built.

## 1. What holds up

Keep the blank fresh Canvas, monochrome controls, full primary Graph, anchored graph physics, left conversation history, floating composer and content-sized independent right utilities. Do not restart the rejected dashboard, six-pane layout, endless zoomable desktop, generic Project tabs or decorative graph branding.

The new content types do have distinct practical uses: message pins resolve original messages; images retain actual pixels and captions; the canvas plan and Goals utility use the same goal IDs. Existing draft isolation, one-document reuse, typed agent definitions and honest disconnected-runtime states are useful foundations. None proves visual acceptance or completion of the defining automatic-context/collaboration loop.

## 2. Reproduced findings, ranked by consequence

### P1 — Image replacement can commit pixels without their metadata

**Method:** in an isolated browser, import a 630 × 512 image, then inject a `QuotaExceededError` only for the workstation's localStorage write while replacing it with a 1914 × 1346 image. This models a failed metadata save; it is not a claim that the user's browser actually ran out of storage.

**Observed:** the app reports that changes were not saved, but the replacement pixels remain after reload. The saved filename and dimensions still describe the original image. [Exact measurements](research/reviews/2026-10-29/durability-probe.json).

**Cause:** [image-store.ts](workstation/src/image-store.ts#L14) overwrites the existing Blob key in its IndexedDB transaction before [main.tsx](workstation/src/main.tsx#L475) updates metadata persisted separately in localStorage. Those writes do not form one commit. A failure notice cannot roll back the prior Blob overwrite.

**Required remedy:** preserve immutable asset revisions and atomically publish the new asset pointer with metadata. Keep the resource identity stable; a new binary revision is not a duplicate shared/private resource. On failure, reload must recover the original complete version or the new complete version, never a mixture. Include an export/restore path for local images and metadata before relying on this prototype for irreplaceable work.

### P1 — Opening utilities hides active work and focuses the last-added object

**Method:** create a pin, sourced plan and image, edit a plan title, then open Project tools. Tested at 1440 × 1000 and 1280 × 800.

**Observed:** three visible objects become one enlarged image. All three records survive, but the pin and actively edited plan disappear from the working view. The selected fallback is the most recently inserted object, not the plan being edited. [Before](research/reviews/2026-10-29/canvas-1280-before-tools.png), [after](research/reviews/2026-10-29/canvas-1280-with-tools.png), [settled measurements](research/reviews/2026-10-29/layout-probe.json).

At 900 × 650, conversation history is also hidden. After returning to 1280 × 800 and allowing rendering to settle, all three objects return, but the conversation remains closed. An earlier immediate sample still showed one object during return; the settled measurement corrects that observation. Do not report that objects never recover.

**Cause:** [main.tsx](workstation/src/main.tsx#L284) responds to an invalid arrangement by focusing `s.objects.at(-1)`. The current checks establish record retention/non-intersection; they do not establish that the intended work remains simultaneously visible.

**Required remedy:** model active work explicitly and plan the layout change before committing it. Preserve the active task and source relationships when space permits. When it cannot fit, offer a clear choice to focus, replace a view or keep the requested utility closed. Responsive hiding should be reversible view state, not overwrite the user's intended arrangement. Retain the non-overlap rule; do not solve this with z-index, smaller unreadable modules or global zoom.

### P1 — Closed references cannot be found by their useful content

**Observed:** a closed pin containing a unique keyword after its first 65 characters returns no result in Open work. A closed image also cannot be found by a unique word in its caption. Both records still exist. [Probe](research/reviews/2026-10-29/semantics-probe.json), [no-results capture](research/reviews/2026-10-29/pin-search-no-results.png).

**Cause:** [main.tsx](workstation/src/main.tsx#L1232) builds a pin's search item from truncated display text, and a visual's from title/filename; the search component filters those presentation strings. Caption text and the rest of the source message never reach that query.

**Required remedy:** index the full permitted source text, captions, useful origin metadata and current titles. Truncation belongs to presentation. Search should identify the source and whether it is already open, then focus/reopen the same view. Missing access must not be bypassed through an old search snippet.

### P1 for the core product — Canvas assets still bypass the canonical knowledge model

**Observed/source-confirmed:** one imported visual exists in `s.visuals`, but the graph/resource input is only repository resources plus `s.localResources`. The visual has no canonical resource/private-graph representation or context-retrieval path. The browser showed four project source rows and no private image folder. [Probe](research/reviews/2026-10-29/layout-probe.json), [resource composition](workstation/src/main.tsx#L111).

**Important distinction:** a private image's absence from shared project Sources is correct. The gap is the missing canonical asset/access model and private knowledge path, not a requirement to display every private image in shared context. Pinning/placing something must never grant access.

**Required remedy:** a visual should be a versioned private resource with one identity and one backing asset; canvas placement, graph projection, search and later agent retrieval should reference it. Pins remain views onto messages, not new copies of message bodies. Add actual space/owner/access contracts before connecting an agent to these records. The current local UI checks are not authorization.

### P2 — One source is incorrectly limited to one plan step

**Observed:** after creating a sourced step and changing its title into a distinct action, Add to plan still returns the same one step. Goal count stays four, with one link to the source. [Probe](research/reviews/2026-10-29/semantics-probe.json).

**Cause:** [main.tsx](workstation/src/main.tsx#L459) deduplicates by conversation/message ID. Preventing a repeated click was reasonable; imposing one goal per source was an unconfirmed product restriction. One discussion can justify several actions.

**Required remedy:** prevent accidental duplicate submissions using the action/request identity, while supporting an explicit additional step from the same source. Let the user write the actual next action inline instead of treating a 160-character message excerpt as a useful task title. Keep each step's identity and source link separate. Do not automatically rewrite existing goals when the source changes.

### P2 — Close is available; content lifecycle and recovery are incomplete

The exercised canvas has Close controls but no explicit unpin/forget-reference, remove-step/undo or image/canvas export flow. Keeping content after Close is intentional and useful. It becomes incomplete when users cannot distinguish closing a view, removing it from a saved arrangement, forgetting a reference and deleting a source.

**Required remedy:** define those operations and their scopes, with narrowly scoped undo/recovery. Removing a pin must not delete a conversation. Removing a plan step must not cancel unrelated work. Deleting a source must account for references and applicable permissions. Native text undo and canvas placement undo must not accidentally roll back each other's data.

### P2 — A single geometry snapshot is not a saved working context

The current preset is one array of `id/x/y/width/height`. It does not capture the selected document identity, utility state or named/per-project arrangements. [Measured shape](research/reviews/2026-10-29/layout-probe.json), [save handler](workstation/src/main.tsx#L691). The existing label “Save arrangement” is accurate for this limited behavior; it is not proof of the richer presets already requested.

**Required remedy:** named personal arrangements should reference the intended resources/views and restore their readable layout. Shared source records remain unchanged. Names belong in navigation/selection, not a new canvas title or hero. Preserve the current message recipient by default; an explicit conversation-restore action can be designed separately. Do not use a saved view as an access boundary.

### P2 — Positioning lacks an equivalent click/tap path

Source review found drag gestures and header/resize arrow keys, but no non-drag single-pointer operation for equivalent placement/resizing. Keyboard support alone does not cover this interaction requirement. This is a focused accessibility design finding, not a full WCAG conformance audit.

**Required remedy:** provide concise contextual placement/size actions that use the same allocator and preview as dragging. No permanent coordinate dashboard or return to the generic View menu. Keep keyboard movement too.

## 3. Research: what changes the recommendation

Primary documentation was checked on October 29. These are pattern findings and design inferences, not adopted products, code, providers or permission policies.

| Source | Useful evidence | Application and boundary |
| --- | --- | --- |
| [Heptabase fundamental elements](https://wiki.heptabase.com/fundamental-elements) | A card belongs to a common library and can appear on several whiteboards; placement is separate from content. | Strengthens the canonical-resource/view distinction. Do not copy its unlimited desktop, extra tool rail or treat every object as an identical card. |
| [Heptabase collaboration and permissions](https://support.heptabase.com/en/articles/10510497-collaboration-and-permissions) | Shared content and private chats have distinct access; a shared location is not an entire private space. | Access needs an actual policy/identity model. Do not adopt its multi-location inheritance as this project's approved rule. |
| [Notion synced blocks](https://www.notion.com/en-gb/help/synced-blocks) | Reused content retains an original; displaying it elsewhere does not bypass source access. | A source link, a live view and a distinct variant need different semantics. Do not import Notion's block system or duplication-based sharing. |
| [Vivaldi saved sessions](https://help.vivaldi.com/desktop/tabs/session-management/), [workspaces](https://help.vivaldi.com/desktop/tabs/workspaces/) | People can save/reopen named sets of related work rather than retain everything in one visible area. | Supports personal saved arrangements over canonical objects. Do not copy browser tab chrome, automatic URL-based moving or make named views create extra projects. |
| [MDN browser storage/eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [IndexedDB usage](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB) | Browser storage is generally best-effort; persistence requests and transaction boundaries have specific limits. | Local autosave is not a portable backup. Use atomic local records/assets, truthful state and export/restore. A persistence grant would not replace backup or multi-user storage. No actual eviction was induced in this review. |
| [W3C dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) | Equivalent non-drag single-pointer operation is distinct from keyboard accessibility. | Add click/tap placement using existing geometry rules, rather than claiming arrow keys fully solve accessibility. |
| [W3C provenance primer](https://www.w3.org/TR/prov-primer/) | Entity, revision, derivation, activity and responsibility describe different parts of origin. | Store source revisions and derivations explicitly. A URL/ID alone is not a complete audit trail. This does not imply an RDF store or automatic invalidation of every derived goal. |
| [MCP resources, current version](https://modelcontextprotocol.io/specification/2026-07-28/server/resources) | Resources have stable URIs and typed contents; availability can vary with request authorization, and update notifications are optional capabilities. | A common authorized catalog can feed several surfaces and a future context adapter. MCP alone does not implement access enforcement, indexing, context maintenance or an executing agent. No specific protocol implementation is selected. |

The VS Code custom-layout page timed out in this cycle; no new claim is based on that page. Its older inspection remains in the historical research. Other search hits and marketing imagery were not treated as proof of functioning behavior.

## 4. Proposed next sequence, with reviewable exits

| Order | Work | Required exit evidence |
| --- | --- | --- |
| 1 — Consistent, recoverable local content | Repair asset replacement/metadata commits; retain revision pointers and prior content; add portable image+metadata export/restore and scoped recovery operations. | Inject failures before/after each write boundary. Reload gets a complete old/new version with matching pixels/metadata. Export restores into an empty isolated origin with stable IDs and images, not just JSON placeholders. |
| 2 — Preserve the active task | Make layout changes intent-aware; distinguish desired view state from temporary responsive suppression; provide equivalent click placement. Keep normal-work coexistence and explicit capacity choices. | At 1280 and 1440, editing the plan then opening utilities does not select an unrelated image. If all requested work cannot remain readable, the user chooses the outcome. Shrink/return restores intended navigation/views without overlap or offscreen content. |
| 3 — Recall and reusable arrangements | Search full permitted content/captions/origins; add named personal arrangements and explicit close/remove/reopen semantics. | Find a closed pin by a word after character 65 and an image by its caption. Switch two named arrangements without duplicating resources, losing drafts or changing message recipients. Missing access cannot leak via search or a saved view. |
| 4 — Correct evidence-to-action behavior | Allow intentional multiple steps from one source, preserve source revision/derivation, support editable step creation and scoped undo. | Two distinct actions can cite one message; double-submit creates only one action. Source edits are inspectable while the user's independently written step stays intact. Undo affects the requested action only. |
| 5 — Prove the defining context loop | Connect a common authorized resource/revision catalog to the relevant private/shared graph, search and actual agent context service. Resolve identity/storage/runtime choices through a narrow technical decision and feasibility proof. | Import a private asset, deliberately share that same identity into a real project, maintain cited project orientation automatically, and let a fresh permitted agent orient from it. Verify another user/agent cannot retrieve private sources or source conversations. Require real persistent records, runtime acknowledgement and execution evidence. |

Orders 1–4 can improve the current local proof without pretending it is multiplayer. Order 5 is not satisfied by another builder page or a template-generated Markdown file. The approved design/feasibility gates remain; provider, cost, document/browser engines and production deployment are not selected here. Do not let another sequence of cosmetic iterations indefinitely substitute for the core service proof.

## 5. Proposed contract correction

Extend the existing `Object and Access Model.md`; do not replace canonical identity with a board-specific database:

- **Source record:** stable resource/message/goal identity, actual owner/space/access, revision and content reference. An image's binary revision pointer and descriptive metadata commit together.
- **Personal placement:** view ID, source reference, optional selection locator, arrangement ID and geometry. It grants no access and does not own a second copy of the source.
- **Source use:** target goal/output, referenced source ID/revision, locator when applicable, author/action/time and uncertainty where relevant. Permit several uses of one source.
- **Derived context:** a recoverable projection of authorized source records/events, with provenance and freshness/job state. It does not take canvas position as truth or treat visible private work as automatically shared.

The graph, canvas, search and agent retrieval should resolve the same source identities through authorized adapters. This does not require every pin to become a graph node or every file to be expanded. A common resource catalog and separate personal views reduce both broken links and repeated user context packaging.

## 6. Reflection against the full feedback history

| Potential wrong turn | Correction retained in this proposal |
| --- | --- |
| Add more cards because the user asked for more canvas use. | Improve the complete evidence → action → retrieval loop and active-work continuity first. More types are not evidence of more usefulness. |
| Recover stored objects and call coexistence solved. | Record preservation and visible task continuity are separate acceptance criteria. The reproduced utility-opening behavior fails the latter. |
| Put private images into shared Sources to make the graph look connected. | Fix canonical identity/private context first. Placement is never a sharing operation. |
| Copy a whiteboard product's unlimited canvas or tabs. | Retain bounded snapping, full primary Graph, blank entry and independent utilities; adopt identity/reuse patterns only. |
| Restore a saved view and silently retarget a message. | Preserve recipient/draft separation. Named arrangements do not authorize a new audience. |
| Make users hand-select every reference to give an agent memory. | Automatic orientation/context maintenance remains the core. Explicit selection is optional task focus, not required context paperwork or an absolute retrieval boundary. |
| Turn pinning into a formal decision. | Pinning keeps evidence visible. A user-created step is an explicit action; uncertainty and source history remain inspectable. |
| Replace image pixels in place and call one stable ID sufficient provenance. | Resource identity stays stable while binary revisions and metadata change atomically and remain recoverable. |
| Undo an entire conversation/project to remove one mistaken step. | Scope recovery to the operation; keep text undo, placement undo and shared revisions distinct. |
| Keep exposing disconnected controls and call agents complete. | Require an actual permitted context/job result and fresh-agent orientation proof. Routine maintenance stays automatic; consequential shared edits follow shared approval rules. |
| Treat old test counts as acceptance. | Add adversarial compound journeys, visible-state assertions and write-failure probes. Prior assertions remain historical evidence only. |

## 7. Boundaries and next review

This was a review/research/reflection cycle, not an app rebuild or a full accessibility/security audit. No real-user collaboration, provider execution or browser eviction was tested. The storage fault is deliberate injection in an isolated context; the layout/search/planning findings use normal local UI flows. One probe initially assumed the conversation rail button always opens its list; its navigation was corrected and the successful measurements are preserved separately.

The next implementation review should demonstrate the consistency and continuity repairs on these exact journeys, then assess the smallest real context-service proof. There is no need to repeat discovery about general-purpose scope, canonical sharing, private versus shared work, graph actionability, always-on physics or agents' wider permitted context. Those are settled.

Evidence index: [`research/reviews/2026-10-29/README.md`](research/reviews/2026-10-29/README.md). The current preview is intentionally unchanged by this cycle.

## 8. Follow-up: modules, chat identity, working agents and canvas purpose

The user says the current canvas feels pointless and modules do not feel like they live on it. Treat this as experience feedback requiring design revision, not a claim rebutted by the presence of pins/images or successful geometry tests. They explicitly require other users' profile pictures and colored names in chat, and prohibit overlap for popups as well as modules. Participant identity is a deliberate color exception; the graph, rail, utility controls and icons retain their monochrome direction. Their renewed Notion reference supersedes the earlier instruction to hold that comparison, without approving a Notion clone or database suite.

### Additional observed failures

Isolated browser contexts reviewed the current application at 1440 × 900 and 1280 × 900; a separate responsive check used 900 × 900. No app source or user preview state was changed. The application source still matches `c98ba8a`; the preceding review/handoff commit is `d55f427`. [Measurements and reproducible popup probe](research/reviews/2026-10-29/experience-audit/probe.json), [probe source](research/reviews/2026-10-29/experience-audit/probe.mjs), [inspection/identity measurements](research/reviews/2026-10-29/experience-audit/inspection-and-identity.json).

1. **Popup exclusion is a real failure.** With Project plan deliberately focused, Open work covers 183,225 square CSS pixels of the plan at both desktop widths. The attachment picker covers another 39,150 square pixels of it and part of the composer. Account/appearance covers conversation history. These are intersecting interactive surfaces, not shadows or overlapping stored object records. [Open work over the plan](research/reviews/2026-10-29/experience-audit/open-work-over-plan-1280.png). The canvas `blockers` include work objects and utilities, while these absolute-positioned controls bypass that allocator. The earlier distinction that transient search may overlap is now superseded by the user's explicit correction.
2. **Reading a source removes collaboration utilities.** Opening Research review from Sources changes three right utilities to zero; the inspector takes their place. Closing it restores all three. This is source/UI-confirmed temporary displacement, not record deletion. The current single `inspector ? ... : utilities` branch forces an unnecessarily broad replacement policy instead of considering available space and the user's active task.
3. **Chat has no participant identity model.** The recorded transcript shows three initial badges and zero profile images; names are neutral text. `Message.author` is a string, with no actor ID/profile reference. These records are actual interview excerpts, not evidence of three live users. At 900 pixels wide, all three badges are hidden with `display: none`. A photo/color patch alone would still leave participant access, real DMs, unread state and delivery unresolved.
4. **The graph cannot display working agents.** Its node kinds are only project/folder/document, and its inputs contain no assignments, jobs or activity. The browser shows only the root and collapsed folders. The absence of activity DOM markers alone is not proof; the missing data path in `Graph.tsx` is decisive. A local agent editor and right-side definition card cannot satisfy on-graph activity.

The first popup probe used a visible-text selector despite the button's distinct accessible name; it timed out before that portion of the audit. The corrected probe is retained and ran without page errors. Do not treat the selector mistake as an application failure. Screenshots are generated after intentional actions, not proposed defaults.

### Module-by-module audit

| Surface | What currently works | Experience/function gap and next contract |
| --- | --- | --- |
| Conversation navigation | Private/channel distinctions, list search, separate drafts | No actual participant directory, recipient identity, membership or unread model. Preserve left navigation; don't turn selecting a channel into window creation. |
| Chat history and threads | Local search, source pins, parent/reply navigation and reading positions | Identity uses strings/initials; no photos/colors or message grouping by stable actor. Audit density, long messages, attachments, thread context and focus with realistic discussion. Do not call delivery/unread notifications implemented. |
| Composer and attachments | Separate audience/drafts, explicit source attachment, local send | The attachment picker covers the plan and input region. Its disclosure must receive space and retain keyboard/touch operation. Audience remains explicit when other work opens. |
| Sources/context utility | Lists actual repository sources, deliberate inspection | An inventory alone gives little sense of relevant/current context. Keep source provenance and freshness inspectable; opening a source must not automatically dismiss unrelated utilities. Private assets need the separate canonical/private path already identified. |
| Agent utility | Honestly shows a local definition and unavailable runtime | Needs a real assignment/job summary and access to pending approvals/results. A long settings form is not an activity module. |
| Agent editor | Drafts, immutable local configuration versions, export | Build/test/deploy/run remain separate unfinished capabilities. Required configuration must not be mistaken for an agent actually doing work. |
| Goals utility and canvas plan | Same goal identities, order, title/date/completion edits | Owner is free text and agent assignment is absent. Pin-to-step is over-restricted. Compact monitoring and direct planning should share records while providing different useful actions. |
| Document viewer/editor | Read-only Markdown sources; private text records and download | Private editing is a title input plus textarea, not a structured native editor. The generic document window has more application chrome than on-canvas composition. One viewer remains required; native Office integration remains unbuilt. |
| Message pin | Resolves the original source, explicit source navigation | Keep attribution and thread context, compact source-specific actions, selection/revision semantics and close/unpin distinction. Don't present it as a detached editable note. |
| Visual reference | Actual images, captions and replacement | Keep image-led sizing, editable captions and attribution. Fix atomic revision storage, lifecycle and recall; do not bury the evidence inside repeated window chrome. |
| Browser/connector | Honest unavailable-service diagnostic | A resizable diagnostic is not a useful browser canvas module. A working integration needs real session/input/reconnect/scope behavior; do not populate canvases with disconnected tools to imply usefulness. |
| Graph | Full primary surface, nested source folders, anchored physics | Add permitted real job/resource activity and inspectable agent identity/status without reshaping knowledge. Preserve subject centering and local folder exploration. |
| Canvas arrangement and controls | Bounded placement, snapping and non-intersecting work objects | Popups and inspection compete through separate placement systems. Native content and full tools share identical window frames; relationships and task continuity are weak. A common spatial policy must cover all interactive surfaces. |

These are source/flow findings and design judgments. No full content-engine, security, accessibility or live collaboration audit is claimed.

### What to learn from Notion, specifically

Primary documentation was inspected; this is not a claim of hands-on evaluation inside a signed-in Notion workspace.

| Reference | Useful pattern | Application here |
| --- | --- | --- |
| [Writing/editing basics](https://www.notion.com/help/writing-and-editing-basics) | Different content types can be edited directly, with contextual insertion and manipulation controls. | Let short canvas content be edited in place with appropriate affordances. Avoid wrapping every excerpt, image and step in a miniature application. Do not copy the entire block schema or its duplicate action. |
| [Columns and page formatting](https://www.notion.com/help/columns-headings-and-dividers) | Placement guides and shared edges make rearrangement understandable. | Show the actual committed snap result and maintain readable neighboring content. This supports bounded composition; it does not require unlimited columns, page titles or a vertically scrolling replacement for the whole canvas. |
| [Collaboration](https://www.notion.com/help/collaborate-with-people) | Profile photos associate people with where work is happening. | Use real actor profiles across chat and permitted activity. A photo is identity; it does not by itself prove online presence. |
| [Comments and mentions](https://www.notion.com/en-gb/help/comments-mentions-and-reminders) | Discussion can point to exact content and preserve its origin; comments have a lifecycle. | Keep general conversations separate from content-specific replies, with explicit source navigation and scoped resolve/reopen behavior. Mentions do not grant access. Do not copy overlapping comment panes or add notification counters without real events. |
| [Synced blocks](https://www.notion.com/help/synced-blocks) | Reused content retains source identity/access. | One source may have multiple views. A personal placement must not become another private/shared copy or grant access. |
| [Yjs awareness/presence](https://docs.yjs.dev/getting-started/adding-awareness) | Transient presence is separate from persisted content and clears on disconnect. | Separate human presence, durable agent jobs and expiring live activity. This informs the contract; it does not select Yjs as the runtime or backend. |
| [W3C text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) | Normal text needs adequate contrast; meaning cannot depend on color alone. | Use a stable actor-based color choice that meets 4.5:1 for normal name text in both themes, plus readable names and photos/fallbacks. Colors may repeat in large populations and must not be identifiers or role/permission evidence. |

Two additional Notion URLs for custom-page/database views could not be opened; no finding relies on them. No competitor code, icon set, profile photos or paid service was imported.

### Revised experience requirements and proposed implementation slices

**Confirmed:** working agents must be visible from Graph; chat needs profile photos and colored names; modules and popups must not overlap; chat and canvas usefulness need substantial work. **Proposed mechanisms:** the contracts and sequence below, subject to the existing design-review gate. This is not authorization to fabricate live activity or change the whole shell again.

1. **One spatial contract for work and temporary interactions.** Repair the already reproduced save failure and capacity fallback. Register each inspector, work module and temporary interactive disclosure with a common allocation policy. Prefer concise inline expansion within its owning area or genuinely available space; when that cannot fit, present an explicit replacement/focus choice. Never cover unrelated work, silently hide the active plan, shrink text below readable limits or use zoom. A temporary operation must restore the preceding view/draft/focus. Browser-owned file/date dialogs need their own feasibility check; this audit does not claim control over OS UI.
2. **Chat as a collaboration surface.** Introduce stable participant/agent IDs and profile references; render actual profile photos when available, a deliberate fallback when absent, and colored names consistently in messages, search, replies and source pins. Do not invent people/photos for recorded interview excerpts. Keep identity visible responsively. Refine message grouping, timestamp legibility, thread return, selected destination, attachment preview and long-discussion navigation. Add real contact/membership/delivery/unread semantics with the identity service, not fake badges.
3. **Content that belongs on the canvas.** Distinguish direct content (excerpt, image/caption, editable plan) from full tool modules (document engine, browser, agent editor). Use content-specific hierarchy and contextual manipulation, while retaining clear boundaries, snap affordances and keyboard/click alternatives. Support a deliberate evidence → draft → sourced action workflow on the same bounded surface. Links should identify the source/selection/revision; they must not force new windows or force every reference into a graph node. Keep a fresh canvas blank. More palettes, template cards and decorative grid changes do not satisfy this slice.
4. **Working-agent graph integration is part of the core proof.** Feed actual assignment/job/resource activity through the authorized resource model. A proposed event records job/agent identity, operation, permitted target resource/domain, status and freshness/sequence. Attach restrained activity indicators to relevant resources or collapsed domains; inspect several agents without exploding the graph into one node per event. Distinguish assigned/idle, queued, running, awaiting approval, failed and completed; no pulse or “working” label from a saved definition. Selecting activity opens allocated details with result/source/approval links and preserves Graph. Reconnect, expiration, out-of-order events, private-job exclusion and stop permissions must be tested. Transport heartbeats are not chain-of-thought or proof that a model is reasoning.

Do not defer all visible collaboration work behind a long series of local polish features. The first integrated review should show a real participant discussion with identity, useful evidence/drafting/planning on Canvas, an actual permitted agent job visible from Graph, and an inspectable result, with no overlap or audience changes. Until the identity/runtime services exist, interaction specimens may be explicitly labeled fixtures; they do not count as this real end-to-end proof. No provider/cost/stack choice is made here.

### Required evidence for the next review

- At both measured desktop widths, repeat the focused-plan search/attachment/account journeys with no intersecting interactive surfaces. Also exercise combined temporary controls, not just one menu at a time.
- Read a source while keeping relevant agent/goals context available, or show an explicit capacity decision before replacement. Restore the original arrangement without changing recipient/draft.
- Show distinct real profiles and readable name colors in light/dark, narrow chat, thread, search and pin views; test duplicate display names, missing/broken photo, agent versus human and long names. Existing interview records retain their honest attribution.
- Demonstrate authoring and revision through native canvas content, not only spawning a window or screenshotting it. Close/reopen preserves source identity, useful work and provenance. Exercise the failure cases from sections 2 and 4 too.
- Show a real job progress through Graph, inspect its permitted target and result, then reconnect/stop/fail it. Another user cannot see private activity or infer its hidden target through aggregate labels or counts. Activity must not continuously rearrange the graph.

The implementation still fails the experience bar. This expanded audit changes the next work specification; it does not declare the current preview accepted or any of these repairs implemented.

## 9. Review after the beside-work implementation

October 29, source revision `979a882`. The user supplied conversation-list and opened-conversation screenshots, rejected dragging/snapping quality, required work modules on Graph to look different from fixed right utilities, and explicitly prohibited scrolling those right utilities. They said the conversation text remains in a canvas-colored rail. They requested a thoughtful review, rather than another immediate coding pass. No application source changed during this review.

### Finding: navigation, work and utilities still lack distinct contracts

The screenshots' conversation is still inside `.left-extension`, the navigation container. The implementation moved its composer and stripped its background/radius; it did not make the conversation part of workspace placement. Selecting a conversation changes that container from a 260px rounded glass navigation panel to a 360px transparent square region. The live probe measures a **104px canvas shift**. Both states retain the same shadow despite different shape/material rules. That explains the conflicting visual language and why the opened text feels like a disguised sidebar.

The approved beside-work direction remains valid. The next proposed correction is to keep the rail/navigation list responsible for selection, and render one retained conversation work surface in the workspace allocation beside other work. Its transcript, thread state and composer are one unit, with real placement/resize semantics and a clear work-surface boundary. Selecting another channel or DM reuses that surface; it must not manufacture more windows or change another conversation's draft. Navigation should not masquerade as content by changing background color. Exact placement behavior beyond the approved beside arrangement remains a design proposal, not a newly confirmed user instruction.

### Finding: dragging currently moves an outline, not the work

A real pointer probe moved 70px horizontally and 50px vertically. The writing object remained at `(463,25)` throughout the held gesture while its destination outline moved to `(527,73)`. Only release moved the object there. A separate outline can communicate a dock destination, but this implementation uses it as the sole motion feedback for ordinary dragging.

The **visible grid is 24px**, while `snapped`, keyboard movement and placement use **16px**. Initial object positions can therefore miss the displayed dots. `pairSnap` also changes both objects' dimensions within a broad 42px edge vicinity, selecting the first qualifying target; the same movement conflates moving, aligning and splitting. The absence of pointer capture in this work-object path is a robustness gap to test, not proof that a lost-pointer failure was reproduced. The working implementation does have cancellation/listener cleanup.

Proposed correction: one shared geometry definition for rendering, placement and keyboard movement; continuous content feedback within valid free space; clear collision feedback at the last valid position; and narrow, stable alignment guides. A separately indicated shared-edge drop may resize neighbors, with their exact resulting geometry previewed before commit. Nearness alone should not cause surprise size changes. Preserve non-overlap throughout the gesture, Escape/cancel and readable minimums. Tune acquisition/release distances with real pointer/touch trials rather than adopting another arbitrary constant.

### Finding: fixed utilities have two independently scrolling layers

Both `.utility-stack` and `.utility-card-body` have `overflow: auto`; bodies are capped at 300px and the stack at available height. In an isolated 60-goal stress fixture, the Goals body has 1,897px content inside a 300px viewport. A normal wheel gesture changes its scrollTop from 0 to 220, while the stack also changes from 0 to 23.5. This violates the new requirement and creates ambiguous nested scrolling. The fixture tests scale; it is not an assertion about the contents of the user's screenshots.

The confirmed correction applies to **both fixed utility bodies and their stack**: neither may scroll. The proposed design is a bounded summary for each utility, prioritized to available space, with explicit access to a complete work view for longer sources, goals or activity. Do not hide a scrollbar, clip unreachable records or compress text to satisfy the rule. On small heights, use a deliberate compact/collapsed utility presentation while keeping the available utilities identifiable. Complete document/conversation/browser work content needs its own content behavior; do not silently ban all content scrolling throughout the harness from this right-utility instruction.

### Finding: work tools and fixed utilities share nearly identical window styling

The live inspector and Project agent utility both use 14px corners, the same shadow and similar neutral white/glass surfaces. Canvas full tools use the same rounded, bordered, shadowed vocabulary; native writing/pins received more differentiation, but the broader work-tool hierarchy did not. A small transparent exception for some content does not establish a coherent system.

Proposed hierarchy: the rail/list is navigation; movable/snapped work surfaces have content-led dimensions, clear manipulation edges and readable work material; fixed right utilities are compact, stationary context instruments with shallow glass and bounded summaries. Graph remains the full primary surface. Its opened work inspectors must communicate their role clearly and preserve the graph, rather than visually impersonating another fixed utility. Use consistent typography/spacing/focus language across these roles, with deliberate differences in structure and material. No hero, top menu, decorative logo, zoom or default dashboard is added.

### Review evidence and next acceptance bar

[Measurements, retained probe source and review captures](research/reviews/2026-10-29/interaction-review/README.md) accompany the supplied screenshots. The browser probe completed without page errors and did not touch user preview storage. Source fixes are not claimed. The preceding 42 passing scenarios prove their recorded behavior, not natural dragging, correct grid semantics, zero utility scroll or appropriate visual hierarchy.

Next proof must show: real content tracking valid movement; exact grid/guide agreement; no accidental resize or overlap; non-scrolling utilities with complete-record access; and rail navigation selecting a retained conversation work surface with its composer attached. Validate list → chat → thread → source → work → graph, keeping identity, draft and work state intact, at ordinary and constrained desktop sizes. Treat these as coupled acceptance journeys rather than independent screenshot checks.

Relevant primary references: [MDN pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture) explains retaining a pointer target across boundaries; [Notion placement guidance](https://www.notion.com/help/columns-headings-and-dividers) illustrates explicit drop guides and shared-edge resizing. These support engineering/design proposals; neither overrides this product's no-overlap, bounded-workspace or no-scroll utility requirements.

### Confirmed follow-up: click the canvas to write

The user explicitly rejects Write on canvas spawning a text box. The required primary interaction is **click an empty canvas location → place a caret there → type directly on the surface**. The present button-created editor view misses that model even though its resource persistence works. This is a correction to the canvas primitive, not a request for another editor-module skin. Keep canonical source identity and privacy beneath the direct interaction. Proposals for empty-focus cleanup, content-aware wrapping and clear editing/selection/manipulation states should support it without visible blank boxes or unexpected interception of existing content and Graph actions. No implementation change accompanied this clarification.

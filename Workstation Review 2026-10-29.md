# Workstation review — October 29, 2026

**Outcome:** the next iteration should repair data consistency, visible-work continuity and retrieval before adding more canvas object types or applying another visual skin. Useful native canvas actions now exist, but several cross-surface contracts remain incomplete.

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

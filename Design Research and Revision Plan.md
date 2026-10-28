# Production references and revision plan

October 28, 2026. This is a new revision of the rejected interaction prototype, not an assertion that previous visuals were accepted.

## Reference research

| Primary reference | Established behavior | Application here |
| --- | --- | --- |
| [Codex product interface](https://openai.com/codex/) — official task/review and sidebar screenshots visually inspected | Restrained typography, clear hierarchy, content-specific work surfaces | One consistent SVG icon system; labels name actual destinations/actions; no ornamental Unicode glyphs or repeated status prose. Do not copy marketing backgrounds or its entire layout. |
| [Slack channel tabs](https://slack.com/help/articles/32562841868307-Add-and-manage-tabs-in-channels-and-direct-messages) | Channels organize messages and associated work using progressive, local navigation | Rail stays focused on project/channel navigation. Project coordination and knowledge belong in an on-canvas module, not a second context tree in the rail. |
| [Linear members and roles](https://linear.app/docs/members-roles) | Membership management supports role/status filtering and historical identity | People and agent directories need search, role/status filtering, bounded rows, and pagination. A sentence like “4 members · 1 agent” is not a scalable navigation design. |
| [FLORA canvas](https://docs.flora.ai/editor/canvas), [FAUNA](https://docs.flora.ai/editor/fauna) | Typed content nodes share one navigable spatial workspace; selection can scope agent context | Content type should determine the surface, not an identical generic card. Keep the user's floating composer and prohibit the source product's right drawers. |
| [tldraw camera](https://tldraw.dev/sdk-features/camera) | Camera handles coordinates, user input, fit-to-content and focus; user interaction takes precedence | Preserve the tested spatial layer. Extend focus/fit calculations to actual typed-viewer dimensions; no screen-edge walls. |
| [ONLYOFFICE configuration](https://api.onlyoffice.com/docs/docs-api/usage-api/config), [editor configuration](https://api.onlyoffice.com/docs/docs-api/usage-api/advanced-parameters) | Production Office integration distinguishes word/cell/slide/pdf and defines editor modes, permissions, callbacks, and embedding | Distinct document, spreadsheet and deck surfaces are required. A textarea is not an Office viewer. Local format previews must be labeled as previews; a production co-editing engine remains a separate integration. |

The sources inform behavior and hierarchy. The decisions below are product-specific inferences, not claims that these products use this exact design.

## Decisions for this iteration

1. **Navigation:** private/shared scopes and channel nesting remain. Remove people/agent summary sentences and Project context from the rail. Project rows show names only. Move goals, knowledge, people, and agents into one on-canvas Project module, with local tabs. The composer plus opens it.
2. **Scale:** Project → People is a searchable, filtered, paginated directory; Project → Agents is a separate directory with execution state. Test at 250 people and 40 agents without expanding the rail or growing the module. Do not invent online presence.
3. **Icons and geometry:** replace Unicode symbols with a coherent, accessible 24-unit SVG family. Use open line icons only where they improve scanning. Remove rounded tiles, segmented pills, boxed glyphs, and repetitive Shared badges. Work surfaces use nearly square edges and fine separators; the composer remains a distinct floating input.
4. **Windows versus modules:** the canvas is the spatial environment. A document/sheet/deck is a content surface with minimal hover/focus chrome, not a dashboard card. Project coordination is a module with internal navigation. Opening history/sharing changes that same surface. No new pop-up/drawer pattern is introduced.
5. **Documents:** use a real reading page with paragraph/table structure, text selection, local text editing, and document-specific layout. Source filename and preview limits are explicit for imported Office content.
6. **Spreadsheets:** render worksheet cells, column/row headers, a name box, a formula bar, and sheet tabs. Selection, keyboard navigation, local cell edits and supported formula recalculation operate on the model. Never present a screenshot as an editable workbook.
7. **Presentations:** render a slide at its native aspect ratio with a thumbnail strip, slide navigation, and notes. Preserve parsed text/image geometry for supported imports. This is distinct from an arbitrary window containing paragraphs.
8. **Graph:** replace every bordered icon tile. Projects are quiet hubs with spatial halos; folders are small constellation markers; files use actual miniature content silhouettes. Edges attach to the spatial anchor. Use semantic zoom and local labels to prevent everything being visible at once. Physics remains on; selection expands the same node in place.
9. **Actual files:** add a local, same-origin import path for DOCX/XLSX/PPTX and text/CSV. Bound ZIP/XML work, keep processing local, and disclose unsupported complex layouts, charts, animation, and Office round-trip editing. Full-fidelity co-editing requires an established engine and is not claimed by this iteration.

## First execution pass

Implement the above while retaining the passing spatial and canonical-sharing behavior. Test typed-viewer controls, real sample-file imports, scaled directories, graph-local inspection, channels/threads, sharing, and the absence of context management in the rail.

## Required second review

After the first pass, review **all earlier feedback**, then this latest feedback, against the running result. Check blank entry, no titles/branding/hero/header, composer reference, private/shared clarity, channel/thread organization, no pop-up spawning, world coordinates/snapping/recovery, always-on physics, graph-local review, scalable directories, restrained icons, nearly square content surfaces, and distinct document/sheet/deck viewers. Record remaining limits and iterate on observed defects before handoff. Do not mark user acceptance or product completeness from test counts.

## Second review and further iteration

Completed against the running prototype after the first implementation pass. This incorporates the earlier rejected versions and the latest review together.

| Feedback checked | Observed result and second-pass action | Remaining limit |
| --- | --- | --- |
| Blank open canvas, no title/hero/header/logo/inset frame | Fresh entry has only rail, grid and floating composer; content opens intentionally. Kept the grid quiet at a wider spacing. | Existing saved layouts reopen intentionally; they are not erased to fake a blank state. |
| Composer and navigation | Two-row input, integrated creation, no project pill/number badges/View menu. Rail contains scopes/channels and open-surface recovery. Replaced remaining ornamental glyphs with the same SVG family. | Production account/navigation architecture is not selected. |
| Private/shared work, channels and threads | Membership-scoped sample records, distinct Personal/Projects sections, nested replies and composer targeting still work. | Sample identities and browser filtering are not server security or live collaboration. |
| Scale and context placement | Goals/Knowledge/People/Agents are in the Project module. Search/filter/pagination works with 250 people and 40 agents. Replaced an initial raw context dump with navigable instructions, files and sources. | Large-workspace server queries and large graph performance remain untested. |
| Module/window behavior | History/sharing/knowledge inspection replace content in place. Removed duplicate stacked filename bars; deliberate header renaming preserves dragging. | No production document-engine lifecycle or resource locking. |
| Canvas movement and recovery | Negative coordinates, snap/alignment, pan/zoom, resize and fit-all retained. Corrected viewer scroll handling and readable focus after creating from low zoom. | Named personal presets are still absent. |
| Graph behavior and design | Distinct unframed project/folder/content marks, miniature text/cell content, semantic zoom, graph-local inspection and always-on physics. Improved initial spacing/contrast. Fixed selected-node positions moving on immediate tab redraw. | This is a local force layout; large nested datasets and activity streams need further evaluation. |
| Native-feeling content interaction | Real file previews and separate reading page/grid/slide surfaces reviewed visually. Added local slide editing and actual structured history. Fixed graph-local cell, worksheet and Project-tab state resets. | Parsed previews cannot replace a production Office rendering/co-editing engine. Charts, complex layouts and round-trip editing remain unsupported. |
| Canonical sharing, variants, provenance | Workflow checks retain one canonical original, explicit variant identities and ancestry. Structured content is retained in variants and revisions. | Source-revision lineage, attachment dependencies and durable immutable audit storage need backend implementation. |
| Agent/context responsibility | Default dedicated assignment and template context remain visible as local records; retirement is in place. No simulated state is described as executing work. | Actual job execution, retrieval, automatic inference and presence remain unimplemented. |

A final scale check kept directory search and pagination fixed while the bounded rows scroll, rather than forcing people to scroll through a whole page to reach the next-page control. Actual browser screenshots were reviewed for documents, sheets, slides, the graph, Knowledge and the 250-person directory.

Second-pass runtime checks additionally found and corrected two content-viewer errors when opening History: worksheet/deck handlers attempted to bind after their content surface had been replaced. Binding now follows the surface actually mounted. Formula checks caught and corrected cycle propagation inside aggregates and scientific-number parsing. These defects were fixed before the final rerun.

## Next implementation gates

1. **Document engine and application shell:** investigate genuine embedded word/cell/slide sessions, auth, file storage, revisions/callbacks and asset fidelity alongside authenticated browser-surface constraints. Choose a production shell/provider only from demonstrated behavior. Local parsed previews are a review aid, not this decision.
2. **Authoritative collaboration foundation:** identity, membership, durable canonical resources/revisions, access checks and event subscriptions. Keep personal placement separate from shared content. Validate with two actual users and revocation/privacy checks.
3. **Real project agent/context loop:** persistent assignment, queued maintenance, permission-filtered retrieval, source revision references and actual activity/job state. Replace templates with observable execution while preserving privacy and uncertainty.
4. **Representative scale and resilience:** larger nested knowledge sets, graph density, concurrent file editing, reconnects and storage recovery. Expand tested workload based on observed failures, not invented claims of readiness.

No provider, production stack or deployment was approved by this research. No user acceptance is implied by passing tests. Current test evidence and the supported review flow live in `prototype/README.md`.

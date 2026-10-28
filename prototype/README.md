# Workstation interaction prototype

Local revision, October 28, 2026. Earlier visual passes were rejected. This revision applies the user's later feedback on scalable navigation, on-canvas project controls, content viewers and graph design. It has not been accepted by the user. See [the revision plan](../Design%20Research%20and%20Revision%20Plan.md), [interaction contract](../Interaction%20Contract.md) and [conversation record](../Conversation%20Context.md).

## Run

From the project root:

```sh
python3 prototype/server.py --port 4173
```

Open http://127.0.0.1:4173/. No installation/build is required. The loopback server serves the interface and parses Office imports locally. A generic static server can display the interface but cannot import Office files. Stop the owned server with Ctrl+C when finished.

## Review the interaction

- **Entry:** fresh browser state opens a blank monochrome canvas with a spatial grid, left rail and floating composer. Saved work reopens as arranged. No workspace title, logo, hero, top menu or inset frame.
- **Navigation:** Personal and Projects have distinct sections. Project rows show names and nested channels. Project context and member/agent summary sentences are absent from the rail. “On canvas” recovers open surfaces; longer lists have a fit-all action.
- **Project module:** choose Studio, then composer plus → Project. Goals, Knowledge, People and Agents are local tabs in that canvas module. Knowledge opens instructions/references in place and returns to the same module. People/Agents have search, filters and pages of 24 results. Agent assignment can be retired/restored in place. This directory was checked with 250 people and 40 agents; that is a local scale fixture, not connected users.
- **Channels:** select general, references or planning. Replies stay nested under their parent. The floating composer targets the selected channel/thread; private chats remain separate conversations.
- **Creation:** composer plus creates a document, spreadsheet or presentation, places a Browser/Files/Project module, or imports a file. The composer remains a two-row input with compact controls; there is no Add to canvas control in the rail or project-name pill in the composer.
- **Canvas:** drag a header to move; drag empty space to pan. Wheel/trackpad pans outside content. Scrollable viewers consume their own scrolling. Control/pinch-wheel zooms about the pointer; minus/plus zoom about the viewport. Negative world positions, grid snapping, alignment guides, resize, fit-all (`0`) and item recovery preserve placement. Double-click a resource's filename to rename; the header otherwise remains draggable.
- **Graph:** physics always runs. Project hubs, folder branches, document miniatures, worksheet fragments, slide miniatures, Markdown and conversations have distinct treatments. Expand folders to reveal children. Select a resource to inspect it on the graph; content, history and sharing remain there. Worksheet selection, sheet tabs and Project tabs retain their state during redraws. There is no physics toggle.
- **Sharing/history:** sharing changes the original item's scope, retaining identity. An explicit private variant has a separate identity and ancestry. History captures local content snapshots, including worksheet cells and slide text. History/sharing change the same surface; they do not spawn windows.
- **New projects/goals:** creation initializes channels, a resources grouping, orientation Markdown and a dedicated assignment. Goals have human ownership, optional project-agent assignment and a simple deadline. Template context updates are recorded as such.

## Content surfaces and real files

These are distinct local content surfaces, not a production Office engine:

- **Documents:** structured page with headings, paragraphs and tables. New local drafts support text editing. DOCX imports are read-only parsed previews; complex layout, images, pagination and embedded objects are not reproduced faithfully.
- **Spreadsheets:** row/column headers, cell selection, keyboard navigation, formula bar, worksheet tabs and local edits. Arithmetic and SUM/AVERAGE/MIN/MAX/COUNT recalculate; unsupported functions can use the imported cached value. Imported viewports show at most 250 rows and 60 columns. Charts, pivots, merges and advanced number/visual formatting are not rendered. Full imported cell data remains in the local model within the import budget.
- **Presentations:** thumbnails, original slide aspect ratio, text/image geometry, slide navigation and notes. New local slide text and notes are editable. PPTX imports are parsed previews; themes, grouped shapes, charts and animations may differ or be absent.
- **Imports:** DOCX/XLSX/PPTX plus text, Markdown and CSV. ZIP/XML work is bounded; files stay local. The client also limits preview size to leave browser-storage headroom. The original Office binary is not stored or exported. No Office round-trip saving, co-editing or external Office session is connected.

A production document-engine investigation is still required before choosing the application shell and storage/collaboration stack. The research plan records this as implementation work, not a user-approved provider choice.

## Current limits

Records live in this browser's local storage under `workstation-interaction-v3`. Older storage keys were preserved. This is not authentication, durable storage or a server access boundary. Large or long-lived work needs a different persistence layer.

No real multiplayer, remote presence, server authorization, permission-filtered retrieval, autonomous context inference, executing agents, routine scheduler or external connectors are connected. Private project creation and named personal layout presets remain unimplemented. Sample identity switching is explicitly local. Agent retirement changes an assignment record, not a running job.

Context is maintained by deterministic local templates, with source conversations kept distinguishable from decisions. The browser module tries a sandboxed URL; sites that block embedding need its external link. It does not reuse signed-in sessions or perform browser automation.

## Verification

Current browser checks passed with no page exceptions:

| Scenario | Assertions | Coverage |
| --- | ---: | --- |
| `tests/browser-scenarios.js` | 18 | Actual-pointer drag, negative coordinates, snapping, zoom, distant recovery, resize, persistence, graph-local review and cross-project channels |
| `tests/workflow-scenarios.js` | 15 | People, channels/threads, private chats, history, canonical sharing, variants, project initialization and goals |
| `tests/content-contract-scenarios.js` | 23 | 250 people/40 agents, search/filter/pagination, absence of rail context/counters, real DOCX/XLSX/PPTX imports and typed graph inspection |
| `tests/content-editing-scenarios.js` | 10 | Slide editing/reload/history, actual worksheet snapshots, local scrolling, graph cell/sheet selection and in-place project knowledge |

A separate actual-pointer check expanded a moving graph folder, opened its document and switched history/content while physics stayed on. Browser scenarios use fresh contexts so test data does not overwrite existing sample work. They are async Playwright page functions executed using the connected browser-testing tools. `tests/run-browser.cjs` is an optional standalone runner; see the root README for Playwright setup. Import fixtures are fetched from the preview server rather than an original machine path.

Additional checks:

```sh
node --check prototype/app.js
node --check prototype/viewers.js
node --check prototype/icons.js
node --check prototype/spatial.js
node prototype/tests/spatial.cjs
node prototype/tests/viewers.cjs
python3 -m unittest discover -s prototype/tests -p 'test_*.py'
```

These passed: six spatial categories, ten formula cases and six Office parser tests. Parser tests include actual fixture structures, damaged archives and XML entity rejection. Fixtures in `tests/fixtures/` were generated locally by `tests/make_office_fixtures.py`.

Current visual review evidence: `project-knowledge-review.png`, `graph-review.png`, `graph-inspection-review.png`, `document-review.png`, `workbook-review.png`, `presentation-review.png`. Earlier `collaboration-preview.png`, `graph-inspection-preview.png`, JPGs and `revision-shell.png` are superseded. Test counts establish specific behavior, not design acceptance or MVP completeness.

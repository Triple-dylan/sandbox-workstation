# Workstation interaction proof

Read [AGENTS.md](../AGENTS.md), [Conversation Context.md](../Conversation%20Context.md) and [Direct Canvas Results.md](../Direct%20Canvas%20Results.md) before changing the app. The latest implementation follows the user's click-to-write clarification and review of dragging, conversation presentation and fixed utilities. It remains a browser-local review implementation, not an accepted or completed MVP.

**Latest follow-up:** read [Conversation and Canvas Interaction Plan.md](../Conversation%20and%20Canvas%20Interaction%20Plan.md). First click away ends writing, text controls format the active block, feedback occupies the existing work-action row, and graph parent/close navigation stays in sync. The shell now fits the 550px preview. A unified human/agent conversation model is proposed; proactive agents were confirmed but are not connected.

## Run

Requires Node 22.12+ and npm:

```sh
npm ci
npm run dev
```

Open [port 4174](http://127.0.0.1:4174/). Reuse the existing loopback server. Predev/prebuild snapshot four repository Markdown sources with content hashes; generated copies retain stable source identities. The preview has no authentication and is not a production shared service.

## Canvas and Graph

Fresh Canvas is blank apart from the shell and floating input. Click an empty location to place a caret and type directly there. There is no Write launcher or text window. Unused focus creates no saved source. First meaningful text creates the private resource and placement together. Existing text edits/selects normally; hover/focus reveals separate movement, resizing and structure controls. Enter splits at the caret; Shift+Enter adds a newline. The same source appears in Files/private Graph/reader and exports Markdown. Closing its placement does not delete it. Focus the empty canvas and press Enter for keyboard entry.

Message pins retain source references and Open original navigation. Add to plan explicitly creates an action; one message may support distinct actions, with duplicate-submit guards. Private pins cannot silently become shared goals. The sequential canvas plan and fixed Goals summary use the same records; the complete plan supports title, order, optional dates and completion.

Add visual reference, image drop and image paste retain actual local Blobs in IndexedDB, with captions in view state. PNG/JPEG/WebP/GIF up to 12 MiB stay private on this browser. Replacement uses an immutable new binary key before publishing its metadata; failed metadata saving preserves the prior complete version. Full captions, pin text and writing are searchable. Canonical image indexing/sharing and storage cleanup remain further work.

Graph is a primary full-surface destination with anchored always-on physics, folder focus/expansion and resource inspection. No zoom control or decorative center glyph. Clicking a node does not create canvas text. One document inspection is reused; independent browser/agent work has separate roles. Document, agent inspection and conversation work have different material and corners from the fixed right summaries.

## Conversations and supporting views

Conversations opens navigation. Selected history becomes a retained beside-work surface inside the workspace row, with its composer attached beneath it. List and history keep the same column width and canvas horizontal origin. A pointer/keyboard divider resizes history and retains its width. Back returns to navigation. This is not a freely draggable conversation object.

Channel, private and retained unverified DM drafts retain separate destinations. One-to-one human messaging remains a product requirement; no authoritative people/delivery service is connected. New private chat creates an identified local draft without naming paperwork. Account does not cycle fake users.

Message search returns to original context. Replies preserve main/thread drafts, attachments and selection across navigation/reload. Reading positions are session-local. The composer uses a neutral focus boundary, IME-safe sending and a send-shortcut preference. Attach context expands within its space; inspecting a reference does not send it. Private local sources cannot silently attach to channel/DM drafts. Local messages are explicitly local.

Files reveals navigation without creating work. Selecting a file/folder reuses inspection; deliberate placement moves the single reader onto Canvas. Open work (Command/Control+K or Canvas context menu) and Account use allocated space with return/close behavior. They do not cover the active work. Native OS file/date dialogs follow browser/OS behavior.

Project tools opens independent fixed Sources/context, Project agent and Goals summaries. Their bodies, cards and stack never scroll. A bounded number of rows link to complete work views. Very short windows use actionable headers; complete tools may require additional room. Closing utilities does not delete records or leave an invisible full-height column.

## Dragging, capacity and persistence

Drag a work header or native-content grip: actual content follows the pointer through valid positions. The destination guide shows the 24px grid result. Normal moves preserve neighbours. Shift-drag near a neighbour deliberately requests paired edge placement. Arrow keys move/resize on the same grid. Escape, lost capture, pointer cancellation and window blur cancel; drag-end clicks cannot create writing. Bounds and collision checks retain the last valid placement. Focus/restore and one local arrangement snapshot remain.

Native content can reflow to fit when adding work or opening utilities. Full document/browser/agent tools are not silently shrunk for native imports. An unfulfillable request explains the capacity limit and preserves records. Very narrow/short-window recovery retains objects and restores prior positions when space returns; the full interface is not promised at arbitrary tiny viewport sizes. Named working arrangements and complete canvas export/undo remain open.

The same `workstation-layout-proof-v1` version-2 key stores additive local resources, messages/drafts/attachments, goals, object geometry, definitions/versions, appearance and conversation preferences. Images use IndexedDB. Migration retains legacy records without restoring rejected split trees. Local storage is not a backup or authoritative permission boundary.

## Documents, agents and service limits

New document creates an editable private Markdown source with stable identity; repository snapshots remain read-only. There is no native Word/Sheets/Slides engine. Native writing is lightweight structured text, without a full structural undo or document revision system.

Agent builder saves local definitions, purpose/instructions, scope, context preferences and private autonomy; project definition scope remains project. Versions are immutable configuration snapshots, restoration updates the editable draft, and export downloads the definition. Test/deploy controls explain the absent runtime. No fake execution, deployment, presence, portrait or successful context-maintenance event is generated.

No real accounts/contact lookup/delivery, multi-user persistence, authoritative access enforcement, canonical sharing/retrieval, browser session, Office engine, executing agent, on-graph job telemetry or automatic context maintenance is connected. These remain the core production work. No provider or paid deployment service was selected. `/materials` is only a static specimen.

## Checks and source

```sh
npm run build
npm run format:check
npm test
```

Checks use isolated contexts, not the user's preview state. They exercise source identity, drafts/privacy, migration, graph bounds/anchor, placement/cancellation/recovery, images, definitions, direct text and fixed utility behavior. Current outcomes/captures are in [Direct Canvas Results.md](../Direct%20Canvas%20Results.md). Passing checks do not establish user acceptance or server authorization.

`main.tsx` owns navigation and record commands; `CanvasText.tsx` owns frameless Canvas input; `CanvasWriting.tsx` retains the structured source-reader editor. `Conversation.tsx`, `Composer.tsx`, `WorkActions.tsx`, `AgentEditor.tsx` and `CanvasContent.tsx` own their respective flows. `canvas-layout.ts` constrains geometry; `state.ts` migrates view data. Whole-workspace Dockview/Gridview remains removed.

# Workstation primary-surface correction

The user explicitly authorized this implementation after rejecting the six-box stage A layout. Read `../Primary Surface Fix Plan.md`, `../Primary Surface Fix Results.md` and the latest handoff before continuing. This revision still requires user review. It is not a completed MVP.

**Latest status:** the subsequent review rejects the composer/focus treatment, creation menus, conversation maturity, preferences-only agent page and decorative graph-center glyph. The graph/rail/icons/right modules must be monochrome. Read `../Maturity Refinement Plan.md` for the source/screenshot audit, refreshed research and proposed next slices. This research cycle did not change the preview; the controls documented below describe current code, not accepted design.

## Run

Requires Node 22.12+ and npm:

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4174/>. The existing loopback server can be reused. Predev/prebuild prepare four actual project Markdown snapshots and a content-hash manifest. Generated files retain their source IDs; they are not private/shared copies. This preview has no authentication and is not a production shared service.

## Navigation and work

- **Canvas** and **Graph** are primary rail destinations. Neither becomes a window. Graph fills the working surface; full graph returns to its centered project subject.
- **Conversations** reveals the left navigation extension. Select a conversation to show its history there; Back returns to the list. New private chat opens an identified draft, without a naming form. Personal plus opens a human-DM draft without a project.
- **Files** reveals resource navigation on the left. It creates no canvas objects. A folder/file selection opens one supporting inspection area. A file replaces the folder in that area; it does not add another explorer window. Close inspection restores the preceding utilities.
- **Project tools** reveals independent Sources/context, Agent and Goals. Each fits its content and collapses/closes independently. These tools anchor on both working surfaces without taking an empty column. Graph nodes and canvas objects avoid their occupied area; the space beneath a short tool remains usable. A lone Goals module does not fill the screen. Optional due dates appear through each goal's calendar action.
- The floating composer keeps its selected conversation/thread and draft. Its plus attaches a source. Opening a file never changes the recipient. Sending saves locally and explains that no message was delivered.
- Account opens local status and System/Light/Dark appearance. It never cycles fake users.

## Canvas tools

Use the small Add a canvas tool action on Canvas. Command/Ctrl+K and right-click on empty Canvas are supplemental routes. Document, Browser and Agent settings are distinct tools. Selecting a source inspects it; Place document on canvas deliberately moves the one reader into a work object. A second document viewer is never created.

Working objects are purpose-sized, not stretched into a wall of tiles. Drag a header to preview a snapped position; release only commits a valid collision-free position. Escape cancels. Drag close to another object's edge to snap that pair together; other objects remain unchanged. Use the corner handle to resize. Header/corner arrow keys offer keyboard movement/resizing. Focus/restore retains the arrangement.

The Canvas actions menu saves/restores one local arrangement. It does not copy resources. Lack of room is explained without dropping existing objects. Narrow-window recovery retains object positions and restores them when room returns. Smaller graph/reader layouts may hide navigation to protect readable work; drafts and reading state remain intact.

## Checks

With the server running and Google Chrome installed:

```sh
npm run build
npm run format:check
npm test
```

The replacement browser suite checks the corrected navigation and ordinary task sequence, not a required count of generic panes. It covers full Graph bounds, no rail-driven work creation, content-sized utilities, inspection reuse, recipients/drafts, intentional placement, pointer/keyboard behavior, recovery, migration and failed source retry. Browser contexts are isolated from the user's preview records.

## State and limits

The same origin/key, `workstation-layout-proof-v1`, now stores version 2 view state alongside existing conversation/message/draft/attachment/goal/appearance records. The rejected split tree is retained as `legacyLayout` and never restored as windows. Canvas objects/preset and graph/navigation/inspection state persist locally. Reading offsets survive source switching within the loaded session; they are not cross-device or durable server state.

The reader is read-only Markdown. Browser reports no session connected; Agent settings save preferences without running a model. No real accounts, message delivery, access enforcement, shared editing, presence, retrieval, approvals, jobs, schedules or automatic context maintenance are implemented. The material page at `/materials` contains visual state specimens, not connected approval/reconnect actions.

Whole-workspace Dockview/Gridview and its adapter were removed. `main.tsx` owns primary navigation, `components.tsx` contains reused content components, `state.ts` migrates records and `canvas-layout.ts` constrains only deliberate work objects. The accepted color/material direction is retained separately from the revised structural layout. See the root results document for exact evidence and remaining technical gates.

# Stage A layout and material proof

This is the new review artifact, separate from the rejected `../prototype/`. It is a browser-local interaction proof, not the MVP. Read `../Stage A Review.md` and the approved plan before continuing implementation.

**Subsequent review:** this artifact's interaction structure was rejected. The generic tile layout, graph-as-window, rail-driven pane creation and stretched utilities are not the target experience. Read `../Primary Surface UX Review.md` and the latest handoff. The flows below describe the reviewed implementation; they are not approved acceptance criteria for its replacement.

## Run

Node 22.12+ and npm are required:

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4174/>. The server binds to loopback. `predev` snapshots the four repository source documents, with stable proof IDs and a content-hash manifest. The generated files are not separate shared-resource records. Do not deploy the preview as a shared authorized service; it has no authentication.

The separate <http://127.0.0.1:4174/materials> is a design specimen. Its sample approval/reconnect controls demonstrate styling, not connected services. A fresh product entry has no heading, logo, dashboard or preloaded work panes.

## Review a working arrangement

1. Open the conversation list from the rail. Select `# product-direction`. Its imported interview excerpts are labeled; right-side Sources/context, Project agent and Goals appear as independent utilities.
2. Open the context graph from the rail. Select `Rebuild plan` in Sources. The document gets a full-height reading region, with conversation and graph alongside it.
3. Select graph folders to explore them and file nodes to reuse the document viewer. Full graph returns to the centered project subject. Drag the subject slightly and release; it returns home. No global zoom or physics switch exists.
4. Drag a module header toward an edge of another module. A preview marks a valid placement. Release to snap; Escape cancels. Working panes never float over each other. An invalid placement retains the prior arrangement.
5. Resize a shared divider. Focus it with Tab and use its orientation's arrow keys; Shift uses a larger step. Utility boundaries and the conversation/utility column widths also have pointer and keyboard controls.
6. Focus a pane from its header and restore the arrangement. Shrink the browser, then make room and restore. Navigation may collapse to retain readable work; it can be reopened from the rail. Hidden panes retain their records but are not keyboard-active.
7. Use the work area's bottom-right layout menu to save/restore one local work-pane arrangement, or open another module. Command/Ctrl+K also opens the compact module picker. Right-click the empty work surface opens the same picker. Browser and agent-settings panes are separate module types.

## Conversation and draft checks

- New private chat goes directly to a draft, without a naming form. An existing blank new-chat draft is reused. A meaningful first message supplies a local title.
- The Personal section's plus opens a human-DM draft by name/email without a project. It does not look up contacts or send to a real recipient.
- Main conversation and thread drafts retain separate state. Opening a file never changes the composer recipient. The plus inside the composer attaches a source to that specific draft; it is not a general workspace toolbar.
- Sending stores a local message and source IDs, then clearly reports that no message was delivered. Source references in a stored message can reopen the same viewer.
- Account opens local-account status and System/Light/Dark appearance. It never cycles sample users.

## Checks

With the server running and Google Chrome installed:

```sh
npm run build
npm run format:check
npm test
```

Tests use independent browser contexts. The suite exercises allocation and actual pointer/keyboard workflows, rather than testing absolute-position math in isolation. `WORKSTATION_URL` can override the local base URL. Normal browser accessibility zoom is unaffected; there is no application zoom handler.

## State and implementation boundaries

Storage uses only `workstation-layout-proof-v1` on this app's origin. It does not migrate, reset or overwrite old prototype data. It is not an authorized private/shared data service or a backup. Reading offsets last within the loaded session; selected document, graph focus/expansion, drafts/attachments, messages, local goals/preferences and the work-pane arrangement persist locally. One work-pane preset is supported. Utility sizes/order/pinning, named preset collections and per-project layouts are not implemented as durable user settings.

The Markdown viewer is read-only and uses actual source snapshots. It has no native Office engine. Browser and project-agent panes are explicitly disconnected. No real accounts, permissions, delivery, collaboration, presence, retrieval, approvals, jobs or automatic context maintenance are implied.

Gridview 8.8.0 owns the split allocations. Movement resolves the destination after removing the origin, with snapshot rollback if the result fails: the library's direct move operation produced an invalid location when an ancestor branch collapsed. No floating/tabbed layout or commercial Dockview extension is enabled. React/TypeScript, D3, Markdown, icon and font versions are pinned in `package-lock.json`; the font is bundled locally.

`src/style.css` holds semantic light/dark material tokens and reduced-preference behavior. The new component/material direction requires user review. Preserve the old prototype as historical evidence; do not copy its camera/zoom, generic Project tabs or fake participant behaviors into this app.

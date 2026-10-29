# Earlier interaction contract — superseded in part

**Current authority:** the evening October 28 user review, `AGENTS.md` and `Research Review.md` supersede the free-canvas/zoom, all-in-one Project tabs, right-side conversation assumptions and muted gray styling below. Working modules must snap without overlap, utility modules coexist on the right, conversations are navigated from the left, and the graph center is anchored. Implementation is paused for research-informed follow-up questions and a plan. The older body is preserved as history, not a new build specification.

October 27, 2026. The user rejected both previous visual passes. This contract translates the latest review into behaviors to implement and verify; it does not replace the recorded product scope.

## Shell and space membership

Only the left rail and floating composer persist over the working surface. No logo, title, marketing text, top menu, numbered navigation shortcuts, or inset canvas frame. A subtle monochrome spatial grid is appropriate: “blank” means no unsolicited content, not removing the affordances needed to navigate a canvas.

Separate personal work and shared projects into explicit rail sections. Shared project rows show their names and nested channels. People, roles and agent assignments belong in searchable, filtered, paginated directories in an on-canvas Project module; do not use aggregate membership/agent sentences or a project-context tree in the rail. This supersedes the earlier rail-count requirement. Sample people must not be presented as live connected users. Private work is a separate scope, not a small badge attached to an otherwise identical project row.

Project conversations have channels and nested threads. Selecting a channel selects the conversation targeted by the composer. Threads retain their parent/channel identity. Messages are not converted into independent documents. Project creation initializes channels, folder structure, context documents, and an agent assignment.

Direct conversations between people do not require a project. Messaging is an integrated workstation capability, not the organizing purpose of the entire product. Keep destination independent of the resource currently being inspected: opening a document must not silently retarget the composer. Preserve unsent drafts per conversation and thread when navigating; do not carry text to a different audience. Person-to-person direct messages and draft isolation are confirmed requirements not yet implemented by the owner-only private-chat sample.

## Canvas geometry

Use a single world-to-screen transform: screen = camera translation + world × scale. Card positions can be negative and are never clamped to screen edges. Dragging a header moves a card; dragging the background moves the camera. Capture and cancel pointer gestures explicitly. An edge-pan during card drag keeps movement continuous beyond the viewport.

Wheel/trackpad pans; pinch/control-wheel and zoom controls zoom around a stable screen anchor. Zooming must not reset placement. Fit all calculates actual extents of visible cards, including their dimensions; it is not a hard-coded zoom percentage. Open modules can be recovered from the rail; longer lists have a fit-all recovery action. Modules are never deleted simply because they leave the viewport.

Provide grid snapping on drop, proximity alignment during drag, visible alignment guides, and a subtle grid transformed with the camera. Resizing changes module dimensions without moving the camera. Personal layout and camera persist separately from shared content.

## Content and composer

Creation controls belong in the composer's integrated reveal, not an Add to canvas menu on the rail. A module opens near the visible center and can be found again from the rail. Canvas context menu/keyboard alternatives may supplement this; do not require them.

The composer follows a restrained two-row text-input treatment inspired by the user's Codex reference. It does not show a project-name pill. Selected channel/thread context is communicated through its input target and rail selection. Canvas navigation tools live within the composer's compact control row, not a separate View menu.

Documents, spreadsheets and presentations have distinct content surfaces. Use a consistent SVG icon family and nearly square work surfaces, avoiding rounded-square dashboard cards. Resource filenames appear once in the header and rename intentionally. Scroll a document or worksheet locally without panning the canvas. Local drafts and parsed Office previews are different capabilities; disclose the latter’s limits.

Goals, knowledge, people and agent assignments live in local tabs of an on-canvas Project module. Large directories remain bounded and searchable. Instructions and references open and return within that module.

A module never spawns another floating module to show its history, sharing controls, or details. These are states within the same resource surface. Browser and connector capability limits must be visible when those modules are used; do not pretend a sample surface is a connected service.

## Graph

Physics is always on. No toggle. Folder nesting reflects actual relationships: workspace → project → resources/conversations/context documents. Expand a folder to reveal its children; do not invent graph structure from a card dashboard's layout.

Project hubs, folder branches and file/content miniatures need distinct unframed treatments; no bordered icon tiles. Folder expansion starts without overlapping labels. Semantic zoom reduces detail. Selecting a graph resource inspects it in the graph. Expand that node into an inline resource surface, keeping neighboring graph context visible. Document content, revisions, and sharing are inspectable there. Do not silently navigate to Canvas. Clicking a project/folder expands or focuses that branch. Graph camera, canvas camera, and personal arrangements are distinct.

## Review gate

Check blank canvas entry; explicit private/shared separation; scalable people/agent directories; channel creation and thread replies; composer-based module creation; negative-coordinate dragging; drag versus background pan; resizing; snapping; zoom; fit of widely separated modules; return to a hidden module; graph folder expansion; graph-local editing/history; absence of physics toggle; typed document/sheet/deck imports; direct local editing; graph-local cell/sheet/project-tab state; structured snapshot history; persistence after reload. Preserve the product's canonical sharing and variant/provenance rules.

This rebuild is still a local interaction implementation. Real multi-user authorization, remote presence, external connectors, retrieval, and agent execution are separate integration work. Do not claim those exist based on local sample records or generated templates.

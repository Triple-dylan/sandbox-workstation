# Primary surface correction: review, plan and implementation

The user explicitly requested reviewing, planning and implementing the correction after rejecting the stage A six-box layout. This authorizes the interaction correction below; it does not approve the finished visuals in advance or expand the work into backend/agent services.

## Review findings applied

Preserve the improved palette, glass treatment and compact rail. Remove the generic split-tree interpretation of the whole harness. Navigation, primary surfaces, conversations and inspections must have different roles. Utilities must fit their content. Non-overlap remains a constraint on deliberately placed working modules, not a reason to fill the screen.

## Implementation decisions for this revision

- **Canvas and Graph:** explicit rail destinations. Graph directly fills the main working surface, without a titled/draggable graph window, tile border or separate dashboard. Canvas opens as working space and retains intentionally placed tools when changing destinations.
- **Conversations:** rail reveals the left conversation extension. Selecting a channel, private chat or DM opens its transcript in that extension, not as a canvas window. The extension switches between list, transcript and resource navigation; it does not create multiple left columns. Floating composer retains the selected conversation/thread and its draft.
- **Resources:** rail reveals resource navigation only. Selecting a source opens one reusable inspection area beside the primary surface. A graph folder and its file use this same area in succession; selecting a file does not leave a separate explorer window behind. Closing inspection restores the preceding utilities and the full available graph surface.
- **Supporting tools:** Sources/context, Agent and Goals can coexist on the right. Their heights follow content, with upper bounds/scrolling for long content. Closing two leaves the remaining module content-sized. Empty goal dates use an explicit optional-date control.
- In Graph and Canvas, compact utilities anchor on the working surface without reserving an empty full-height column. The graph still fills the canvas. Its nodes and the canvas work objects avoid the tools' actual occupied area; space beneath a short tool stays usable. Inspection has allocated supporting space; it does not cover a working document/tool.
- **Inspection versus work:** opening a source inspects it. An explicit “Place on canvas” action moves that single viewer to a canvas work object. Browser and agent settings remain independent intentional tool types. There is never a second document viewer showing another copy.
- **Canvas placement:** purpose-sized objects occupy bounded snap positions and leave unoccupied space visible. Header dragging previews a snapped, valid position; collisions and out-of-bounds positions cannot be committed. An edge snap can arrange two requested objects together, changing only that pair. Cancel restores the original positions. No application camera or zoom exists.
- Canvas exposes a small Add a canvas tool action. Keyboard/context-menu routes supplement that visible action; creation is not hidden exclusively behind shortcuts or placed in rail navigation.
- **Capacity:** a tool that cannot fit does not displace unrelated work silently. Explain the capacity and retain existing content. On smaller windows, preserve drafts/read state and temporarily prioritize the latest requested supporting view instead of crushing the graph into a sliver. No persistent working windows overlap.
- **Continuity:** retain existing local conversations, drafts, attachments, goals and appearance. Preserve the rejected layout data as legacy state rather than restoring its windows. New view/layout state is separate from those records. Do not fabricate delivery, presence or agent execution.

These placement decisions are implementation choices made to answer the latest review, not statements that the user supplied every detail. The resulting ordinary interaction must be inspected before declaring it accepted.

## Sequence and evidence

1. Separate the existing content components from the rejected application/window manager.
2. Implement primary navigation, left conversation/resource extension, reusable inspection and intrinsic right utilities.
3. Implement explicit bounded canvas work placement and recovery, preserving local records.
4. Replace tests that codified generic panes. Exercise Graph → folder → source → close, rail navigation, independent drafts, optional dates, single Goals sizing, canvas placement/cancel/collision, persistence and narrow-window behavior.
5. Review fresh Canvas, full Graph, Graph with conversation/inspection, content-sized utilities and intentional Canvas work in real browser screenshots. Correct observed failures before handoff.

Office engines, real browsing sessions, multiplayer, authorization and agent execution remain separate unimplemented technical gates. This revision must not relabel placeholders as those features.

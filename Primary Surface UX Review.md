# Primary surface UX review after stage A rejection

October 28, 2026, following the user's 8:34 and 8:36 PM screenshots. This is an audit and proposed correction, not a newly accepted design. No application changes accompany this review.

Subsequently, the user explicitly authorized “review, plan, and implement.” See `Primary Surface Fix Plan.md` and `Primary Surface Fix Results.md` for the resulting implementation. The findings below remain the reason for replacing the tiled layout; the statement about no app changes applies to the audit itself.

## Review outcome

The user said colors are better, the left rail is more beneficial and the right-hand module treatment feels better. Retain those improvements for the next review. This is not blanket approval of the design system.

The user rejected the interaction structure: the working surface has become six boxes, the graph should occupy the whole canvas, utilities waste space, and the rail should not open windows/modules into the canvas. The stage A artifact is rejected structurally. Its successful geometry checks do not override that review.

Preserved evidence: [tiled working surface](research/references/rejected-stage-a-tiled-surface.png) and [stretched Goals module](research/references/rejected-stage-a-stretched-goals.png).

## What failed and why

| Observed problem | Implementation cause | UX consequence |
| --- | --- | --- |
| Graph is a small titled window in a grid | Graph is registered as a generic Gridview work pane | The primary knowledge surface is visually subordinate to window chrome; the canvas disappears into a container layout |
| Rail clicks accumulate windows | Conversations, Graph and Resources call the same pane-opening function used for work tools | Navigation and object opening have indistinguishable side effects. Selecting a destination changes the user's work arrangement |
| Selecting a project creates a populated layout | Conversation selection opens a transcript pane and automatically opens all three utilities | A navigation action consumes work area and imposes a layout without the user arranging it |
| Folder exploration adds another full working box | Folder selection opens an independent explorer alongside the reader and transcript | Ordinary inspection fragments attention and progressively shrinks every useful surface |
| Goals consumes most of the height when other utilities close | Remaining utility grid rows use flexible height fractions | Empty container area grows instead of leaving usable breathing room around a content-sized tool |
| Every open item has equal framing | Generic pane header, border and split allocation apply to navigation, primary surface, conversation and resources | There is no clear primary task or stable visual hierarchy |
| Passing tests accompanied a poor experience | Tests asserted simultaneous generic-pane presence and non-intersection | They proved parts of the implementation model, while some assertions enshrined the wrong model |

The earlier requirement that modules must not overlap is still valid. It does not require filling every available pixel with tiles. The requirement that chat, graph and a document can coexist is also still valid. It does not mean that navigating to a project automatically creates an equal-status window for each capability.

## Corrected contract: confirmed by this review

- Graph is a whole-canvas primary surface, not a small draggable graph window inside a grid. Preserve the original distinction between Graph and Canvas destinations.
- The canvas must retain its identity and open working space. It cannot be defined as whatever gaps remain between six containers.
- The left rail navigates the harness and reveals relevant navigation. It must not add working modules/windows to the canvas.
- Right utilities remain independent and concurrently available. Their default size must be justified by useful content, not by the remaining viewport height. Closing Sources or Agent must not turn three goals into a full-height panel.
- Keep the improved colors, more useful rail and better utility treatment while revising the behavior. Do not start another palette reset in response to a structural rejection.
- Persistent working-module overlap, application zoom, unbounded offscreen objects, fake live participants and broken state transitions remain rejected.

## Proposed interaction principles, not additional user decisions

1. **Establish a primary surface.** Graph navigation displays the graph across the working canvas. Canvas navigation displays the working canvas. Neither is added as another generic window. Existing resource/conversation state should remain recoverable without staying permanently tiled on screen.
2. **Separate navigation from opening work.** Selecting a project/channel/person changes context or conversation. Explicit resource/tool actions open the intended work. Inspecting a folder/file should not leave a growing chain of equally framed windows.
3. **Use progressive disclosure.** Make tools available without rendering every tool at maximum exposure. Opening one thing should reveal what is relevant, preserve the user's orientation and avoid unrelated panels appearing as a side effect.
4. **Size supporting tools to the task.** Utilities use natural/content-based heights, compact empty/disconnected states and sensible maximum heights with internal scrolling. A deliberately expanded editor is different from an everyday utility. Unused space should stay unused.
5. **Keep snapping as a constraint.** Intentional canvas modules still need predictable placement and collision prevention. Snapping organizes requested work; it does not automatically partition the entire surface every time the user navigates.
6. **Prove the ordinary sequence first.** Navigate to Graph; explore a folder; inspect a document; return; continue a conversation. The graph should remain the primary context and the user should not need manual close/rearrange operations after every step.

The precise document-inspection and visible-message-history arrangements must be demonstrated in this hierarchy before another implementation pass. Do not silently turn the full-canvas graph back into a tile to satisfy coexistence, nor assume overlapping persistent viewers were authorized. This is the remaining design problem, not a request for the user to repeat the product's purpose.

## Reference cross-check

[Apple's layout guidance](https://developer.apple.com/design/human-interface-guidelines/layout) emphasizes relative importance, related grouping, progressive disclosure and distinguishing controls from content. Its [sidebar guidance](https://developer.apple.com/design/human-interface-guidelines/sidebars) defines leading navigation between app areas/content collections and allows hiding navigation to give content more room. These support a stable primary surface with supporting controls; they do not prescribe this project's exact inspection arrangement.

[Material's canonical layouts](https://m3.material.io/foundations/layout/canonical-examples/overview) distinguish primary content from supporting content. That distinction was lost in the generic-pane implementation. Its particular panel proportions or overlay patterns are not user requirements and should not be copied wholesale.

The earlier T3 source review was useful for draft identity, state restoration and navigation discipline. Importing the general idea of many resizable panes was insufficient: those mechanics do not determine this product's information hierarchy.

## Replacement acceptance evidence

Before broadening implementation, show the primary-surface behavior and compact utility sizing. At minimum:

- Graph navigation produces one dominant graph surface; it does not increase a generic work-window count.
- Rail navigation does not create or resize canvas work modules.
- Closing other utilities leaves Goals near its useful content height, with empty space outside the module. Empty dates need a deliberate optional-date treatment instead of a permanent row of blank date inputs.
- Canvas entry retains open working space. Deliberately opening a tool does not automatically open a transcript, explorer and every utility.
- Resource inspection and conversation interaction preserve the user's graph orientation and existing draft without a growing collection of windows.
- A sequence can be completed without repeatedly closing panes to recover the canvas.
- Pointer/keyboard behavior, access/state boundaries and non-overlap still work. Revise tests that codify the rejected generic-pane structure instead of treating the current fourteen-test suite as a product acceptance gate.

Review these states before expanding feature work. The full backend/engine/agent work remains outside this rejected visual proof's acceptance.

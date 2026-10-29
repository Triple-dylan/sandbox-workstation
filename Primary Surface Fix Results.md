# Primary surface correction: implementation and evidence

This revision follows the user's explicit instruction to review, plan and implement the correction. It preserves the improved color/rail/material direction. It is ready for review; implementation and automated checks are not user acceptance.

**Subsequent review:** the user rejected several remaining controls and workflows and required monochrome graph/rail/icons/right modules. See `Maturity Refinement Plan.md` for the latest audit and proposed refinements. The behaviors measured below remain implementation evidence, not acceptance of the composer, creation menus, conversation maturity or agent preferences page. The user subsequently authorized the new iteration; see `Maturity Refinement Results.md` for the now-implemented refinement and current service limits.

## Actual behavior

| User concern | Implemented correction |
| --- | --- |
| Graph lost inside a window | Graph is a primary destination. Its SVG fills the working canvas directly, without a draggable Graph frame, titled tile or global split tree. |
| Rail adds windows | Canvas/Graph navigate. Conversations and Files reveal the left extension. Selecting a conversation changes its transcript/recipient there without adding or moving canvas work. |
| Canvas becomes six boxes | Fresh Canvas is working space. Only explicit tool actions create bounded, purpose-sized objects. Objects leave unused space visible and never auto-populate from rail navigation. |
| Right utilities waste space | Independent content-sized cards replace fractional-height rows. The three-goal card measured 211.5 pixels before and after closing its neighbors. Optional dates replace permanent blank date fields. |
| Unused strip beside Graph/Canvas | Utilities anchor compactly on the working surface. Both destinations keep their full width and usable space beneath short tools. Graph nodes and canvas work objects avoid the tools' actual occupied area. |
| Explorer/document proliferation | One supporting inspection area changes from folder to file. Closing restores preceding utilities. Inspection preserves the graph, conversation and drafts. |
| Documents cannot live on Canvas | Place document on canvas deliberately moves the same viewer into a work object. Another source reuses that identity/viewer; it does not create a second copy. |
| Coexistence forces tiles | Optional left conversation history, full remaining Graph canvas and one right inspection can be used together, without generic windows for navigation or graph. |
| Windows collide/disappear | Validated snap previews, cancel, bounded movement/resize, pairwise edge snaps, keyboard controls, focus and small-window recovery retain objects and prevent committed overlaps. |
| Previous records at risk | Versioned view-state migration retains conversations/messages/drafts/attachments/goals/theme and preserves the rejected split snapshot as legacy data. It does not restore the rejected windows. |

The work area has a visible Add a canvas tool action. Command/Ctrl+K and right-click are supplemental routes. The composer plus remains source attachment only. Private and project drafts, including thread replies, remain isolated. A direct-message draft still does not require a project.

## Verification

The final replacement browser suite passed 21 scenarios, covering:

- Fresh open Canvas/private draft and full Graph at 1280×720, 1440×1000 and 1920×1080.
- Rail navigation without object creation/rearrangement and conversation selection without unsolicited utilities.
- Content-sized single Goals, optional dates, collapse/expand, and unchanged Graph width with utilities.
- Graph → folder → source → close, one viewer, draft/recipient isolation and explicit placement onto Canvas.
- Pointer drag cancel/commit, collision-free working bounds, pair edge snaps, keyboard movement/resize and personal preset restoration.
- Canvas arrangement recovery after a smaller window, Graph/reader recovery at 900×650, and subject spring return.
- Local DM/source attachment without unintended send, legacy-state migration, OS appearance and source-fetch failure/retry.

The final suite uses the visible Add action and includes perimeter-only edge snapping and usable canvas beneath a short utility. Reading-position return was also checked manually: a source scrolled to 600 pixels returned to 600 after another source was opened. No claim is made that all split/layout combinations or all accessibility behavior have been exhaustively verified.

Type checking, production build and format checks pass. The whole-workspace Dockview packages and their unused splitter adapter were removed. The production bundle is smaller; the client-only build still reports Lucide `use client` directive warnings. They are not runtime errors or proof of production readiness.

## Review captures

Current evidence: [full Graph](workstation/evidence/primary-graph-light.png), [dark Graph](workstation/evidence/primary-graph-dark.png), [compact Goals](workstation/evidence/primary-compact-goals.png), [conversation and inspection](workstation/evidence/primary-conversation-inspection.png), [intentional Canvas reading](workstation/evidence/primary-canvas-document.png), [usable canvas below Goals](workstation/evidence/primary-canvas-under-goals.png) and [narrow inspection](workstation/evidence/primary-narrow-inspection.png). Earlier images remain historical evidence of the rejected build. The current captures show fresh Canvas, full Graph with compact tools, single content-sized Goals, conversation/Graph/document inspection, intentional Canvas reading, dark appearance and a narrow-window state.

## Exact limits

Records remain browser-local. Conversations are not delivered. There is no real identity, server-enforced private/shared access, multiplayer, executing agent, retrieval or automatic context maintenance. The document reader is read-only Markdown. The Browser tool clearly reports that no session is connected; it is not a working authenticated browser. Native Office editing and browser-provider feasibility gates remain open.

One local canvas arrangement preset and within-session reading offsets are supported. This is not the complete per-project/named/cross-device layout system. The updated placement and inspection rules are implementation decisions for review, not claims that the user specified every control. Broader production features still follow the original design-review and technical gates.

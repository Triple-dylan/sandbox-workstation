# Canvas working-set iteration

October 28, 2026. Implemented in response to the user's request for distinct canvas uses: pinned messages, visuals and planning directly on the canvas. `Canvas Use Plan.md` records the researched direction. This is a local interaction implementation, not a completed collaboration/context service or visual acceptance.

**Subsequent review — October 29:** [Workstation Review 2026-10-29.md](Workstation%20Review%202026-10-29.md) qualifies the recovery, search and evidence-to-action behavior below. Controlled metadata-save failure during image replacement can leave old metadata pointing to new pixels. Opening utilities can hide the actively edited plan and focus an unrelated image. Closed pin search uses only a 65-character prefix, and visual captions are not searched. One source cannot intentionally produce multiple steps. Earlier passing checks did not cover these cases. The cycle records evidence and proposed repairs; no application changes or fixes were made.

## Useful actions now available

- **Pin a message:** use the pin action on a message in a conversation/thread. Its canvas object resolves the original message ID and shows author/conversation. Open original returns to that discussion. Pinning again reuses the object; changing the original is reflected after reload. Closing the view retains the reference for reopening through work search.
- **Turn evidence into a step:** Add to plan on a project-channel pin creates one goal with a source-message link and opens Project plan. Repeating the action reuses the existing step instead of duplicating it. Private-message conversion is blocked because sharing is not connected; the private pin itself remains usable on the personal canvas.
- **Plan directly:** Open project plan from work search or the Goals module. Edit titles/owner text, reorder steps, set optional dates and complete/reopen work. These are the existing goal IDs, so the right-hand Goals module and canvas plan show the same records. The owner is local text, not verified membership or an actual notification/assignment service.
- **Keep visual references alongside work:** choose Add visual reference, drop an image on Canvas, or paste an image with the canvas focused. PNG/JPEG/WebP/GIF up to 12 MiB are decoded before being stored. Edit the title/caption; replace/restore the image while retaining its reference ID. Closing the view does not delete its data; work search can reopen it.

The resulting loop is conversation → source-linked pin → source-linked plan step → original discussion, with visual evidence available beside it. This does not automatically declare every pinned idea settled or create an agent job.

## Layout, access and recovery

Fresh Canvas still starts blank. There are no auto-loaded examples, dashboard tiles, infinite pan/zoom or additional rail creation buttons. Pins, visuals and planning use the existing collision-checked snapping/movement/resize/focus/preset system. Visuals and plans have content-aware minimum heights to keep controls usable. Persistent objects do not overlap; transient work search remains separate.

Pin records contain source IDs, not copied private message bodies. Missing originals show unavailable content without a cached transcript. Source navigation is an explicit conversation action and preserves other destinations' drafts. Adding a pin changes personal placement, not its source's sharing scope.

Image Blobs live in browser IndexedDB; reference metadata/layout/captions use the existing versioned local state. Binary image data is not placed in localStorage. Invalid/unsupported/oversized images report failure without replacing existing work. If storage succeeds but the canvas is full, the reference remains searchable and the capacity message explains how to reopen it after making room. Missing binary content can be restored through the reference's image chooser. Files dropped on Graph cannot navigate the browser away from the application.

Closing an object removes its current placement, not its source record. Existing resources, conversations, drafts, agent definitions, goals and presets remain intact. New pin/visual IDs load through an additive migration. Images remain private local references; this build does not implement uploading/sharing them to a server, graph indexing or model retrieval.

## Evidence and checks

- [Light: conversation, pinned evidence, project plan and visual reference](workstation/evidence/canvas-working-set-light.png)
- [Dark: native canvas objects](workstation/evidence/canvas-working-set-dark.png)

Browser checks use isolated contexts, not the user's live preview records. New scenarios cover duplicate pin prevention, current-source resolution, source-linked goal creation and shared goal edits, private/missing source handling, binary image persistence/reopen/replacement, invalid images, crowded-canvas recovery and drop/paste. Existing navigation/geometry/draft/agent-version scenarios remain regressions. Verification outcomes:

- All **33 browser scenarios passed across the full run and targeted reruns**. The full run passed 31; two image scenarios hit a test-fixture URL/space conversion error. Correcting the fixture path made both pass. No product change was needed for that path issue.
- Final visual minimum-size handling passed the image persistence/replacement/caption case and existing pointer/keyboard placement cases again. The plan case was repeated after making its add-step row fixed while its list scrolls.
- Direct Add next step was also exercised in an isolated browser and created one canonical goal.
- TypeScript/production build, formatting and whitespace checks passed. The existing upstream Lucide `use client` bundler warnings remain.
- Light/dark captures were inspected after intentional pin/plan/image actions. Review tightened row sizing, retained optional dates and kept plan creation accessible below a scrolling list.

These results validate the exercised local flows, not visual acceptance, cloud permissions or automatic context maintenance.

## Remaining scope

No cloud identity, real message delivery, authoritative sharing/access control, live collaboration, model execution or automatic context maintenance was added. The canvas now has useful local authoring/reference workflows; it does not make those services real. Planning is deliberately lightweight rather than a new project-management database. No third-party board library, provider or paid service was selected. The researched comparisons are design inferences; no application code was copied.

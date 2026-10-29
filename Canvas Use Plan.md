# Canvas as a working set

October 28, 2026. The user asked for a better, more useful canvas with distinct on-canvas uses, specifically pinned messages, visuals and planning tools. This authorizes a focused interaction iteration; it does not accept the current design or select production services.

## Direction

Keep evidence visible while turning it into work. The canvas is not only a launcher for document/browser windows. Introduce three intentionally placed, content-specific objects, retaining blank entry, bounded snapping, capacity feedback and non-overlap:

1. **Pinned message.** A view of an identified original message, with author, conversation, source navigation and an explicit Add to plan action. It stores a reference, not a second editable message. Re-pinning the same message reuses its existing object. Closing its view does not delete the conversation or pin record.
2. **Visual reference.** Drop, paste or select an image; retain its actual pixels, filename and editable caption/title on the canvas. Store the Blob in IndexedDB rather than packing image data into localStorage. A closed reference can be reopened. Treat imports as private; no implicit sharing or remote fetch.
3. **Project plan.** A sequential, editable view of the same goal records used by the right-hand module. Add, complete, reorder and date steps; retain source-message links for steps created from a pin. Avoid a second task database or an elaborate project-management suite.

The useful loop is conversation → pin → sourced next step → original discussion. Visuals stay alongside that evidence. No automatic claim that pinning makes a brainstorm a decision; creating a step is an explicit user action. No agent execution is simulated.

## Research and boundaries

- [Slack pins and conversation resources](https://slack.com/help/articles/32562841868307-Add-and-manage-tabs-in-channels-and-direct-messages) make selected discussion accessible later. Adopt source identity/navigation; do not copy a tab strip or make the product a messenger.
- [Miro Timeline](https://help.miro.com/hc/en-us/articles/20185235301650-Timeline) lets planning views use existing/synced records. Adopt one record across views; do not add a full timeline/dependency suite to these lightweight goals.
- [FigJam sections](https://help.figma.com/hc/en-us/articles/4939765379351-Organize-your-FigJam-board-with-sections) group meaningful work and link people to it. Adopt deliberate organization; do not reintroduce endless pan/zoom, overlapping freeform cards or preloaded workshop templates.
- [Milanote documents](https://help.milanote.com/en/articles/10458661-documents) distinguish longer writing from board content. Preserve a proper document viewer while allowing short evidence/reference objects to be useful directly on the canvas.

These are design inferences from primary documentation, not copied code or user-approved details of those products.

## Access, persistence and scope

Canvas placement is personal and does not change source access. Private pins stay private; they cannot become source links in the shared project plan without sharing first. Because the current sharing service is not connected, that conversion is blocked with an explanation. Missing originals have an unavailable state rather than a leaked cached transcript. Plan completion/date changes update existing goal IDs. Closing a canvas object removes placement, not its underlying record. Preserve existing layouts and presets through additive state migration.

Image storage must finish before reporting success; decode/type/storage failure keeps existing work intact. PNG/JPEG/WebP/GIF are sufficient for the first pass; unsupported formats need a clear response. Respect canvas capacity before adding objects. Preserve drafts, recipients and the user's existing browser records. Do not fabricate collaborators, remote saves or context indexing.

## Review and acceptance

Exercise pinning twice, source navigation and thread recovery, converting a shared pin into a linked goal, blocking private-pin promotion, goal edits reflected in both views, image import/caption/reload/reopen, invalid images and crowded-canvas recovery. Verify pointer and keyboard snapping, readable content and no working-object overlap in light/dark and narrow arrangements. Capture populated states only after intentional interactions in isolated contexts; fresh Canvas remains blank.


## Follow-on ideas, not implemented scope

The current image objects already allow deliberate side-by-side comparison. A later extension could pin an exact paragraph, cell/range or slide element using a stable source locator rather than a screenshot copy. Another could assemble a work brief from selected canvas evidence for an agent, after the permission-aware retrieval/runtime service exists. Neither should silently change recipients, sharing or uncertainty, or introduce a separate copy of project knowledge.

The implemented first pass and verification limits are recorded in `Canvas Use Results.md`.

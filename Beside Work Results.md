# Conversation beside work — implementation and review

October 29, 2026. The user selected “beside work is goood” after reviewing the joint chat/canvas alternatives. The application on port 4174 now implements that trial. Earlier statements that only audit documents changed are historical. This is not final visual acceptance, a selected production service or completion of the broader MVP.

Existing browser records migrate additively under the same storage key. Browser tests and populated screenshots use isolated contexts; the user's preview records were not populated or reset.

## What changed

- **Conversation and input stay together.** The one floating composer sits below open conversation history. A pointer/keyboard divider changes the column width, which persists locally. Channel/thread drafts and attachments stay isolated. Opening resources does not retarget messages. When history is closed, the composer remains below the working surface.
- **Write directly on Canvas.** Write on canvas creates a private canonical resource with paragraph, heading, list and checklist blocks. Enter inserts a block; Shift+Enter keeps a newline. The same source appears in Files and the private Graph folder, opens in the source reader and exports as Markdown. Edits from either view update the same resource; closing/reopening does not duplicate it. Writing checklists are personal document content, not extra project-goal records or jobs.
- **Content-specific presentation.** Writing, pins, images and the project plan have restrained native content treatment with movement/resize controls on hover or keyboard focus. Full document/browser/agent tools retain their roles. Fresh Canvas remains blank, with no hero, dashboard, title or zoom. The compact Goals utility and canvas plan use the existing goal IDs.
- **Explicit sourced actions.** Add to plan asks for the actual next action inline. One message can support several intentional actions; each submission has an identity and duplicate-submit guard. The message stays unchanged. Private messages cannot silently become shared goal sources.
- **Disclosures receive space.** Open work and Account use the left region with return/close behavior, rather than covering work. A temporary disclosure can replace history in that same region; its composer, recipient and drafts remain. Attachments expand within the composer; statuses use normal flow. Browser/OS-owned file/date dialogs are outside this placement claim.
- **Capacity preserves visible work.** Utilities and conversation resizing can reflow native content within its readable minimums. A compact placement pass handles crowded arrangements. If the request cannot fit, it is rejected with an explanation. New native content does not automatically shrink an existing full document/browser/agent tool. Actual narrow-window recovery retains records and restores prior object positions when space returns.
- **Inspection and utilities can coexist.** At sufficient width, reading a source retains Sources, Project agent, Goals, chat and Graph. Smaller layouts require room before opening the reader instead of universally replacing the utility stack. One document reader remains.
- **Identity rendering.** Message actor IDs can reference participant display names/photo URLs. Provided photos render, with fallbacks for absent/broken images; the interview record receives no fabricated portraits. Stable colored names also appear in search and pins. Narrow chat retains avatars. The actual account/contact/membership service remains unbuilt.
- **Recall and image consistency.** Closed pins search full text; visual captions and native writing are searchable. Image replacement uses a new immutable binary key before publishing metadata/pointer. A failed metadata save leaves the previous complete image intact after reload, rather than old dimensions describing new pixels. Stable visual identity remains.

## Try it

1. Open Conversations → `#product-direction`. Resize the history column and write a draft below it.
2. Select Write on canvas. Compose text, headings, lists or checklists in place.
3. Pin a message beside the writing. Use Add to plan, write a next action and create it. Another distinct action can cite the same message.
4. Open Project tools. Work stays visible or the app explains the capacity limit. Goals and the canvas plan show the same records.
5. Switch to Graph. Chat remains available; private writing appears in its private folder. Open/edit that same source. On a wide desktop, inspection and independent utilities coexist.
6. Close/reopen views, switch channels/threads and reload. Check source identity, drafts, recipients and geometry.

## Evidence and verification

- [Light: conversation, native writing, pin, plan and utilities](workstation/evidence/beside-work-light.png)
- [Dark: the same intentionally opened work](workstation/evidence/beside-work-dark.png)

The browser suite covers navigation, pointer/keyboard geometry, graph spring return, migration, privacy/drafts, local agent definitions and image behavior. New checks cover beside composer placement/persisted width, native writing across source views, disclosure non-overlap, multiple sourced actions, profile-image rendering at narrow width, failed-save image recovery, crowded 1280/1440 layouts and simultaneous inspection/utilities/chat.

Final verification: **all 42 browser scenarios passed in one complete run**, with no skipped/canceled cases. TypeScript/production build, Prettier and whitespace checks passed. Existing upstream Lucide `use client` bundler warnings remain. The first broader run exposed a stale account selector, an image-replacement assertion that sampled the old image before the asynchronous commit, and the 1280 native-import placement gap. Selectors/waits were corrected, native placement was repaired and the final complete suite was rerun. A profile assertion also originally mistook flex-item blockification for hidden content; it now checks visible image dimensions. Passing checks establish the exercised behavior, not product acceptance or server authorization.

## Limits

No actual accounts, human delivery, multiplayer, server permissions, canonical image sharing/indexing, executing/deployed agents, on-graph job telemetry or automatic context maintenance was connected. Working agents must still appear on Graph once the actual job/activity service exists; saved definitions do not fake that state. Native writing is a lightweight block editor, not a full Office engine or Notion database.

Named arrangements, revision/derivation history, scoped undo and whole-canvas export/restore, asset cleanup and authoritative sharing remain work. Immutable image keys fix the reproduced saved-metadata/pixels mismatch; local browser storage does not become a backup or complete revision service. Continue from the user's review of this actual implementation rather than replacing requested changes with audit-only cycles.

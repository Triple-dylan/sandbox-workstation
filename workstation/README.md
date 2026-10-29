# Workstation refinement revision

The user authorized implementing the researched refinement plan. Read `../Maturity Refinement Plan.md`, `../Maturity Refinement Results.md`, `../AGENTS.md` and the conversation record before continuing. This is a local interaction/configuration proof, not an accepted or completed MVP.

**Current known gaps:** read [the October 29 review](../Workstation%20Review%202026-10-29.md) before using the recovery/search claims below. Its isolated probes reproduce mismatched image pixels/metadata after an injected save failure, utility opening hiding active work, and full-text/caption search omissions. These remain unfixed. The review made no application changes.

## Run

Requires Node 22.12+ and npm:

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4174/>. Reuse the existing loopback server. Predev/prebuild snapshot four actual repository Markdown sources with content hashes; their generated copies retain stable source identities. The preview has no authentication and is not a production shared service.

## Navigation, composition and work

- **Canvas/Graph** are primary rail destinations, never generic windows. Fresh Canvas is blank working space. Graph retains anchored physics and full-surface rendering without the decorative center glyph or application zoom.
- **Conversations** reveals left navigation/history. Back returns to the list. Channels, private conversations and retained unverified DM drafts have distinct audiences. New private chat opens an identified draft without naming paperwork. People search explains the missing identity service; it does not pretend an arbitrary name is a verified contact.
- Message search finds actual local transcript content and returns to its parent discussion. Replying retains parent context; main/thread drafts and attachments stay separate across navigation/reload. Reading offsets survive navigation within the browser session. A jump to new content avoids automatic scroll takeover when reading older messages.
- The floating composer uses one neutral focus boundary. The paperclip attaches accessible source references; a reference can be inspected without sending. A private local document cannot be attached to a channel/DM draft without sharing first. Opening content never retargets messages. Sending records a local-only message; no person/agent receives it. Account includes the Enter versus Command/Control+Enter preference and appearance. IME composition is respected.
- **Files** reveals navigation without creating work. Selecting a folder/file reuses one inspector; closing it restores prior utilities. Place document on canvas deliberately moves the single reader to a bounded work object.
- **Project tools** reveals independent content-sized Sources/context, Project agent and Goals. They can be visible concurrently. There is no empty full-height utility column. Goals retain completion and optional simple dates.
- **Open…**, Command/Control+K or empty-Canvas context menu open the same anchored resource/action search. Search existing resources or choose New document/New agent/Edit project agent directly. Escape cancels and restores focus. Applicable canvas arrangement actions use the same command routing. Browser connection is a searchable diagnostic for the unavailable service, not a working authenticated browser.

## Documents and agents

New document creates a private local record with stable ID, editable body/title and Markdown download. It appears under Private documents in the local graph. Repository sources remain read-only Markdown snapshots. They are not duplicated when opened. These surfaces are not full-fidelity Word/Sheets/Slides engines.

Agent editing supports local definitions, purpose/instructions, private/project scope, inherited context preference and private autonomy. The dedicated project definition retains project scope. Save version preserves an immutable configuration snapshot; Version history can restore an older version into the editable draft without changing that history. Export downloads the definition/version record. Test/deploy controls explain the missing runtime and remain unavailable. Local saving is not publishing to a live runtime, deployment or execution.

## Direct canvas content

Pin a message from its conversation to keep source-linked evidence on Canvas. Open original returns to the source discussion. Add to plan creates/reuses a goal with its source link; private pins cannot enter the shared project plan without sharing. Open project plan from work search or the Goals module to edit, reorder, date and complete the same goal records used by the utility.

Add visual reference opens the image chooser. Dropping or pasting images onto Canvas uses the same pipeline. PNG/JPEG/WebP/GIF up to 12 MiB remain private on this browser. Actual image Blobs persist in IndexedDB with editable title/caption metadata in local state. Replace/restore retains identity, but replacement is not atomic with metadata saving. Closed pins/images can be reopened through work search; only the pin's first 65 characters and image title/filename are searched. Closing is not source deletion. Invalid image validation preserves existing work; metadata-save failure can still leave a mismatched replacement. Read `../Canvas Use Results.md` and the October 29 review for evidence and limits.

## Bounded work and recovery

Browser and agent-editing objects retain separate roles from the single document viewer. Drag a header for a placement preview; only valid non-overlapping drops commit. Escape cancels. Drag near a neighboring edge to snap that pair; unrelated objects stay put. Corner handles and header/resize arrow keys support bounded resizing/movement. Focus/restore preserves the arrangement. Work below short utilities remains usable.

Save/restore arrangement is one browser-local geometry snapshot, not named working contexts. Lack of capacity retains records, but can automatically focus the last-added object and hide the active task. Narrow-window recovery restores object positions when room returns; navigation hidden by the responsive layout does not automatically reopen. Drafts and records survive the exercised resize flows. Account does not cycle fake users.

## Checks and limits

```sh
npm run build
npm run format:check
npm test
```

Tests use isolated browser contexts and do not reset the user's preview. They cover full Graph bounds/anchor, no rail-driven work creation, content-sized utilities, viewer reuse, drafts/recipients, placement/cancel/recovery, source retry, IME/shortcut/focus, command cancellation, document persistence, private-reference handling, agent versions and conversation search. See the root results document for final outcomes and captures. Passing tests are not visual acceptance or server authorization.

The same `workstation-layout-proof-v1` key stores version-2 view state plus additive local documents, agent definitions/versions, thread selection and send preference. Existing conversation/message/draft/attachment/goal/appearance records and legacy layout data remain. Old split trees are never restored as windows. Reading positions are session-local, not server records.

No accounts/contact lookup/delivery, authoritative access enforcement, shared editing/presence, retrieval, approvals/jobs/schedules, executing agents, automatic context maintenance, browser session or native Office engine is connected. `/materials` remains a visual specimen; its static examples are not production workflows. No provider or paid deployment service was selected.

`main.tsx` owns navigation and command/record updates; `Composer.tsx`, `Conversation.tsx`, `WorkActions.tsx` and `AgentEditor.tsx` own their respective flows; `agents.ts` defines local definition/version records; `state.ts` migrates persistence; `canvas-layout.ts` constrains deliberate work objects. Whole-workspace Dockview/Gridview remains removed.

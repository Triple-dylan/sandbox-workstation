# Workstation refinement revision

The user authorized implementing the researched refinement plan. Read `../Maturity Refinement Plan.md`, `../Maturity Refinement Results.md`, `../AGENTS.md` and the conversation record before continuing. This is a local interaction/configuration proof, not an accepted or completed MVP.

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

## Bounded work and recovery

Browser and agent-editing objects retain separate roles from the single document viewer. Drag a header for a placement preview; only valid non-overlapping drops commit. Escape cancels. Drag near a neighboring edge to snap that pair; unrelated objects stay put. Corner handles and header/resize arrow keys support bounded resizing/movement. Focus/restore preserves the arrangement. Work below short utilities remains usable.

Save/restore arrangement is browser-local. Lack of capacity retains existing work and explains the outcome. Narrow-window recovery preserves object positions and restores them when room returns. Navigation/inspection can hide to maintain readable minimums; drafts and records survive. Account does not cycle fake users.

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

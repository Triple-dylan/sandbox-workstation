# Current state

_Updated 2026-11-11._ What is being built and why is in `docs/PLAN.md`.

## Open it

- **No setup:** `npm run build:inpage` (in `workstation/`) writes `dist-inpage/workstation.html`, one page with the client and the real server inside it. It opens on a labelled example project. One person at a time; data stays in that browser.
- **Several people:** `npm ci && npm start` in `workstation/`, then http://127.0.0.1:4174. `HOST=0.0.0.0 npm start` lets others on a trusted network join.
- **Live agents.** In the published in-page build, agents answer with Claude through the page itself, on the viewer's account, with no key stored. On the local server they use the key in the root `.env` (`OPENAI_API_KEY`). Where neither is available they fall back to scripted replies and say so in the message.

## What works

**Spaces.** A private Personal space for each person, plus shared projects. Every item is private or shared; sharing changes the same item. One access check on the server governs what any person or agent can see.

**Board (canvas).** Click empty space and type. Objects: notes, documents, images (paste, drop or pick), a plan, and pinned messages. Everything moves and resizes on a 24px grid without overlapping. Each person has their own arrangement of a shared board; content is shared, position is not. Removing something offers Undo. Private items on a shared board carry a dashed "Only you" outline and are invisible to others. Opening a document from the board fills the work area and folds the board into a shelf beside it; closing returns to the board.

**Graph.** The CampaignOS/DropDeployment constellation: the space pinned at the centre, folders on a tilted ring, files orbiting their folder, gentle simmer. Click a folder to focus it and dim the rest; click a document to read it beside the graph. Private items are dashed, with a legend. Dotted relations join items that mention each other. An Everything view shows every space you can see as a hub, private ones dashed; clicking a space steps into it. People and working agents appear at the item they are touching.

**Agents.** A roster: shared project agents and private personal agents, each a `thinking-orbs` orb in its own colour whose animation is its real job state. Selecting one shows its work and what it last said, then its name, colour, purpose and standing instructions, all editable. New agents are made from Create or by asking an agent; a person approves the second route. Agents can also propose documents and plan steps, and can be retired. Asking an agent while an item is selected sends that item along as visible context. Agents keep the project orientation current, may speak unprompted in shared conversations, and need approval for consequential shared changes.

**Plan and goals.** Ordered steps with an owner, an agent and a date, reorderable. The board's plan and the Goals card are the same records. A pinned message can become a step and keeps its link to the message.

**Conversation.** One message bar with an explicit audience: channels, threads, direct messages, private agent chats, asking or delegating to any agent, and discussing a selected item. History opens beside the work. The newest unread reply shows above the message bar. Any message can be pinned to the board.

**Create.** One sheet beside the rail: document, image, plan, folder, channel, agent, project.

**Find.** Ctrl or Cmd K: items, plan steps, messages, people and agents across every space you can see.

## Known gaps

- The preview is one person at a time; live multi-person use needs the local server. The example teammates are not live.
- Routine context upkeep (the orientation document) uses the local template, not a model, so it never spends usage on a timer.
- Board images are stored inline and resent with every update; fine locally, not for production.
- Documents edit as Markdown text, not a rich editor. No sheets, slides or browser surfaces.
- No real accounts or hosting. Sign-in is "pick a name".
- The graph's relations come from one item mentioning another by title; there are no typed links yet.
- No Claude runtime on the local server yet (OpenAI only there).

## Checks

From `workstation/`: `npm run typecheck`, `npm run format:check`, `npm test`, `npm run build && npm run test:e2e`. Set `CHROMIUM_PATH` to run the browser test with an existing Chromium.

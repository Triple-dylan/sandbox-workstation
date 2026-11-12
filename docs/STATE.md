# Current state

_Updated 2026-11-12._ What is being built and why is in `docs/PLAN.md`.

## Open it

- **No setup:** `npm run build:inpage` (in `workstation/`) writes `dist-inpage/workstation.html`, one page with the client and the real server inside it. It opens on a labelled example project. One person at a time; data stays in that browser.
- **Several people:** `npm ci && npm start` in `workstation/`, then http://127.0.0.1:4174. `HOST=0.0.0.0 npm start` lets others on a trusted network join.
- **Live agents.** In the published in-page build, agents answer with Claude through the page itself, on the viewer's account, with no key stored. On the local server they use the key in the root `.env` (`OPENAI_API_KEY`). Where neither is available they fall back to scripted replies and say so on the message.

## The structure

**Left: one list.** The space (shared or only you) with a switcher, Graph, Catch up, pages by folder with their type, channels, then people and agents with where they are. Find and New page at the bottom.

**Middle: one page, or two side by side.** Anything can be opened beside anything (Alt-click in the list, or the button in a page's header). In a narrow window the two become tabs and the list becomes a drawer.

**Bottom: your own agent's bar.** Private to you, on every screen. A label says what it will look at ("This page", "2 selected", "Both pages", "Whole space"), worked out from what is on screen. Answers open above the bar with the pages they came from. It can hand work to one of the space's agents, which then answers in the same private conversation. Any answer can be saved as a private page or put into the reply box of the conversation on screen for you to send. On a conversation page it shrinks to "Ask your agent".

## Pages

- **Document.** Edited in place, saved as you type, stored as Markdown, with history. Select text to Comment, Ask an agent, or Highlight. Comments sit in the margin level with their text, take replies and are resolved. Asking a space agent gets a suggested edit with Accept and Decline; asking your own agent answers privately in the bar.
- **Sheet.** Rows and columns with `=SUM(B2:B5)`, `AVERAGE`, `MIN`, `MAX`, `COUNT` and arithmetic. Each cell saves on its own, so two people can edit at once. Select rows to share them live in a conversation.
- **Deck.** Slides with a title and text, reorder, and a full-screen Present.
- **Canvas.** Text, sticky notes, shapes, sections, arrows, pictures, the plan, and any page placed as a live card. Drag, resize, marquee-select, comment on a piece. Everyone on the canvas sees the same arrangement and each other's pointers. What you select is what your agent is asked about; a page an agent drafts for the canvas appears on it with Keep and Discard.
- **Every page has its own feed** underneath ("On this page"), seen by whoever can open the page.
- **Sharing.** A page is shared with the space or private. A private page can be opened to named people or agents. Agents suggest; a person accepts.

## Conversations

Channels, direct messages and conversations with an agent are pages too. Threads sit under messages; reactions; pinned pages along the top of a channel; a page or rows of a sheet inside a message stay live. Addressing an agent is always deliberate (the @ button or `@Name`).

## Graph

Your own view of what you can see in a space, private and shared, with the CampaignOS/DropDeployment physics. Filter by kind, "Only mine", "Changed this week", "Since I was last here"; save a view or a question. Choosing a page describes it at the side with Open beside. Asking your agent lights the pages the answer came from and dims the rest. An Everything view shows every space.

## Catch up

A private page per space: what needs you (suggestions waiting for a yes, comments on your pages, your plan steps, unread direct messages), what changed since you were last here, and what is quiet. Your agent writes it up on request.

## Known gaps

- The preview is one person at a time; live multi-person use needs the local server. The example teammates are not live.
- Two people typing in the same document or the same slide at once: the last save wins. Sheets do not have this problem.
- Catch up's lists are computed from records; the written summary is on request so it never spends usage on a timer. The orientation page is kept by a local template for the same reason.
- Pictures are stored inline; fine locally, not for production.
- Saved graph views and questions live in the browser, not on the server.
- No real accounts or hosting. Sign-in is "pick a name".
- No Claude runtime on the local server yet (OpenAI only there).

## Checks

From `workstation/`: `npm run typecheck`, `npm run format:check`, `npm test`, `npm run build && npm run test:e2e`. Set `CHROMIUM_PATH` to run the browser test with an existing Chromium.

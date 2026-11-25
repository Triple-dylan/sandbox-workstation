# Current state

_Updated 2026-11-18._ What is being built and why is in `docs/PLAN.md`.

## Repository status (2026-11-24)

`main` holds the current product (the Nov 11–18 rebuild). Other branches:

| Branch | What | Status |
|---|---|---|
| `archive/local-codex-cursor-nov7` | Nov 6–7 local work: gpt-6-luna runtime, Google sign-in, MVP plan, product corrections, deployment notes. Also carries the history of the Nov 5–6 `cursor/*` branches. | Preserved, not merged. Its gpt-6-luna runtime and Google sign-in are now rebuilt on `main`; the rest (MVP plan, product corrections) is reference only. |
| `cursor/agent-character-options` | Standalone page comparing four agent character directions. | Kept until the Orb choice is settled. |

## Open it

- **No setup:** `npm run build:inpage` (in `workstation/`) writes `dist-inpage/workstation.html`, one page with the client and the real server inside it. It opens on a labelled example space: a go-to-market launch run across product, product marketing and marketing (an invented product and people). One person at a time; data stays in that browser.
- **Several people:** `npm ci && npm start` in `workstation/`, then http://127.0.0.1:4174. `HOST=0.0.0.0 npm start` lets others on a trusted network join.
- **Live agents.** In the published in-page build, agents answer with Claude through the page itself, on the viewer's account, with no key stored. On the local server they use the key in the root `.env` (`OPENAI_API_KEY`). Where neither is available they fall back to scripted replies and say so on the message.

## The structure

**Left: one list.** The space (shared or only you) with a switcher, Graph, pages by folder with their type, channels, then people and agents with where they are. A page changed by someone else since you last looked is bold; a count marks suggestions and comments waiting on you there. Find and New page at the bottom.

**Middle: one page, or two side by side.** Anything can be opened beside anything (Alt-click in the list, or the button in a page's header). The line between the two is a handle: drag to resize, double-click to even out, and a control on it swaps sides. In a narrow window the two become tabs named after the pages, each with its own close, and the list becomes a drawer.

**Right: your own agent's rail.** Private to you, on every screen; » or ⌘J folds it to a slim strip with a dot when an answer is waiting. It says what it is reading ("This page", "2 selected", "This channel", your selection), offers a few one-click asks for what is on screen, shows what it is working on with a Stop, and @ brings in one of the space's agents to answer you privately. Answers point at the text they are about (click to see it on the page) and can be shared, turned into a suggested edit, put on the board, used as your reply or saved as a private page. Sharing offers the best places first, lights the place you hover, says whose agent it came from, keeps only sources everyone there can open, and can be undone for ten minutes. On narrow windows the rail lies over the page and starts folded.

## Pages

- **Document.** Edited in place, saved as you type, stored as Markdown, with history. Full width. Select text to Comment, Ask an agent (your rail, about that text), or Highlight. A comment is a small mark with faces beside its line that opens on click; it takes replies, is resolved, and can ask a space agent to answer where everyone sees it, which gets a suggested edit with Accept and Decline. The page's conversation is at its end; the header shows when people are talking.
- **Sheet.** Rows and columns with `=SUM(B2:B5)`, `AVERAGE`, `MIN`, `MAX`, `COUNT` and arithmetic. Each cell saves on its own, so two people can edit at once. Select rows to share them live in a conversation.
- **Deck.** Slides with a title and text, reorder, and a full-screen Present.
- **Canvas.** Text, sticky notes, shapes, sections, arrows, pictures, the plan, and any page placed as a live card. Drag, resize, marquee-select, comment on a piece. Everyone on the canvas sees the same arrangement and each other's pointers. What you select is what your agent is asked about; a page an agent drafts for the canvas appears on it with Keep and Discard.
- **Every page has its own feed** underneath ("On this page"), seen by whoever can open the page.
- **Sharing.** A page is shared with the space or private. A private page can be opened to named people or agents. Agents suggest; a person accepts.

## Conversations

Channels, direct messages and conversations with an agent are pages too. Every shared space has a main chat, #general, pinned first in the list. Threads sit under messages; reactions; a "New since you were here" line; any message can be marked Decided, which agents treat as settled; pinned pages along the top of a channel with what is happening on each, then the pages people have brought up; a page or rows of a sheet inside a message stay live, and the rows open the sheet beside at those rows, lit. A shared answer says whose agent it came from. Addressing an agent is always deliberate (the @ button or `@Name`).

## Graph

Your own view of what you can see in a space, private and shared, with the CampaignOS/DropDeployment physics. Filter by kind, "Only mine", "Changed this week", "Since I was last here"; save a view or a question. Choosing a page describes it at the side with Open beside. Asking your agent lights the pages the answer came from and dims the rest. An Everything view shows every space.

## One open surface

The list, the page and the bar are not boxed off from each other: no frames or separator lines, only a hairline between two pages side by side. A space opens on its work (its canvas, else a page, else a channel), not on a summary. Each pane lays itself out for the room it has, and the canvas refits as the window changes until you zoom by hand.

## Added 2026-11-13

- **Bringing things in.** Drop files anywhere, use the upload button above the page list, or paste text. Transcripts (.vtt, .srt, or "Name: words" text) and text files become documents, CSV becomes a sheet, Word becomes a document, PowerPoint becomes a deck, pictures become assets. Each keeps a note of the file it came from, and agents can draw on it at once.
- **Assets and archive.** Assets are pages; the graph filters to them. Archiving takes a page out of the list and the live graph and out of agents' working context; the graph's Archive view shows it and brings it back.
- **Agent builder and skills.** New agent starts with who can use it (shared with the space, or private to you) and says what that means. A skill is a named way of doing one kind of job (when to use it, the steps); skills are shared with a space or private, are given to agents on their page, and an agent can propose one for itself ("remember how to …") for a person to approve. Agents carry a shared or private mark everywhere.
- **Agent base.** Agents read the passages ranked most relevant to the request (BM25 over pages split at headings) plus a short directory, instead of the opening of every page. An identical question about unchanged pages is answered from a ten-minute cache. Prompts put the steady parts first so provider prefix caching applies.
- **Text tools.** Formatting on selected text, more toolbar actions (strikethrough, code, divider, undo, redo), and "/" on an empty line to insert a block.
- **Quick actions.** Find (⌘K) also does things; right-click a page or a canvas piece; shortcuts are listed under ⌘/.
- **Settings.** Appearance, text size, spacing, accent, and whether the list stays shown.
- **Nothing in the frame scrolls but the page.** A hard sideways scroll on the canvas can no longer move the whole app; feeds and panels shape to their content and hand off to a page beside when there is more.
- **Web app groundwork.** See `docs/WEBAPP.md`.

## Changed 2026-11-13 (later)

- **Nothing is docked over a page.** The agent bar floats with no band behind it. A document's conversation is part of the document, after its text. For sheets, decks, canvases and assets it opens beside from "Talk" in the header.
- **Live windows on a canvas.** Drag any page or channel from the list onto a canvas and it becomes a live, shapeable window everyone sees: documents render in full, sheets edit in place, decks page through, a channel shows its latest messages and can be answered there. Screen capture has been removed.
- **Conversations sit beside what they are about.** A channel shows its resources (the pages it works from), pages brought up in it, the agents in it with an Ask button, and the people. Pages named in a message show as chips under it.
- **Agents at work are visible.** Everyone has a prime agent, shown beside them in the list. Teammates see when any agent is working and on which page (if they can open it), never what was asked. It shows in the list, by the person, and in the page header.
- **Things connect.** Drag a page from the list onto the middle to open it beside, onto a canvas to place it, onto a message to send it live, or onto a channel's resources. A page's header lists the channels and canvases it is used in.

## The bar, reworked 2026-11-13

One bar with three jobs. **Who you ask:** your own agent by default, or any of the space's agents; whichever you pick answers only to you. **What it reads:** a button that says "reads This page" (or the selection, both pages, the whole space, or nothing but your words) and lets you change it; drag a page onto the bar to add it. **What it does:** one-click suggestions for what is on screen, the chosen agent's skills, and "/" for actions such as new page, bring in files or settings. The conversation so far opens from the history button.

## Added 2026-11-24

- Every agent runs on `gpt-6-luna`; there is no model setting.
- Your agent's conversation opens only in the rail; anything that tried to open it in the middle opens the rail instead.
- Agent spend guardrails: daily token allowances per space (100k) and per person (50k) on top of the server-wide limit, and at most 10 agent requests a minute per person. Background upkeep counts against its space. Set by `AGENT_SPACE_DAILY_TOKENS`, `AGENT_PERSON_DAILY_TOKENS`, `AGENT_REQUESTS_PER_MINUTE`.
- Google sign-in when `GOOGLE_CLIENT_ID` is set: verified Google accounts only, new people still need an invite link or the setup code, and the same account always returns as the same person. Not yet tried against a real Google client ID; the join screen and its security policy were checked in a browser with a placeholder ID.

## Known gaps

- The preview is one person at a time; live multi-person use needs the local server. The example teammates are not live.
- Two people typing in the same document or the same slide at once: the last save wins. Sheets do not have this problem.
- The orientation page is kept by a local template, so it never spends usage on a timer.
- Pictures are stored inline; fine locally, not for production.
- Saved graph views and questions, and which pages you have looked at, live in the browser, not on the server.
- No real accounts or hosting yet; `docs/WEBAPP.md` lists what a hosted version still needs. PDF import is not built. Text size changes the base size; some small labels stay fixed.
- No Claude runtime on the local server yet (OpenAI only there).

## Checks

From `workstation/`: `npm run typecheck`, `npm run format:check`, `npm test`, `npm run build && npm run test:e2e`. Set `CHROMIUM_PATH` to run the browser test with an existing Chromium.

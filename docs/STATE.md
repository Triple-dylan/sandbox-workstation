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
- **Live agents.** In the published in-page build, agents answer with Claude through the page itself, on the viewer's account, with no key stored. On the server they use `OPENAI_API_KEY`. Without a key, agents say they are not connected and answer nothing; over a daily allowance they say so and answer nothing. No scripted reply stands in anywhere.

## The structure

**Left: a thin rail of spaces, and the list of the one picked.** The thin rail holds your private space (a lock) at the top, then each workspace you are in (its initials, a mark at the edge when something is unread, @ when you were mentioned), a + to start or join a workspace (the form opens at the top of the list), and your picture at the bottom for settings, shortcuts and sign out. The list beside it shows the picked space: its name, its member count (opens People in the list: who is here, message anyone, invite link), then Find and the Graph button beside it. Then **Chats** (general, channels, direct messages), **Pages** (pinned first, then the 8 most recent, "Show all") and **Agents** (by name, with what each is doing). Each part has a + on hover that opens its form right there in the list. A page changed by someone else since you last looked is bold; a count marks suggestions and comments waiting on you there. While you work on a page the list steps aside; resting the pointer on the thin rail slides it out over the page and it goes when the pointer leaves. The button beside the space's name (or ⌘\\) keeps it open; it then stays until you hide it. Settings can also keep it always shown or only at the edge. In a narrow window the rail and list come out together as one drawer.

**Middle: one page, or two side by side.** Anything can be opened beside anything (Alt-click in the list, or the button in a page's header). The line between the two is a handle: drag to resize, double-click to even out, and a control on it swaps sides. In a narrow window the two become tabs named after the pages, each with its own close, and the list becomes a drawer.

**Right: your own agent's rail.** Private to you, on every screen; » or ⌘J folds it to a slim strip with a dot when an answer is waiting. It says what it is reading ("This page", "2 selected", "This channel", your selection), offers a few one-click asks for what is on screen, shows what it is working on with a Stop, and @ brings in one of the space's agents to answer you privately. Answers point at the text they are about (click to see it on the page) and can be shared, turned into a suggested edit, put on the board, used as your reply or saved as a private page. Sharing offers the best places first, lights the place you hover, says whose agent it came from, keeps only sources everyone there can open, and can be undone for ten minutes. On narrow windows the rail lies over the page and starts folded.

## Pages

- **Document.** Edited in place, saved as you type, stored as Markdown, with history. Full width. Select text to Comment, Ask an agent (your rail, about that text), or Highlight. A comment is a small mark with faces beside its line that opens on click; it takes replies, is resolved, and can ask a space agent to answer where everyone sees it, which gets a suggested edit with Accept and Decline. The page's conversation is at its end; the header shows when people are talking.
- **Sheet.** Rows and columns with `=SUM(B2:B5)`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, the conditional `SUMIF(S)`, `COUNTIF(S)` and `AVERAGEIF(S)` (conditions like `"North"`, `">500"`, `"<>East"`), and arithmetic. Each cell saves on its own, so two people can edit at once. Select rows to share them live in a conversation. Drag or Shift-select a block of cells and Ask beside it puts the question to your agent about those cells; the agent gets exactly those cells, read fresh from the sheet, as a table with its column names. Agents suggest sheet changes cell by cell (before and after) for a person to Apply. Choosing a block offers **Pivot, Sort, Filter and Total** in a line under the toolbar: a pivot is live `SUMIFS`-style formulas placed beside the data (one or two groups, optionally spread across a column, with totals); a filter hides rows for everyone and shows a bar with Clear; ⌘A takes the block around the cell first. Each runs through `shared/sheetOps.ts` and undoes with ⌘Z.
- **Deck.** Slides with a title and text, reorder, and a full-screen Present.
- **Canvas.** Text, sticky notes, shapes, sections, arrows, pictures, the plan, and any page placed as a live card. Drag, resize, marquee-select, comment on a piece. Everyone on the canvas sees the same arrangement and each other's pointers. What you select is what your agent is asked about; a page an agent drafts for the canvas appears on it with Keep and Discard.
- **Every page has its own feed** underneath ("On this page"), seen by whoever can open the page.
- **Sharing.** A page is shared with the space or private. A private page can be opened to named people or agents. Agents suggest; a person accepts.

## Conversations

Channels, direct messages and conversations with an agent are pages too. Every shared space has a main chat, #general, pinned first in the list. Threads sit under messages; reactions; a "New since you were here" line; any message can be marked Decided, which agents treat as settled; pinned pages along the top of a channel with what is happening on each, then the pages people have brought up; a page or rows of a sheet inside a message stay live, and the rows open the sheet beside at those rows, lit. A shared answer says whose agent it came from. Addressing an agent is always deliberate (the @ button or `@Name`).

## Graph

Your own view of what you can see in a space, private and shared, with the CampaignOS/DropDeployment physics. Filter by kind, "Only mine", "Changed this week", "Since I was last here"; save a view or a question. Choosing a page describes it at the side with Open beside. Asking your agent lights the pages the answer came from and dims the rest. An Everything view shows every space. Agents at work circle the page they are working on (a chat with no page: the space's centre); hovering one says what it is doing, clicking opens its chat.

## One open surface

The list, the page and the bar are not boxed off from each other: no frames or separator lines, only a hairline between two pages side by side. A space opens on its work (its canvas, else a page, else a channel), not on a summary. Each pane lays itself out for the room it has, and the canvas refits as the window changes until you zoom by hand.

## Added 2026-11-13

- **Bringing things in.** Drop files anywhere, use the upload button above the page list, or paste text. Transcripts (.vtt, .srt, or "Name: words" text) and text files become documents, CSV becomes a sheet, Word becomes a document, PowerPoint becomes a deck, pictures become assets. Each keeps a note of the file it came from, and agents can draw on it at once.
- **Assets and archive.** Assets are pages; the graph filters to them. Archiving takes a page out of the list and the live graph and out of agents' working context; the graph's Archive view shows it and brings it back.
- **Agent builder and skills.** New agent starts with who can use it (shared with the space, or private to you) and says what that means. A skill is a named way of doing one kind of job (when to use it, the steps); skills are shared with a space or private, are given to agents on their page, and an agent can propose one for itself ("remember how to …") for a person to approve. Agents carry a shared or private mark everywhere.
- **Agent base.** Agents read the passages ranked most relevant to the request (BM25 over pages split at headings) plus a short directory, instead of the opening of every page. An identical question about unchanged pages is answered from a ten-minute cache. Prompts put the steady parts first so provider prefix caching applies.
- **Text tools.** Formatting on selected text, more toolbar actions (strikethrough, code, divider, undo, redo), and "/" on an empty line to insert a block.
- **Quick actions.** Find (⌘K) also does things; right-click a page or a canvas piece; shortcuts are listed under ⌘/.
- **Settings.** Appearance, text size, spacing, accent, and whether the list steps aside on pages, is always shown, or only comes out at the edge.
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
- Answer checks: agents answer in a strict JSON shape (falls back to plain JSON mode if the model refuses it; gpt-6-luna accepts it). Each answer is checked against what the agent was given: cited pages must exist, a proposed edit must quote text that is really on the page, a handoff must name a real colleague, and a question must get a reply. A fixable problem gets one retry with the problem spelled out; anything still wrong is left out and the reply says so.
- Live quality checks: `npm run eval` in `workstation/` runs six realistic cases against the real model and scores them (grounded numbers and sources, finding by meaning, admitting what is missing, exact edits, honouring decided messages, no private text in channels). Needs `OPENAI_API_KEY`; not part of CI. First run 2026-11-24: 6/6.
- Your agent's conversation opens only in the rail; anything that tried to open it in the middle opens the rail instead.
- Meaning-based search: passages are embedded with `text-embedding-3-small` when an OpenAI key is set, stored until the page changes, and merged with keyword ranking. Search only; answers are gpt-6-luna.
- Spend safety nets: one agent call is about 3-4k tokens. Daily limits of 10M for the server, 3M per space and 1M per person (about 300 questions), and at most 20 agent requests a minute per person. They exist to stop a runaway loop or a surprise bill, not to ration use. Background upkeep counts against its space. Set by `AGENT_SPACE_DAILY_TOKENS`, `AGENT_PERSON_DAILY_TOKENS`, `AGENT_REQUESTS_PER_MINUTE`.
- Routines: an agent can do a job on a schedule (every day, weekdays, or weekly at a time), set on its page. Your own agent answers you in the rail; a workspace agent posts in the channel chosen. Checked twice a minute; each runs once per occurrence.
- Agent page: one screen with setup (what it is for, how it should work, look) on the left and routines, skills and recent work on the right. Fields save when you leave them.
- Less clutter: graph filters behind one Filter button; the rail's reads menu has only real choices; "Attach" brings a file in as a private page for the question.
- Welcome and workspaces: one sign-in page for every way in (Google, a name on a local server, a sign-in link) that says what the product is and names both kinds of agent, then, for someone in no workspace, a choice to start one they own or join one with an invite link. The + in the thin rail offers both at any time ("New workspace", "Join with a link"). Anyone with a verified Google account may sign up; `WORKSPACE_CREATORS` can limit who starts workspaces.
- Google sign-in when `GOOGLE_CLIENT_ID` is set: verified Google accounts only, new people still need an invite link or the setup code, and the same account always returns as the same person. Not yet tried against a real Google client ID; the join screen and its security policy were checked in a browser with a placeholder ID.

## Added 2026-11-26

- Graph: choosing a page opens a preview panel beside the graph with the whole page rendered, and hovering a page shows its first lines. Checked in the browser with seeded example pages.
- Live co-editing of documents: typing merges as it happens, each document's shared history is kept in the database, and the saved Markdown is the merged text. Checked locally with two people in two tabs, both inserting into the same line at the same instant: both edits kept in both editors and in the saved page. Tested on the server: one seeder, merging, keeping history across a restart, and starting over after an accepted suggestion.
- Sheets: typing a row with Tab and then pressing Enter starts the next row under the cell where the Tabs began, as in Excel and Google Sheets. Tab past the last column adds a column instead of staying on (and overwriting) the edge cell. Checked in the browser on a new sheet.
- The one-file preview builds again (`npm run build:inpage`). Server-only libraries (Google sign-in, the shared browser and its address guard) are replaced by stand-ins in that build, which has neither. The file now declares UTF-8, so opened straight from disk it no longer shows "Â·" for "·". CI builds it on every PR so it can't break unnoticed again. Checked in the browser: it opens on the labelled example with no console errors.
- The workspace summary page reads properly without a model: each page in a line (sheets, decks and canvases named, not dumped as grids), the plan's open steps, messages marked Decided (and only those), questions asked, and the latest messages. It no longer says "project". Marking or unmarking a message Decided brings it up to date. Checked in the browser on a new workspace.
- Running a workspace: in People, its owner renames it (its agent and About page follow the new name), removes someone (they lose every page, chat and agent in it at once), or deletes it after typing its name. Anyone else can leave. Checked in the browser: add and remove a person, rename, delete as the owner, and leave as a member; tested on the server, including that non-owners can't do any of it and a removed person can't read or post.
- Asking about cells on a sheet offers asks that fit numbers (explain these numbers, check the maths, what is driving this, suggest a fix) instead of the ones for text. Checked in the browser.
- A chat with an agent opens on what it is for and how to reach it (here privately, @ in any chat, select on a page), and what it looks after, with a link to give it a page when it has none. Checked in the browser on a new Finance agent.
- The new-page form says in words what each icon makes ("Sheet · rows, columns and sums"), following the pointer. In People, the invite link shows when it expires, and New link asks first, since it stops the current link working. Checked in the browser.
- Faster first load: each kind of page (document, sheet, deck, canvas, graph, file, browser) downloads when one is first opened. The opening download fell from 1,284 KB to 587 KB (416 to 186 KB compressed); the document editor (608 KB) loads with the first document. Checked in the browser: each kind opens.

## Added 2026-11-25

- Agents open as chats: clicking one in the list opens your chat with it (your own agent: the rail); settings are the sliders button in its chat header or right-click.
- Shared browser: runs in the separate browser service (`browser-service/`), which the app connects to; sign-ins are kept in the app's database. Not deployed yet.
- Shared browser: New page → Browser. Searches Google by default (DuckDuckGo or Bing per page). Live screen, tabs, address bar (DuckDuckGo search), one driver with Take control, teammates' pointers, sign-ins kept per workspace. Agents read the open tab's text. Checked in the browser locally: DuckDuckGo results for a search, and clicking through on the stream. Tested: two viewers get the same frames, the driver rule, pointers, the private-address guard and proxy, and that a page body sent from outside is ignored. Each open workspace browser uses roughly 300–500 MB on the server and closes five minutes after the last person leaves; at most four workspaces at once.

- Sheets: Excel keys and clipboard, fill, undo, number formats, column widths, sort, keep row 1 in view, `.xlsx` in and out, CSV out. Checked in the browser: typing, Enter, Shift-select, paste of tab-separated text with a formula, undo, currency format, the column menu.
- Connectors: Google Sheets and Excel (OneDrive/SharePoint) links become live sheet pages, synced both ways. Tested end to end against a stand-in provider (sign-in, refresh, link every tab, edits out, changes in, link protection). Not tried against real Google or Microsoft accounts; needs `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` and the redirect addresses in `docs/WEBAPP.md`.
- Your private space is your agent's context: it reads each file you bring in and offers a page that organises it, in your private chat; it keeps "About you" (first under Pages, only you and it read it) from the private space's pages and your private chats; private chats in any workspace bring "About you" along, and workspace agents never get it. If the model can't be reached, the chat says so. "About you" is written from the private pages in full and from both sides of your private chats. Checked live with gpt-6-luna on 2026-11-26: a brought-in file became an offered page, "About you" recorded its decision, owners and deadline, and a private chat inside a workspace used both.
- Private chat: opens with a short explanation from Sandbox of what your agent is. Answers show what they read, answers to tap, fitting actions, Send to a teammate; follow-ups revise the waiting draft; suggested changes can be edited first, shown on the page, and (when made at once) undone.
- @ for people, with mentions marked in the conversation and the list.
- Agents look after pages: exact cell lines and model-judged lines; header "Ask Finance"; list and channel headers show what agents watch and where they listen. Checked in the browser: Finance said "Heads up on Q1 Budget: Total (B4) is now 5200, above 5,000." in the page feed.
- Approval levels per agent: ask first, small fixes with Undo, plan first.
- Not run against the live model yet: the evals need the OpenAI key's daily limit to reset.

## Known gaps

- The preview is one person at a time; live multi-person use needs the local server. The example teammates are not live.
- Two people typing on the same slide at once: the last save wins. Documents merge as people type (2026-11-26); sheets save cell by cell.
- The workspace summary page ("About …") is written by gpt-6-luna after changes when the server has an OpenAI key; the in-page build and the scripted stand-in use a fixed template instead.
- Pictures are stored inline; fine locally, not for production.
- Saved graph views and questions, and which pages you have looked at, live in the browser, not on the server.
- No real accounts or hosting yet; `docs/WEBAPP.md` lists what a hosted version still needs. PDF import is not built. Text size changes the base size; some small labels stay fixed.
- No Claude runtime on the local server yet (OpenAI only there).

## Checks

From `workstation/`: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build && npm run test:e2e`. Set `CHROMIUM_PATH` to run the browser test with an existing Chromium.

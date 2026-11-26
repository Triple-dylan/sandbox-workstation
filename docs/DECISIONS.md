# Decision log

Newest first. Confirmed by Dylan unless marked *assumed* or *open*.

## 2026-11-26

- **Agents wait out OpenAI's busy moments.** Dylan said yes to retrying after a test copy failed with OpenAI's per-minute limit (the key is shared). A rate-limited or 5xx call waits as long as OpenAI asks (or a growing pause) and tries again, up to 6 tries and 45 seconds; then the agent says plainly that OpenAI is busy, without account ids. Running out of credit is said at once, not retried. Search vectors retry the same way.
- *Assumed:* **The person who starts a workspace manages it.** Only they rename it, remove people, or delete it; anyone else in it can leave; they can't leave it themselves (they delete it instead), and there is no handing it over yet. All of this is in People (the member count), with an inline second click; deleting asks for the workspace's name. Removing someone keeps what they shared and their messages. Deleting closes the workspace to everyone at once, retires its agents and stops its invite links; like a deleted page, its rows stay in the database, unreadable, until a real purge is built (`WEBAPP.md` item 9).
- **pstack trimmed to 38 skills.** Dylan approved dropping 29 skills and 3 agents that duplicate Claude Code built-ins (`/code-review`, `/security-review`, `/simplify`, `/steward`), each other, or were niche (formal verification, TLA+ statecharts, benchmarking, parallel arenas). The 38 kept stay in `.claude/` so every harness has them; Claude sessions also reach them through Dylan's user-level resolver.
- **Documents are edited live together.** Dylan chose live co-editing as the next piece. Everyone's typing merges as it happens (Yjs, the standard library for this, with TipTap's collaboration extension); two people in the same line both keep their words. Each document's shared history is kept in the database and relayed by the app's server, no third-party service. The page's Markdown is still saved for agents, search and history, taken from the merged text. An accepted suggestion or a restored version replaces the shared history and open editors start again from it. Undo is per person.

## 2026-11-25

- **The shared browser runs as its own hosted service, never on the app's machine or anyone's computer.** Dylan, after Chrome had been installed and run on his Mac for the local copy: "wasnt aware we had local dependencies. not acceptable". Chrome now runs in `browser-service/` (its own Railway service, private network, secret in the address, with the connection guard). The app only connects to it (`BROWSER_SERVICE_URL`) and keeps each workspace's sign-ins in its own database. Without the service set up, Browser pages say so; nothing is launched locally.

- **Clicking an agent opens a chat with it; its settings are secondary.** Dylan: "clicking agents should bring you to a chat with them!! ... the god damn agent edit settings hsouldnt be the prime focus." Your own agent opens the rail; a workspace agent opens a one-to-one chat of yours with it (it answers without a tag, only you see it). Settings are the sliders button in that chat's header, or right-click in the list. A new agent opens on its chat.
- **The shared browser searches Google by default**, with DuckDuckGo and Bing as a choice per Browser page. Dylan: "lets not always force a redirect to duck duck." Google may show its "I'm not a robot" check to a browser run on a server; a person on the team ticks it, the app never does.

- **A shared browser in the workspace, on our own Chrome.** Dylan asked for "a duckduckgo implementation so teams can use one shared browser within the harness", rejected a reader-copy version ("not even relatively close to what I was suggesting"), and chose our own Chrome over Hyperbeam. A Browser page runs a real Chrome on the server, streamed live to everyone on the page; one person drives at a time and anyone can take control; teammates' pointers show on the screen; DuckDuckGo is the home page and the address bar's search. Sign-ins are kept per workspace and shared with everyone in it, and the page says so. Agents read the open tab. It is a normal, visible Chrome (on a virtual screen on the server), because DuckDuckGo and many other sites refuse headless Chrome. Every connection goes through a guard that refuses this machine and private networks; downloads are off.

- **Build the rest of the audit plan** (`docs/AUDIT-2026-11-25.md`, sections G, H, B3, C2–C4, E). Dylan: "go implement everything I said".
- **Sheets behave like Excel.** Arrows move, typing replaces, Enter or F2 edits, Shift extends, ⌘-arrows jump, Tab moves right, Delete clears, ⌘C ⌘X ⌘V with Excel and Google Sheets (tab-separated; formulas copied inside the app move the way Excel moves them, `$` fixes them), ⌘D and ⌘R fill, ⌘Z and ⌘⇧Z undo per person. Number formats (plain, 1,234.00, $1,234.00, 12%) and widths per column, sort by a column with row 1 kept, and "Keep row 1" in view. `.xlsx` in (every tab becomes a sheet; formats and a formula are kept where this app works it out the same as Excel, otherwise Excel's value is kept) and `.xlsx`/CSV out. *Assumed:* sorting keeps row 1 as the header.
- **Excel and Google Sheets connectors** (G1). Paste a Google Sheets or OneDrive Excel link under Pages, + → Linked: each tab becomes a sheet page here that people edit and agents read and propose changes to like any sheet. Edits go out to the original within a second; the original's changes come in when the page is opened, on Sync, and every two minutes. Each person connects their own Google or Microsoft account in Settings; a linked sheet reads and writes through the account of whoever linked it, and only the connector can set a sheet's link. Needs app keys on the server (`GOOGLE_CLIENT_SECRET`; `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`). *Open:* not yet tried against real Google or Microsoft accounts.
- **Your private chat** (H). Answers offer what fits: a suggested change shows Apply, Edit first, Show me and Decline instead of Share and Save; "Save as a page" only for document-length answers; a question back offers up to three answers to tap. Each answer says what it read (pages, channels, pinned pages) and you can add a page for next time. A follow-up ("make it 3,800 instead") revises the waiting draft, which is marked replaced. "Send to…" drafts the answer to a teammate in a direct message for you to send. An answer from another agent your agent asked reads "Finance answered your agent".
- **@ tags people as well as agents** (B3), people first. A message that tags you is marked, and the list shows `@` on the conversation. Agents may tag a person by name.
- **Agents look after pages** (C3, E). On an agent's page, "Looks after" takes a page and a line ("say something when the total in B4 goes above 5000"). A line about one cell is checked exactly and said once when crossed and once when back, in the page's feed; any other line is judged by the model when the page changes, at most every ten minutes. A personal agent tells its owner privately instead. The list shows "watching Q1 Budget", the page header has "Ask Finance" (opens your rail with @Finance), and a channel's header names the agents listening.
- **Approval levels per agent** (C4): "Ask me first" (default), "Small fixes without asking" (up to three cells or a short line are made at once, with Undo), "Show the plan first" (multi-step work is listed and waits for a go-ahead). Any suggested change can be edited before it is accepted.

## 2026-11-24

- **GitHub is the project's record, not any harness.** Work had drifted into a Claude cloud branch, a published preview page and 44 uncommitted local files, and the chat history behind it was not findable. From now on everything that matters is committed and pushed, `main` is the source of truth, and every harness (Claude Code, Codex, Cursor) follows the same `AGENTS.md`. Published pages are previews only.
- **Never put a co-author tag or AI attribution on anything on GitHub.** Hard rule; see `AGENTS.md`.
- **Agents run on gpt-6-luna.** Dylan: "GPT Luna prefferably. but we do want some cacheing and guardrail optimizations within the harness and RAG to support the models." Every server-side agent uses `gpt-6-luna`; the `OPENAI_MODEL` setting is removed. Caching, guardrails and retrieval are strengthened in the harness itself, not by switching models. Resolves the open runtime question.
- **Cut the clutter (review of the live build).** No control may duplicate one that is always on screen: the agent page's "Talk to …" button is gone (the rail is always there), as are the rail's history button and the "open the whole conversation" link (both pointed back to the rail). One "+" adds pages (new page, from a file, new folder); the top-row "+" and the separate upload and folder icons are gone. Folders take dragged pages and say so when empty. Graph filters sit behind one Filter button that shows only what is active. The rail's "reads" menu offers only real choices (what you have open, or the whole workspace) and no explainer; "Add" now attaches a file from your computer (kept as a private page) instead of picking an existing page. Explainer copy is cut to what helps.
- **Agent settings save as you leave each field and go into every request** (what it is for, how it should work, skills). The agent page fits one screen: setup on the left; routines, skills and recent work on the right.
- **Routines.** An agent can do a job on a schedule: every day, weekdays or one day a week at a time, in the setter's timezone. Your own agent answers in your conversation with it; a workspace agent posts in a channel of that workspace. Each runs once per occurrence.
- **Start a workspace or join one.** Dylan: "shouldnt a new user get the option to A. start a new workspace that they own. B. Join and existing workspace" and "one user could be part of multiple workspaces. kind of like discord". Anyone with a verified Google account signs up; someone in no workspace chooses to start or join; both stay in the switcher. Replaces the setup code and invite-only sign-up when Google is on. *Assumed until Dylan says otherwise:* anyone may start a workspace; `WORKSPACE_CREATORS` can limit it. "Shared space" is called "workspace" in the interface.
- **The sign-in page should say what this is.** Dylan on the first Google screen: "can do much better than this screen".
- **Spend limits are a safety net, not rations.** Dylan on the first defaults (100k per space, 50k per person): "seems low". Measured: one call is about 3-4k tokens, so those allowed about 15 questions a day. Defaults are now 10M per day for the server, 3M per space, 1M per person and 20 requests a minute. "Guardrails" means harness rules that improve answer quality, which is separate work.
- **Search may use OpenAI embeddings.** Dylan approved `text-embedding-3-small` for turning page text into search vectors. It never writes answers; gpt-6-luna remains the only model agents answer with.
- **Agents asking agents, in the open; teammates' agents only through the teammate.** Dylan: "not seeing anything about agent to agent or user to agent to agent interactions". An answer one agent gives because another asked shows who asked and what ("Your agent asked: …"), in channels and in your rail, with "Ask Finance directly". Your agent can ask a teammate's own agent (from the model's handoff or by picking "@Sam's agent" in your rail): it becomes a request to Sam, shown in his rail with Draft an answer or Decline. His agent drafts privately, he sends it as is, edits it first, or doesn't send; only what he sends reaches you, marked "sent by Sam". While waiting, your rail says "Waiting for Sam". Follows the research rule that agents see and share what their person would, and a person decides what their agent shares.
- **Every workspace has its own agent, as its front door; follow-ups reach agents untagged.** Dylan: "each space needs a space agent ... a private space obviously doesnt need a second agent". The first agent of a workspace can't be retired. It starts with a real purpose ("Answers anything about X and brings in the right specialist"), introduces itself in #general with how to reach it and three first steps, sits first under Agents, and hands a request to a specialist whose purpose fits ("Asking Finance."). Its summary page ("About X", formerly the hidden Orientation) is shown first under Pages; its upkeep no longer fills Recent work. A reply in an agent's thread, or an answer to the question an agent just asked you (same chat, within 15 minutes), reaches that agent without tagging it, as in Slack's agent design. A private space still has no workspace agent: your own agent does that job.
- **Ask on the sheet; agents change sheets.** From the audit and Dylan: "most users would have these questions when looking at the sheet itself." Drag or Shift-select cells and an Ask appears beside them; your agent gets the cells as what it reads. Agents propose sheet changes ("B3 = 2700") on any sheet they can read, named by title, so a channel or a handoff no longer has to ask "which sheet?". The change shows cell by cell with Apply, wherever the request came from, including your rail after a handoff. Agents are told not to ask which page when only one fits.
- **The graph is "Graph", beside Find, and stays there.** Dylan: "we have also seemingly moved the graph button multiple times. and now its a 'see as a map' button. why." It was moved and renamed during list cleanups without being asked. One name, one place from now on.
- **No "+ New"; each part of the list adds its own.** Dylan: "the chats, pages and agents could just have a + that appears on hover". The page form also brings in a file. The workspace switcher is the app's standard menu, Find grows from the list's Find field, and every dropdown closes on a click away or Esc. The agent page has one header (name editable there, like a page title) and answers to its pane's width, stacking into one column when the chat is open beside it.
- **Made in the list, where it lives.** Dylan: "think more about how menu items here should work. the agent creator here creates antoher popup." Every "+ New" item now opens the same small form in the section it belongs to: Page in Pages, Channel in Chats, Agent in Agents. New workspace and Join open the same form under the switcher, and the member count opens People in the list. "Invite people" and "Pasted text" leave "+ New" (inviting is under People; pasting stays in ⌘K). No popup opens from the list; the New agent and People popups are gone.
- **Every popup shares one frame.** Dylan on the new-page popup: "popups like this one need significant work. this one and others." One frame (title, close, content, one primary action bottom right), two widths. New page is a title first, kinds in one row (Asset is gone: files come from "New → File"), who can open it as a dropdown, Enter to create. New agent asks only for a name, what it is for and who can use it; the rest is set up on its page. Text fields have a single focus ring.
- **The left list is chats, pages and agents, with one "+ New".** Dylan: "we need to consolidate features on the left rail and clean it up. its busy, crowded, and nonsensical". Six different add buttons become one menu. People move behind the member count, into a panel with the invite link. DMs list under Chats with channels. Agents list by name with what they are doing.
- **Folders are gone from the interface; pinned pages replace them.** Folders only grouped the list, nothing could be added from a folder itself, and agents ignored them. A pinned page sits at the top of everyone's list and every agent in the workspace reads it in full as standing background (brand rules, pricing, the brief). The empty "Resources & context" folder is no longer made. Existing folders still show as hubs on the map.
- **Squash merges carry their own message, and CI rejects co-author lines.** GitHub's default squash message added `Co-authored-by: Triple-dylan` to PR 14 because the commit email (GitHub no-reply) differed from the merger's (Gmail). Dylan approved a one-time force-push to remove it. This repo's git email now matches the merges, every merge passes `--subject` and `--body`, and CI fails on any co-author or "Generated with" line in a PR or on `main`.
- **CI lints the rules of hooks.** A hook placed after an early `return` crashed the rail twice in one session, and only the browser test caught it. `npm run lint` (oxlint, because typescript-eslint does not support TypeScript 7 yet) now fails on it in seconds. Only that rule is on; the wider React rule sets flag existing code that works and would be noise.
- **Google sign-in, then deploy for test users.** Dylan: "Google login would be great. I want to get this deployed so I can get some other users to join test and make a net new workstation based on some real projects." Google sign-in is ported from `archive/local-codex-cursor-nov7` onto the current invite-based sign-in, then the app goes to Railway (decided 2026-11-14).

## 2026-11-18

- **Your agent lives on the right.** A rail, always reachable, private to you; » or ⌘J folds it to a slim strip with a dot when an answer is waiting, and ⌘J from anywhere puts you in its box. It replaces the floating bottom bar, so there is one place to talk to your agent. It offers the few things worth doing with what is on screen (by page kind, selection or channel), shows what it is working on, and its answers point at the text they are about. On narrow windows it lies over the page and starts folded. *Supersedes* "the person's own agent as a floating bar" (2026-11-12). The 2026-11-12 "no permanent chat rail on the right" still holds for team talk: the rail is only ever your own agent.
- **Team talk stays in the middle, with what it is about.** Checked against the approved six screens after a drift (a rail with direct messages, a docked conversation box, margin threads plus a strip). A document is full width; a comment is a small mark with faces beside its line that opens on click; the page's own conversation is at the end of the page and scrolls with it, and the header says when people are talking. Canvases keep comments as pins. A channel is a page whose content is the conversation, with its pinned pages along the top showing what is happening on each, and a "New since you were here" line. The channel's side column (resources, agents, people) is gone: resources became the pinned row, people and agents are in the Team row.
- **Every shared space has a main chat:** #general, pinned first in the list above Pages, marked "Main chat".
- **Selecting text and choosing Ask an agent** points your rail at it. A comment can still ask a space agent to answer where everyone sees it.
- **Sharing from your agent, quietly.** Highlight part of an answer (or use Share under it): a short list opens, best place first with why (the line it is about, the main chat, the conversation or page on screen, a teammate), keys 1–4 and Enter. Hovering a place lights only that place, faintly. Shared, the message says whose agent it came from and keeps only sources everyone there can open; the answer remembers where it went, with Undo for ten minutes. *Rejected:* dimming the screen and labelling every destination ("eh more sublte").
- **Things shared in chat lead back to their source.** Rows of a sheet open the sheet beside the chat at those rows, lit; a quoted line opens its document at that line, lit.
- **Stop and Decided.** Work your agent is doing can be stopped from the rail; nothing is said or changed afterwards (the model call itself is not cut short). In a channel anyone can mark a message Decided; agents receive it as settled, and a cached answer no longer applies once something new is decided.
- **Quotes from a board piece** open the board centred on that piece, selected.
- **pstack skills** (the Claude Code port of Poteto's pstack) are kept in the repository's `.claude/` so every session on it has them. *Trimmed 2026-11-26, see above.*

## 2026-11-14

- **Agents are tagged in the feed, not picked from a menu.** Dylan approved the mockup. Typing "@" suggests the agents in the conversation; "@Scout" anywhere, or "Scout, …" at the start, addresses it; tags show highlighted in messages. The bar always talks to your own agent; "@Scout" in it brings Scout in privately. The private panel idea (mockups 2 and 3) was not right and is being reworked, with different behaviour on canvases than on documents and sheets.
- **Teammates' cursors** show on canvases (pointer), documents (caret and selection, named), sheets (the cell) and decks (the slide). Two switches in Settings: see teammates' cursors, and share mine. Nothing is stored. *Assumed:* the switches are per browser for now.
- **A quieter list.** Dylan: "So much info and chats on the left hand". Find, Graph and New page share one row at the top; folders stay folded unless they hold the page you are on or something for you; Orientation and Archive leave the list (Find and the graph still reach them); people and agents are one row of faces, with names and status on hover.
- **Hosting on Railway** (Dylan: "ok, railway works").
- *Assumed, stated to Dylan:* sign-in by invite links and one-time device links rather than email for now, since email needs a separate service. The database stays on a Railway volume until a team outgrows one server.

## 2026-11-13

- **No Catch up page.** Dylan: "this is simply a bad idea. why does it cover literally everything. you are starting to compartmentalize the ui again." Removed. What is waiting on you or has changed is marked on the page, person or channel in the list. A space opens on its work.
- **Do not box areas off.** "dont close off all these areas. each page has a border and its not good. unnecesary clutter and lines from doing this". Panes have no frame; separator lines are gone.
- **Sizing must respond to the window**, not only at load.
- **Later the same day, one plan executed:** the frame must never scroll; avoid windows that scroll inside themselves ("should just shape"); agent builder with skills and shared/private signals; settings, text tools, shortcuts and quick-click actions; a shared window on the canvas; retrieval and caching as the agent base; an asset library and archive as graph views; ways to deposit transcripts, documents and decks from other sources; prepare to build as a web app.
- *Assumed:* archived pages leave agents' working context until brought back. Skills in a shared space can be edited by anyone in it.
- *Limit stated to Dylan:* a desktop window cannot be dragged into a browser page; sharing starts from the browser's window picker.
- **Nothing docked over content, ever.** "needless black bar that hides content as you scroll by. again, this type of thing should never exist."
- **Screen capture removed.** "window sharing feature is broken, and the way you described it is likely not what we want anyhow." *Assumed instead:* dragging a page or channel onto a canvas makes it a live window there.
- **Shared context must always be felt in conversations**; channels have resources. "conversation windows have tons of empty space, lacking useful things. shared context exists in this harness. this should alwys be felt or accessible."
- **The bar is not just a chat box.** Dylan on the scope label and the bar: "what is this supposed to indicate… and we have multiple agents? are we sure this totally make sense? a chat bar with the limited funcitonality of literally only chatting?" It now chooses the agent, states and changes what the agent reads, and runs actions. *Assumed:* a space agent asked from the bar answers privately to the asker.
- **Agent work must be visible on every page**, for shared agents and for people's own; "everyone should or could have a prime agent". *Assumed:* teammates see that a person's agent is working and on which page they can open, never the request.
- **The example space is go-to-market:** "Lets clean up this workspace a bit and make it GTM focused. Marketing and product marketing and product." The pop-up shop example is replaced.
- **Side by side needed work.** Tabs are named after the pages; the divider resizes and swaps.

## 2026-11-12 (later) — rebuilt from basics

- **Structure.** One list on the left, one page or two side by side in the middle, the person's own agent as a floating bar. Dylan approved six drawn screens: "rebuild around these. do your due dilligence to ensure that interactions and fuctionality across is good to go".
- **The canvas is a kind of page**, alongside documents, sheets and decks, which can also sit on a canvas as live cards. "Customizable and malleable is important."
- **The graph is a private view, not a shared room**, so it has only the agent bar. A person asks their agent about the graph and stays there.
- **Comments and highlights on pages can be addressed to agents**, which answer with a suggested edit to accept or decline.
- **Pages carry their own feed**; there is no permanent chat rail on the right.
- **Agents are used natively everywhere, equally to teammates.**
- **A canvas is arranged together.** This replaces the earlier assumption that each person arranges a shared board for themselves.
- *Assumed:* what comes out of a private conversation with your agent (a saved page, an accepted draft) is private to you until you share it. A space agent handed work by your agent does not see your private conversation.
- *Superseded 2026-11-13:* Catch up as the first thing a space shows.

## 2026-11-12

- **No scripted agents presented as the product.** Dylan: "who decided we are making fake interactions. I did provide a api key to use for this demo." The scripted runtime was the Cursor demo's default, not his decision. Agents must answer from a live model wherever one is reachable; scripted output is only a labelled fallback.
- **Priority:** "the main priority is sorting out what all of the interfaces and ui/ux is like." Build everything else; wire the provided key for testing and demos.
- The key Dylan provided lives in the gitignored root `.env` on his machine and is read by the local server. It is not in this repository or the cloud build environment. The published preview uses Claude through the page instead.
- *Superseded later the same day:* each person arranging a shared board for themselves.

## 2026-11-11 — review and interview

- **Foundation:** keep the demo server; rebuild the client on it. Dylan wants a real version to test locally before deploying, and left the technical choice to the builder.
- **Order of work:** look and feel, then a canvas worth using, then agents.
- **Visual:** evolve the monochrome glass. Colour only for people, agents and content.
- **Canvas:** living board. Opening an object grows it into a full working view while the rest of the board folds into a shelf; closing returns to the board as it was. Chosen from three concepts shown as screens.
- **Agents:** animated orbs for now. The small clay "character with eyes" style was rejected. Characters are welcome later only if they are fun without doing too much.
- **Corrections after the first build (same day):** the orbs Dylan meant are the `thinking-orbs` from the DropDeployment harness, not invented ones. Earlier work must be reused, not replaced: October's canvas pieces and agent builder, DropDeployment's graph. Dylan does not run terminal commands; give him something that opens.
- **The graph** is not necessarily the home. It is how you traverse the shared context of a workspace, and it must show private versus shared.
- **Agents:** how they appear across every view, and how private and group agents interact, is to be evaluated in the running app. *Assumed for review:* each agent has its own orb colour; personal agents carry a lock; idle agents live in the rail, working agents also appear at the item on board and graph.
- **Conversation** is open to evolve.
- **Shared workspaces** confirmed.
- *Assumed for review:* private items sit on the shared board with a dashed "Only you" outline; a pin of a private conversation stays private; opening a document from the board folds the board into a shelf; the in-page preview opens on an example project with example teammates.

## 2026-11-05 — direction reset

- **Build the real product** (backend, real identities and data, running agents). Stop the UI-only redesign loop. Overhauls are welcome.
- **Demo first:** local first and zero-cost. If it goes on the web, use Cursor app publishing rather than paid Convex, Clerk or Vercel. No paid providers yet.
- **Agents:** a pluggable runtime. A scripted stub is the default; OpenAI turns on when `OPENAI_API_KEY` is set server-side, with a cheap model and a daily token guard.
- **Multiplayer** from the first real build (Dylan plus a second and ideally a third person).
- **All five first-message situations** must work.
- **Agents are characters;** the style is still open.
- **Canvas starts blank but usable;** no demo planning-doc content.
- `prototype/` deleted; recoverable from tag `archive/prototype-2026-10-28`.
- Repo moved off the iCloud Desktop to `~/sandbox-workstation`.
- *Assumed:* docs consolidated into SPEC / DECISIONS / STATE with an archive; adopt an off-the-shelf rich-text editor later; Office and browser modules deferred until the core loop works.
- *Demo simplifications (assumed, revisit after the demo):*
  - Shared canvas notes keep one shared position; per-person placement layers come later.
  - Demo sign-in is "pick your name on this server" with no passwords. It is not real auth.

## 2026-10-31 — agent presence interview

- Graph shows agent avatars **at active resources**.
- Clicking an agent shows **work and conversation first**.
- Agents can be created both conversationally and with a deliberate Create agent action.
- Style: tentative interest in soft 3D characters and restrained avatars ("1 and 3 maybe").
- **No universal first-send audience.** Expectations vary by situation (instruction, private ask, person, selected work, delegation). Explore these together.

## 2026-10-29

- **Unsolicited agent replies allowed** (not @mention-only).
- Click-to-write directly on the canvas (no spawned text box).
- Right utilities never scroll. Work modules look distinct from fixed utilities.
- No overlapping popups. Other users get profile photos and colored names (a color exception).
- Graph document reading is required (an earlier ambiguity was resolved).
- Notion is a positive reference for native content (not a schema to copy).

## 2026-10-28

- Rebuild approved. Tiled six-pane layout rejected; Graph and Canvas are full primary surfaces.
- Monochrome controls (replacing blue accents). Decorative graph-center glyph removed.
- Project context is the starting point, not a boundary. Routine context upkeep needs no approval; consequential shared edits do.
- Sharing changes the original; variants carry ancestry.

## Open

- First-send default per situation and reply presentation (the demo uses an explicit audience chip; review it).
- Agent character art direction and whether agents carry color.
- Production stack and LLM budget beyond the demo.
- Whether retiring an agent drains its running jobs or stops them.

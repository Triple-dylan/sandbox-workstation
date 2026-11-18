# Decision log

Newest first. Confirmed by Dylan unless marked *assumed* or *open*.

## 2026-11-14

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

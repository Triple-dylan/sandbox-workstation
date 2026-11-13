# Sandbox Workstation — product spec

Confirmed requirements only. Proposals live in `DECISIONS.md` (open items) or `archive/`. The full interview record is `record/conversation-context.md`.

## Purpose

A general-purpose workstation where people and agents work together across private and collaborative spaces: work, design, development, finance, marketing, hobbies and informal collaboration. It is not a coding tool and not primarily a messaging product.

Agents automatically gather, organize, update and hand over useful context as work happens. People govern access and sharing; they do not maintain that machinery by hand.

## Shell

_Rewritten 2026-11-12 after the from-basics rethink; see `DECISIONS.md`._

- One list on the left: the space, Graph, pages by folder, channels, people and agents. One page in the middle, or two side by side. The person's own agent as a floating bar at the bottom.
- No overview, summary or hero pages, no marketing copy, no permanent chat rail. Areas are not boxed off with frames and lines.
- Controls are **monochrome**, in light and dark that follow the viewer. Readable contrast everywhere. Content and participant identity may carry colour.
- Nothing ever covers work it cannot be dismissed from. Layouts are defined for wide, medium and narrow windows.
- There are no fake identities, demo fluff, or simulated "working" states presented as real.

## Pages

- Four kinds: **document, sheet, deck, canvas**. Each is private or shared, lives in a folder, and has its own feed.
- **Canvas:** a wide board with text, stickies, shapes, sections, arrows, pictures and other pages as live cards. Arranged together by everyone on it. Lightweight sequential goals (a human owner, an agent, a date) can sit on it; not a project-management suite.
- **Comments and highlights** attach to text in a document or to a piece on a canvas. They can be addressed to an agent, which replies with a suggested edit.
- A private page can be opened to named people or agents without sharing it with the whole space.

## Graph

- A person's own view of everything they can see in a space, private and shared. Always-on physics; the central node is anchored and returns to its place.
- Folders and pages are nodes; relations are drawn quietly. Private pages are visibly marked.
- Filters, saved views and saved questions keep a large corpus easy to sift.
- Choosing a page keeps you on the graph. Asking your agent lights the pages an answer came from.
- Agents appear at the pages they are working on.

## Conversations

- Channels, direct messages, threads and conversations with an agent are pages.
- All five first-message situations work: a workspace instruction, a private ask to an agent, a message to a person, discussion of selected work, delegation of ongoing work.
- Who a message goes to is always explicit. What is on screen sets what your own agent looks at, never who receives a message.
- Channels pin pages; a message can carry a live piece of a page.
- Shared agents may reply **unsolicited** as well as on request, inside conversations they may read.

## Agents

- Every collaborative project gets at least one dedicated agent by default, until the project completes or the agent is retired.
- Agents are shown as **characters**; the exact style is open. Selecting an agent shows its **work and conversation first**, with profile and settings secondary.
- Additional agents can be created conversationally or with a deliberate Create agent action.
- Project context is where an agent starts, not an absolute boundary. Wider access follows configured permissions.
- Routine context maintenance is automatic. **Consequential shared changes need approval.** Private agents have configurable autonomy, which never overrides shared access rules.
- A saved definition is not a running agent. Never fake execution.

## Privacy, sharing and provenance

- Private and collaborative agents, jobs, chats, projects and activity coexist. Privacy is enforced across access, graph visibility, retrieval, presence and provenance.
- Personal connections stay personal. Projects explicitly add shared connections.
- Sharing makes **the original item** shared, with one canonical identity. An explicit private variant is a new item with ancestry. No silent duplicates.
- Keep attribution, origin, sharing history, revisions and ancestry. Audit and provenance must not reveal private source conversations.
- Creating a project creates a folder on the graph, an automatic orientation document and a resources/context subfolder.

## Delivery

- Web first, multiplayer from the first real build (Dylan plus 2–3 people).
- Demo track: local first and zero-cost; see `STATE.md`.

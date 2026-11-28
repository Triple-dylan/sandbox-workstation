# What we are building

_Rewritten 2026-11-11 after reviewing the whole lineage, not only this repo. Confirmed by Dylan the same day with the corrections marked below._

## Lineage (read all of it before changing anything)

| When | Where | What it settled |
| --- | --- | --- |
| Jul 2026 | `CampaignOS` | The graph look and feel: folder hubs on a ring, members close to their hub, gentle simmer, focus by dimming the rest. One composer; agent identity is an attribute of a reply. |
| Jul–Nov | `mimirs-well`, Qbrain, `Corpus.ai` | A folders-and-markdown brain that agents maintain. Dylan's 2026-11-05 framing, "shared context engineering": one memory layer for people and agents, clear provenance, rules for what agents can see and change, org permissions plus a personal privacy layer. A real roster of named bots with group chats and standing rules. |
| Aug 2026 | `DropDeployment` harness | Graph-native workspace: the graph never disappears; folders are places, files open in place; agents sit in orbit outside knowledge and their work draws on the graph only from real events; one command bar; the `thinking-orbs` agent orbs; CampaignOS physics ported (`apps/harness/src/graph`). |
| Oct 2026 | this repo, `docs/archive` | General-purpose, multiplayer, private and collaborative. Canvas added beside the graph. Built: conversations with channels and threads, agent builder with versions, pinned messages, plan, visual references, reader, goals. All browser-local. |
| Nov 5 | Cursor PRs | Real local server, several people, access check, running agents with approvals. Dropped most of October's interface. |
| Nov 11 | this branch | New shell on the Cursor server. Mistake: dropped October's features, ignored the DropDeployment graph and orbs, shipped empty. |

## The product in one paragraph

A shared brain you can see and work in. The brain is folders and files, some private to you and some shared with a group. People and a roster of named agents work in it together. Agents keep it organised and current as work happens, and everything they say or change traces to a source and respects who is allowed to see what.

## The parts

Settled with Dylan on 2026-11-12 from six drawn screens ("rebuild around these").

1. **Brain.** Folders and pages are the truth. Every page is private or shared; a private page can be opened to named people or agents. Sharing changes the original; history and origin are kept.
2. **Pages.** Documents, sheets, decks and canvases. A canvas is one kind of page, not the home: a Lucid-like board where the other pages can sit as live cards. Every page carries its own feed.
3. **Channels.** Conversations are pages too, in the Discord/Teams sense: channels, direct messages, threads, pinned pages, live pieces of a page inside a message.
4. **Graph.** Not the home. It is each person's own view for traversing everything they can see in a space, private and shared, and for asking their agent about it without being sent somewhere else. Filters and saved views are how a large corpus stays easy.
5. **Agents.** A roster of named agents, each drawn as its own Tiles mark (a 3×3 pattern in its own colour) with real states. Your own agent is the floating bar on every screen: private, an orchestrator that answers about what is on screen, hands work to the space's agents and drafts replies for you to send. Space agents are shared, addressed deliberately in channels and in comments on pages, and suggest changes a person accepts.
6. **What needs you** is marked where it lives (the page, the person, the channel), never gathered into a page of its own.
7. **Together.** Shared spaces. People and agents work in the same pages; a canvas is arranged together.

## How it gets built

- Engine: keep the Cursor server (data, sync, access, agent jobs).
- Interface: restore October's features on that engine instead of rewriting them: conversations and threads, agent builder, pins, plan, visual references, goals.
- Graph: port the DropDeployment physics and focus behaviour rather than inventing a third layout.
- Agents are drawn as Tiles, our own 3×3 mark (2026-11-27); the `thinking-orbs` orbs from DropDeployment are dropped.
- Never show it empty for review: the in-page preview opens on a clearly labelled example project.
- Fix what Dylan reported on 2026-11-11: dark-mode contrast, buttons that do nothing.

## Working rules (from Dylan's own bot rules in `mimirs-well`)

Work out the goal behind an ask. Short replies. One tight question at most. No terminal commands for Dylan. Finish and merge; do not hand over PRs to review. Do not resurface settled issues.

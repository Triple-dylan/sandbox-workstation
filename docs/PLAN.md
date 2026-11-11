# What we are building

_Rewritten 2026-11-11 after reviewing the whole lineage, not only this repo. Awaiting Dylan's confirmation._

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

1. **Brain.** Folders and files are the truth. Every item is private or shared. Sharing changes the original item; history and origin are kept.
2. **Graph (home).** The map of the brain, in the CampaignOS/DropDeployment style: hubs, constellation physics, simmer, folders as places, files opening in place. It shows which person and which agent is touching what, from real events only. Agents orbit outside the knowledge, not inside it.
3. **Canvas.** A living board per space for laying out work: notes typed directly, images, documents, a plan, pinned messages, agent results. Everything on it is a real item in the brain. Opening an item grows it into a working view.
4. **Agents.** A roster of named agents: personal ones private to you, project ones shared. Each is a `thinking-orbs` orb with real states. Selecting one shows its work and conversation first, settings second. They can be created by asking or by a Create action, and edited (name, purpose, instructions, where it works, autonomy). They maintain context automatically, may speak unprompted, and need approval for consequential shared changes.
5. **Conversation.** One message bar with an explicit audience. Direct messages, channels, threads, private agent chats and group chats with several agents. History sits beside the work.
6. **Together.** Several people live in one space, each with their own arrangement.

## How it gets built

- Engine: keep the Cursor server (data, sync, access, agent jobs).
- Interface: restore October's features on that engine instead of rewriting them: conversations and threads, agent builder, pins, plan, visual references, goals.
- Graph: port the DropDeployment physics and focus behaviour rather than inventing a third layout.
- Orbs: use `thinking-orbs` as in DropDeployment.
- Never show it empty for review: the in-page preview opens on a clearly labelled example project.
- Fix what Dylan reported on 2026-11-11: dark-mode contrast, buttons that do nothing.

## Working rules (from Dylan's own bot rules in `mimirs-well`)

Work out the goal behind an ask. Short replies. One tight question at most. No terminal commands for Dylan. Finish and merge; do not hand over PRs to review. Do not resurface settled issues.

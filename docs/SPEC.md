# Sandbox Workstation — product spec

Confirmed requirements only. Proposals live in `DECISIONS.md` (open items) or `archive/`. The full interview record is `record/conversation-context.md`.

## Purpose

A general-purpose workstation where people and agents work together across private and collaborative spaces: work, design, development, finance, marketing, hobbies and informal collaboration. It is not a coding tool and not primarily a messaging product.

Agents automatically gather, organize, update and hand over useful context as work happens. People govern access and sharing; they do not maintain that machinery by hand.

## Shell

- One harness with two primary surfaces: **Canvas** and **Graph**. Both have the left rail and a floating composer. There are no overview or hero pages, no workspace title, logo or marketing copy, and no top-menu clutter.
- A project opens straight into work. A fresh canvas is **blank but usable**: no preloaded demo content or fake dashboard.
- Controls, rail, graph and utility chrome are **monochrome**, in light and dark glass that follows the OS. Readable neutral contrast. Content and participant identity may carry color.
- Modules and popups must **never overlap**. There is no workspace zoom.
- Right-side utilities (sources/context, agent, goals) are independent, can show together, size to their content and **never scroll**. Long content links to a complete view.
- Conversations do not belong in the right utility region.
- There are no fake identities, demo fluff, or simulated "working" states presented as real.

## Canvas

- Bounded workspace with grid snapping, placement feedback and collision checks. Content follows the pointer while dragging; Escape cancels.
- **Click empty canvas to type at that spot.** No text box, card or editor window is spawned. An unused caret saves nothing.
- One document viewer at a time. Browser, agent and other module types are independent of it.
- Shared content and personal layout are separate. Collaborative projects have common modules, and each person can adjust their own view. Personal presets are part of the product.
- Lightweight sequential goals and milestones: a human owner, an agent assignment and a simple deadline. Not a project-management suite.

## Graph

- Full-surface, with always-on physics and magnetism (no toggle). The central node is anchored, moves only slightly when dragged and returns to its place.
- It shows folders, resources, relationships and permitted activity. Folder nesting manages density. Node types are meaningful, not identical boxes. There is no decorative center glyph.
- Selecting a folder or document opens the explorer or reader **while staying on the graph**. Reading documents on Graph is required.
- Agents appear as **avatars at the resources they are actively using**. Document edits do not reshape the graph.

## Conversations

- Five first-message situations must all work:
  1. a workspace instruction
  2. a private ask to an agent
  3. a message to a person (one-to-one, no project required)
  4. discussion of selected work
  5. delegation of ongoing work
- The audience is always explicit. Opening a document never silently changes the recipient. Drafts are kept per conversation and thread.
- Private and collaborative conversations, channels and nested threads. Profile pictures and colored names for people.
- Shared agents may reply **unsolicited** as well as on request, inside authorized existing conversations or threads.

## Agents

- Every collaborative project gets at least one dedicated agent by default, until the project completes or the agent is retired.
- Agents are shown as **Orb** characters (abstract core in a thin ring; state via motion). Selecting an agent shows its **work and conversation first**, with profile and settings secondary.
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

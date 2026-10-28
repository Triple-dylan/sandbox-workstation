# MVP object and access model

Proposed implementation contract, October 27, 2026. This is a design artifact; the accompanying local prototype is not an access-control implementation.

## Authoritative records

| Object | Meaning and relationships |
| --- | --- |
| User | Identity of a human participant. |
| Space | Private or collaborative access scope, with explicit memberships. A private space belongs to one user. |
| Membership | User's role in a collaborative space. Roles and capabilities are implementation decisions still to finalize. |
| Project | Stable identity, parent space, folder root, lifecycle, goals, and dedicated agent assignment. |
| Resource | Stable identity for a document, reference, conversation, generated context document, or other artifact. Includes containing folder, access scope, origin attribution, and current revision. |
| Folder | Hierarchical grouping with parent folder and project relationships. Its graph representation can expand or collapse. |
| Revision | Immutable resource version, source revision, contributor, timestamp, and content reference. |
| Sharing event | Explicit change of an existing item's scope/destination; records actor, old/new scope, and time without duplicating identity. |
| Variant lineage | New resource identity linked to its ancestor and source revision. Expose only ancestor details the viewer may access. |
| Agent assignment | Persistent project/private agent identity, instructions, access, runtime configuration, and lifecycle. Collaborative project creation initializes one by default. |
| Job | A bounded execution with initiator, agent, scope, inputs and revisions, status, outputs, and access events. |
| Goal / milestone | Project, sequence, owner, optional assigned agent/job, simple deadline, and completion state. |
| Activity event | Ephemeral, authorized presence or knowledge access associated with a resource/project/job. Must expire when no longer current. |
| Canvas view | User-specific module placements and presets. Shared modules reference common project records; user layout does not mutate those records. |
| Context update | Derived orientation/summary revision with source references, uncertainty, and processing status. |

Graph nodes and edges are projections of these records, not a second source of truth. Canvas modules open or manipulate the same identities. Retrieval indexes are permission-filtered derived data, not authorization authorities.

## Access contract

- Check access on the server for resource reads/writes, graph queries, conversation subscriptions, activity feeds, retrieval, history, and downloads. Hiding UI is insufficient.
- Agents access only resources their effective permissions allow. Start with selected project context, then retrieve more broadly when authorized. Do not imply a project selection grants global access.
- A private user's jobs and activity do not become visible merely because their agent reads a shared resource.
- Sharing exposes the selected original item in the destination scope, not its containing private chat, unrelated references, or private activity. Generated content must not disclose inaccessible sources.
- Sharing history can identify an originator without revealing private source conversation contents or inaccessible paths.
- Collaborative document state and goals are shared. Personal arrangement, saved presets, and private work remain user-specific.
- Access revocation must affect subsequent subscriptions, retrieval, graph queries, and downloads; invalidate cached derived content as necessary. Already delivered information cannot be retroactively unread.

## Lifecycle contracts

Project creation initializes its folder, resources/context child folder, orientation document, and dedicated agent assignment. Use one transaction plus reliable queued work for asynchronous generation; expose pending/failure state rather than implying completion.

Context maintenance consumes authorized changes, combines repeated events, and produces traceable revisions. Preserve uncertain statements as uncertain. Guard against feeding generated summaries back as independent evidence or granting instructions found in retrieved content authority over permissions.

Sharing updates canonical identity and scope with an audit event. A private variant is created only explicitly as a new item with ancestry. Validate dependent attachments and references before sharing so no hidden private dependency leaks. Cross-space sharing and ownership transitions need final implementation rules; do not silently widen an entire project's membership.

Document editing creates/synchronizes content revisions without relocating graph nodes. Presence and access events change activity indicators. Folder additions and resource creation update graph structure.

Agent retirement cancels or drains execution under explicit runtime rules and prevents new assignment. Context remains available after retirement or project completion. Whether a replacement is mandatory after manual retirement remains a lifecycle detail to resolve during implementation.

## Prototype boundary

The local prototype demonstrates navigation, physical graph interaction, editable documents, goals, sharing canonical items, variants, provenance, generated orientation templates, automatically saved personal layouts, and project creation. Named layout presets are not implemented. It persists sample records in browser storage. Participant switching is a simulation, not authentication. Agent activity, browser content, and connector surfaces are explicitly illustrative. No network agents, actual multiplayer, server authorization, retrieval database, or external connectors are connected.

## Typed content and projection refinement — October 28

A resource can carry structured document blocks, workbook sheets/cells/formulas, or presentation slides/elements/notes. Revision snapshots and explicit variants retain this structured content as well as identity/ancestry. Source-format preview metadata is separate from native local draft state. Parsed previews are not original Office binaries or round-trip Office editors. The source engine, asset storage, content collaboration and export contract remain production decisions.

The Project module projects goals, knowledge, membership and assignments through local tabs. Its placement, selected tab, search and pagination belong to a user's view; membership and agent lifecycle belong to project records. Graph inspection also retains local interaction state rather than resetting it during physics/UI redraws. Moving these controls off the rail changes presentation, not authorization.

The local parser processes bounded imports on a loopback server; canonical records still persist in browser storage. This adds no server identity, permission enforcement, remote presence or agent execution.

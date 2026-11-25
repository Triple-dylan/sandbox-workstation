# One conversation system across canvas and graph

October 29, 2026. Follow-up to the user's report that corner clicks disturb writing, text tools/cursors remain poor, chat has not been thought through with Canvas, and graph inspection is jarring. This plan proposes one coherent communication model. It does not claim the missing messaging/agent service is implemented or reopen the selected beside-work relationship.

## Confirmed direction and newly confirmed answer

Retain the left rail, floating composer, beside-work conversation, full primary Graph/Canvas, bounded non-overlap, independent non-scrolling right utilities, one document viewer and canonical sources. Opening a document never silently changes message recipients. Private messages/resources remain private. Context gathering and routine maintenance are automatic; consequential shared agent edits need approval.

The user explicitly answered **“Allow unsolicited agent replies too.”** Shared agents may proactively participate as well as answer direct requests. The earlier suggested @mention-only default was not selected. Frequency, notification policy and exact routing below are recommendations, not additional user decisions. Do not simulate proactive replies in the disconnected local proof.

## Diagnosis of the current implementation

The composer currently appends a local message to the selected conversation and opens history. Its audience label is inert; there is no actual contact lookup, agent recipient, delivery or executing response path. The agent builder saves configuration only. Canvas writing is a private resource with no source-linked discussion anchor. Graph activation previously changed subject before discovering that inspection could not fit. These are disconnected interaction/state contracts, not missing decorative components.

A reproduced bottom-corner click reduced the canvas from 677px to 622px tall by adding a feedback row. A note at local (72,612) then reflowed to (0,0). The earlier app also forced 640px width into the actual 550px browser pane, clipping the send/work controls. Existing text controls inserted new blocks rather than formatting the active block. The broad body-cursor mutation during drag could affect unrelated surfaces.

## Proposed communication contract

Use the existing composer, history, conversation navigator and source viewer. Make the existing audience label an actionable destination selector that uses the existing navigation/search space. Do not add a second agent prompt, DM composer, floating comment card or agent response window.

| User action | Destination and response | Canvas / graph behavior |
| --- | --- | --- |
| Ask a personal agent privately | The addressed agent and user share one private conversation. The agent's answer/status belongs in that history. | Work stays where it is. Actual generated artifacts can be opened deliberately in the existing viewer. |
| Message another person | Choose that verified person through the same navigator; send into their DM. No project is required. | Open work and unsent drafts remain. A project agent does not acquire access to that DM. |
| Discuss in a channel | The composer clearly shows the channel. Human and agent messages share its history and ordinary threads. | Opening a document never retargets this conversation. |
| Address an agent in a shared channel | Resolve its real identity through @mention or explicit work assignment. It responds in the relevant existing thread. | Job/resource activity projects onto Graph only when authorized real events exist. |
| A shared agent has something useful to contribute | It can proactively post in the relevant conversation/thread, attributed as that agent. | No auto-opened window, changed focus, overwritten draft, panning or forced scrolling. |
| Discuss canvas text, an image or selected document content | An explicit Discuss / Ask action adds a source reference to the existing composer and reveals the relevant discussion in existing history. | The original content stays put, with one canonical identity. No copied sticky-note conversation. |

The visible destination needs to state who can read the message, not just an ambiguous mode such as “Agent.” Choosing a person, channel or agent is a deliberate navigation action. General selection of a file, folder or canvas object is not one.

Each conversation/thread owns its draft, attachments, reading position and unread state. Opening history reveals previous replies from that destination. Late responses belong to the conversation that initiated them, even if the user has navigated elsewhere. Use existing navigation unread indicators and a jump-to-new-messages affordance; don't take over the current task.

## Proactive agents without conversational noise

Recommended triggers include a relevant contradiction, a blocked dependency, completed work, an approaching agreed milestone or a meaningful context change. Ordinary keystrokes and every resource read should not produce messages. Group repetitive updates in the same relevant thread. These are proposed quality rules, not a new requirement that humans manually package context or invite an agent on every update.

A project agent needs a configured home channel for contributions without an existing thread. A private agent contributes only within its authorized private conversations. Humans and agents remain visibly distinct participants. The same history can display pending/working/needs-input/failed/completed job state; cancellation/retry should refer to that actual run. A saved definition must never generate a fake working state.

Agent messages may propose a change. Applying a consequential shared change follows project approval policy and resource revision checks; private autonomy settings cannot bypass those rules. Keep proposed artifact changes in the existing viewer with their source/run identity, rather than introducing another approval window.

## Canvas text as collaborative content

Typing makes content; it does not implicitly send a message or notify someone on every keystroke. A selected text range/block can become the context of a discussion through the existing composer. A reference should record resource ID, stable block/range anchor and referenced revision/quote, rather than duplicating a resource. Editing the source keeps the link; if an anchored range was deleted, show the referenced revision with a clear changed-source state.

Mentions in a sent discussion notify the resolved participant who has access. A typed name is not an invitation or an access grant. Sharing a private source into a group must explicitly share the original canonical item; attaching a reference cannot make private content public. The source's space determines its audience, not whichever chat happens to be selected. Until the actual space/membership/sharing service exists, new writing in this proof remains private.

For richer writing, use a proven structured editor foundation before adding inline formatting, inline identity mentions, range discussion anchors, structural undo or collaborative editing. Extending isolated contenteditable blocks into a full ad hoc word processor would repeat the present fragility. The engine choice/schema and migration need a short compatibility proof; no dependency or paid service is selected by this proposal.

## Graph and reading continuity

Folder selection should focus that subject and open its contents in the one reusable inspector. Selecting a document replaces the contents of that inspector at the same width; it does not create another window. Parent/back actions update graph subject and reader together. Closing inspection restores the full graph. Preserve per-resource reading position and normal text selection as the reading experience matures.

Check placement before changing focus. If inspection cannot fit, retain the current graph and reading state and explain the available action without resizing the graph to show the error. Keep existing node positions and let the anchored physics settle a newly selected subject, rather than immediately teleporting it to a new center. Graph exploration, open resource and message destination are three separate states. They can be linked by explicit Discuss/Ask/Open-original actions, not coupled by generic clicks.

At the actual narrow browser-pane width, the full desktop coexistence layout cannot fit. Recommended compact behavior: the existing reader temporarily occupies the work area, with an explicit Back to graph action restoring the same graph position/context. Desktop coexistence stays beside work where it fits. This is a proposal for review, not a silent change to the selected layout. The 550px shell clipping is repaired; the complete compact conversation/reader behavior is still design work. This is not approval for another generic full-window tile layout.

## Implemented repairs in this cycle

- First empty-space click while editing finishes editing. It does not spawn another text object. Intentional new placement near an edge is bounded and does not generate a layout-changing capacity notice.
- Status feedback uses the existing work-action row. Appearing/dismissing feedback no longer changes canvas bounds. Long feedback remains available within that row.
- The shell fits its actual pane width. At 550px, the composer, Send and Open work controls remain in view.
- Text controls format the current block. Enter splits; Backspace/Delete join adjacent blocks at their boundaries; empty list/checklist Enter returns to ordinary text. Input uses the text cursor. Dragging no longer writes a global body cursor.
- Graph inspection checks capacity before subject change. One inspector retains width through folder/document navigation; parent navigation synchronizes the graph, and closing restores the full graph. Existing node coordinates seed the physical transition.

These are implemented local repairs, not completion of the communication proposal or acceptance of the interface. Text still lacks a full rich editor, structural undo and range comments. Real participants, delivery, runs, proactive replies, shared persistence and context automation remain missing.

## Evidence-informed choices and next review

[tldraw's text behavior](https://tldraw.dev/sdk-features/text-shape) distinguishes editing from selection, fixed-width wrapping from auto-sizing, and empty transient text from committed content. This informs text-state discipline, not copying its infinite canvas or changing the user's single-click requirement.

[Notion's content discussions](https://www.notion.com/help/collaborate-with-people) demonstrate comments attached to specific content with participant mentions. The proposed adaptation reuses this product's existing composer/history rather than adding a separate comments panel.

[Slack's agents](https://slack.com/help/articles/33076000248851-Work-with-AI-agents-in-Slack) use channel/thread and direct agent conversations. [Linear's agent lifecycle](https://linear.app/developers/agent-interaction) distinguishes persistent configuration from actual sessions and activity, including awaiting-input and error states. These support shared conversation primitives and honest run state, not selecting either platform's backend or restricting this workstation to messaging/issues.

Next review should approve or revise this complete model using three connected journeys: private agent question → answer → open result; shared canvas selection → human/agent discussion → source-linked outcome; graph folder → document review → discuss selection → return. Demonstrate recipient/privacy clarity and preserved geometry/drafts through all three. Establish a real identity/delivery/run service contract before claiming those journeys execute. Do not substitute a wider library of static modules or fabricated replies for that proof.

## Verification of the local repairs

All **57 browser scenarios passed in one final complete run**, with no skipped/cancelled cases. New journeys cover bottom-corner text dismissal without movement at 550/1440px, actual-pane control containment, active-block formatting and caret-preserving Backspace merge, failed inspection preserving subject/bounds, and document/parent/close navigation using one inspector. Existing source identity, drafts, geometry, private attachments, graph spring, images and local configuration checks remain. Build, formatting and whitespace checks pass; upstream Lucide bundler directives and the roughly 500kB minified chunk warning remain.

[550px corner-click evidence](workstation/evidence/interaction-corner-550.png): the typed note remains at screen (121,526), size 420×56, before/after clicking the corner. The canvas remains 468×582; Send ends at x≈495 inside the 550px pane. This is isolated QA data, not seeded user content. Read-only inspection of the actual browser pane also confirmed that the send/work controls are visible after the width repair.

The first test run encountered a reload during concurrent source editing. A later run exposed an old expectation that closing inspection retained folder focus; it was aligned with the confirmed return-to-full-graph requirement. The final run was taken after code/source preparation stopped changing. These checks establish the reproduced local repairs, not completion or user approval of the communication model. In particular, narrow-pane graph/document reading is still blocked by the existing capacity policy pending the proposed compact reader design.

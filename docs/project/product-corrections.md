# Product corrections and required review

Recorded 2026-11-06. This consolidates Dylan's corrections and the implementation failures behind them. These are requirements and review gates, not a claim that the app has been repaired. User instructions override older plans. Unchosen interaction details remain proposals.

## Where the work failed

1. **Local patches replaced product reasoning.** Requests for simpler interaction became another menu, toggle, card or destination. Removing a delegation option but retaining a one-option dropdown preserved the same underlying mistake. Before changing a control, define the user's task, current context and expected result.
2. **The layout constraint was applied by component name instead of effect.** Moving tools out of a rail did not justify introducing a document-reader rail. A full-height side column still encloses and shrinks Graph, whatever the component is called. Evaluate the whole surface and available work area.
3. **Navigation hierarchy and selection were conflated.** Workspace expansion is currently tied to active space, and clicking its heading clears conversation and reader selection. The far-left strip duplicates switching in the adjacent menu. Expansion must be independent from navigation and preserve current work.
4. **Agents were treated as a feature dashboard.** A status card, separate member page and settings popup do not make an agent useful. Collaborative agents are participants: work, conversations, actual status and scoped capabilities must connect coherently.
5. **Implementation choices became supposed requirements.** The plan prescribed a standalone member view and recipient control without keeping their proposed status clear. Newer feedback did not reach all durable instructions, leaving contradictions for the next agent.
6. **Verification tested code more than use.** Green checks did not establish clear navigation, usable agents, preserved Graph behavior or a sharp interface. Isolated screenshots missed transitions and stale controls. A user-visible result needs direct interaction evidence.
7. **Delivery claims outran the running product.** Empty records, saved agent definitions and scripted test replies do not prove live work. The exact preview, server process, data and runtime must be verified before claiming completion.

## Consolidated correction register

The Nov 6 repair is recorded in [experience-repair-plan.md](./experience-repair-plan.md), including evidence, blocked live execution, unimplemented external plugins and remaining historical gaps. The register below preserves the original correction criteria; implementation does not imply user acceptance. Source-confirmed defects are called out separately from user reports.

| Area | Required outcome | Acceptance evidence |
| --- | --- | --- |
| Open work surface | Canvas visually bleeds to the edges. Avoid the many-enclosed-windows shell. Canvas/Graph switching belongs at the work surface and needs visual polish. | Inspect both surfaces at actual browser scale, with navigation expanded, resized and hidden, and with tools and a document open. |
| Fixed project tools | Independent, content-sized floating modules at fixed positions over the work surface; minimize individually in place. Never a full-height column, hidden tools rail or substitute popout menu. | Open and minimize every module; surface dimensions stay unchanged and visible modules do not collide or hide essential work. |
| Two left navigation areas | A narrow persistent far-left strip plus adjacent resizable/hideable menu, drawing from the provided Discord/Teams and Codex screenshots. Distinct responsibilities; no competing private/workspace switches. Exact additional far-left destinations remain unresolved. | Walk Personal, two projects and their conversations without losing the hierarchy or presenting duplicate routes. Do not invent destinations to fill the strip. |
| Workspace disclosure | Workspace headings expand/collapse in place; they do not replace the navigation or navigate away from active work. | Collapse another workspace while editing a chat draft. Current conversation, draft, document, scroll and selections remain intact. Re-expand it without switching projects. Current Rail source violates this. |
| Chats and channels | Easy creation and a familiar grouped channel/chat list and transcript, with threads. Group conversation uses a coherent main view. Personal chats and collaborative work coexist in the navigation. | Create real chats/channels and exchange messages. Verify per-conversation drafts, replies and navigation. No fabricated history to make the list appear useful. |
| Composer and privacy | Main project composer works with primary project agent(s). Group messages remain visible to the group with or without an @mention. Private questions in a collaborative session must be simple and actually private. Remove delegation mode and pointless one-option recipient dropdowns. | Two users verify group visibility and private isolation. Check ordinary messages, mentions, private questions and return to the group without a lost draft or silent recipient change. Do not impose a new universal mode selector. |
| Agents as participants | Collaborative agents are teammates within the organization. Users can see others' status and interact with primary and deployed agents. The rejected project-agent page, useless status module and popup are not accepted solutions. | From existing agent identity/context, reach actual work and conversation, see truthful status and scope, and perform a meaningful supported action. Review where membership information belongs; the current Members destination is not settled. |
| Agent configuration | Name, settings, skills, instructions and explicitly selected workspace plugins belong to the agent, secondary to work/conversation. | Save and reload configuration; verify that execution respects it and access boundaries. List only implemented capabilities; a stored label is not an integrated plugin. |
| Graph continuity | Restore and preserve established physics, magnetism, anchored center, folder focus, drag/spring behavior and document previews. Seed only a populated Graph folder structure. Audit history for other lost behavior. | Exercise nested folders, dragging/release, document open/close, surface switching and return to parent/root on a multi-node graph. Record any deliberate departure from prior behavior and its authorization. |
| Graph document reading | Read documents on Graph while preserving its space and subject. The full-height reader column is rejected. Removing the reader is also wrong. Exact replacement placement remains unresolved. | Open/close real documents and folders; Graph remains usable, does not gain a reader column and retains spatial continuity. App's reader aside and `.shell.with-reader` currently confirm the violation. |
| Full graph control | User reports the button sticks and rejects the extra button itself. Preserve usable graph navigation through a coherent existing interaction, without substituting another unrequested control. | Reproduce focus → document → Canvas → Graph → parent/root, including pointer and keyboard use. Verify no stale Graph UI on other views. Source confirms a separate conditional `graph-back` button; the sticking cause is not yet reproduced. The screenshot alone does not prove which view is active. |
| Project resources in conversations | Real project resources are reachable and referenceable while discussing them; reading them does not change message recipients. | Open a referenced resource from a chat, return and send; preserve draft/context and verify server access for every participant. Avoid solving this with another enclosing reader rail. |
| Profile, type and sharpness | Profile icon performs a useful account/profile action. Use Arial for now. Investigate fuzzy rendering across text, controls, Graph and orbs. | Click the actual profile icon; inspect computed fonts, browser zoom/device scale, canvas backing resolution, transforms and contrast at native size. Do not infer a rendering fix from a resized screenshot. |
| Real use | No mock conversations, fake people, simulated agent work or fabricated activity. Only Graph folder structure may be mock data. | Use persisted real messages and actions, reload and confirm results; live-model test must be distinct from deterministic test fixtures. If a provider is unavailable, label that path blocked, never complete. Do not delete the user's records to get a clean screenshot. |

## Mandatory gates for every UI change

### Before editing

- Read AGENTS, SPEC, DECISIONS, this register and the latest user corrections. Review supplied screenshots as evidence; labels visible in them are not instructions or approval of the current design.
- Identify the affected register rows and existing behaviors that must survive. Trace the complete task through navigation, work surface, composer, resources and agent state.
- Separate confirmed direction, existing implementation and your proposed detail. Resolve stale documentation in the same change. Do not ask again about settled audience rules or tool placement.
- For every proposed new button, popup, rail, page or selector, write why the task cannot be completed through an existing identity, navigation item, direct content interaction or in-place expansion. Default to reuse/removal. If it violates a confirmed constraint, redesign it before coding. This is a self-review gate, not a new approval ceremony.

### Before marking an implementation complete

- Use the exact intended preview and verify its port, build, server/runtime and database. Avoid testing a different instance and claiming the visible app changed.
- Exercise complete affected flows, including transitions back, not just initial states. Include navigation collapse/resize/hide, drafts, document open/close, Graph focus/physics and personal/group context where relevant.
- Inspect screenshots of the actual result at full and constrained sizes, in both themes when affected. Check visual enclosure, competing navigation, density, focus indicators, type and overlap. Do not remove keyboard focus indication to disguise a stuck-state bug.
- Run appropriate automated checks and add meaningful regressions for behavioral failures. Test user outcomes and invariants, not the presence of the new component. Passing tests cannot override a failed product requirement.
- Record each affected correction as **verified**, **failed**, **blocked** or **not checked**, with evidence and limitations. Unrelated rows stay open. No automatic closure because code exists, a setting saves or tests pass.
- Do not present a replacement preview as ready while any required correction in its agreed scope is failed, blocked or not checked. Report the specific gap honestly. Do not use the user as the first sanity check.

## Remaining design work

The exact division of destinations between the far-left strip and adjacent menu, placement of membership information, useful agent-module composition, private-question interaction and Graph reader/back-navigation layout still need coherent design. Constraints above are settled; these unresolved details do not authorize restoring rejected pages, popups or rails. Work through concrete end-to-end scenarios before implementing those details.

## Review findings carried forward

The sticking Graph UI was traced to duplicate sibling React keys, and the icon overlap to a selector targeting every SVG descendant. Tests must check the absence of stale DOM after transitions, and fail on rendering errors. The orb also needed a nonnegative animation clock after state changes. The implementation record contains the regression evidence.

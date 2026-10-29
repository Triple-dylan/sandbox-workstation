# Maturity refinement: implementation and review evidence

October 28, 2026. The user authorized implementing `Maturity Refinement Plan.md` by saying “proceed.” This is the resulting local interaction revision, not acceptance of its appearance or a claim that the production MVP is complete.

## What changed

| Concern | Current behavior |
| --- | --- |
| Colored chrome and arbitrary graph branding | The graph, rail, icons, right utilities and control states use a shared neutral scale in light/dark. The center glyph/gradient has been removed; a small subject anchor retains limited drag and spring return. Folder/resource identity and full-surface Graph remain. |
| Framed textarea inside a composer | The composer is one composition surface with a neutral container focus boundary, caret, readable selection, bounded multiline growth and visible keyboard focus. IME composition does not send. Send-shortcut preference is available under Account; no zoom or Agent toggle. |
| Generic Add a tool cascade | A single anchored, searchable Open work surface directly opens the selected resource or executes an identified command. Escape cancels/restores focus. Arrangement actions appear when applicable. Opening, creating and attaching use different operations; navigation does not spawn work. |
| Missing real artifact creation | New document creates an editable private Markdown/text record with a stable local ID, autosaved body/title, download and one reusable viewer. Private documents appear under a private folder in the local graph. Repository sources remain read-only. These are not native Office editors. |
| Weak conversation handling | Transcript typography/date grouping, parent-context replies, per-conversation thread restoration, session reading positions, message search and explicit local delivery state replace the earlier tiny transcript proof. Main and thread drafts/attachments remain separate across navigation and reload. New messages do not blindly jump a reader to the bottom. |
| Arbitrary names impersonating human DMs | Unconnected people search explains the missing identity service; the arbitrary name/email recipient form is removed. Existing local DM drafts are preserved and explicitly unverified. Real contact lookup and delivery are still unimplemented. |
| Preferences presented as agent management | An agent definition editor supports creation, purpose/instructions, private/project scope, inherited context, private autonomy, saved immutable versions, restoring a version into a draft and export. The dedicated project definition keeps project scope. |
| Local state could pretend to deploy an agent | Definition, saved version and runtime are distinct. Test/deploy controls are unavailable with an explicit runtime dependency. No fake test pass, published live version, deployment acknowledgement or running job is generated. |

Graph/Canvas hierarchy, blank fresh Canvas, independently content-sized utilities, one document viewer, independent browser/agent work objects, snapping, collision rejection and personal arrangement recovery remain. No generic six-pane workspace or application zoom was restored.

## Privacy and continuity corrections found during implementation

Private local documents cannot be attached to project channels or unverified DM drafts without sharing first. The attachment chooser explains the restriction, and sending also checks it while retaining the draft. Canonical sharing itself still requires the future authoritative service; the UI guard is not server access enforcement.

Document body edits do not rebuild the graph simulation: graph topology depends on identity/title/folder, not document text. Existing node positions are carried forward when topology changes. A renamed local document retains its resource ID, body and references.

The same browser storage key and version-2 migration preserve existing conversations, drafts, attachments, appearance, goals, work objects and legacy layout data. Agent definitions, local documents, selected agent, send preference and per-conversation thread state are additive fields. Reading offsets are session-local, not cross-device records.

## Verification and visual review

Run from `workstation/` with the existing loopback server:

```sh
npm run build
npm run format:check
npm test
```

Final results:

- `npm test`: **27 passed**, including the six new compound refinement scenarios. An earlier run caught unstable Instructions-field labeling after saving an agent version; the accessible name was corrected and the suite passed.
- After the final graph-position carry-forward adjustment, the **six relevant Graph/anchor browser scenarios passed** again.
- `npm run build`: passed TypeScript and production bundling. Existing upstream Lucide `use client` directive warnings remain; no project compilation errors.
- `npm run format:check` and `git diff --check`: passed.
- Additional isolated browser review exercised keyboard work search, local agent creation/version persistence in dark mode, and project-agent selection while Graph/conversation remain visible. No fresh-page application errors were observed.

An initial targeted browser launch was denied by the local sandbox process restrictions; the authorized browser checks then ran outside that sandbox. This was not a product failure or an automatic approval rejection. The browser suite uses isolated contexts and does not reset or populate the user's preview records. Layout checks are regression evidence, not visual acceptance or proof of production permissions.

Visual review captures:

- [Composer focus, light](workstation/evidence/refinement-composer.png)
- [Full Graph with conversation and compact utilities](workstation/evidence/refinement-graph.png)
- [Agent editing while retaining Graph and conversation](workstation/evidence/refinement-agent.png)
- [Anchored work search, dark](workstation/evidence/refinement-actions-dark.png)
- [Editable private agent definition, dark](workstation/evidence/refinement-definition-dark.png)

The review found and removed a graph hint colliding with the work action. It also narrowed the default work results: arrangement operations require applicable state, and browser-service diagnostics are searchable rather than advertised as a connected working browser. Screenshots show meaningful states, not six preloaded windows.

## Remaining implementation boundaries

This revision implements the interaction/configuration portion of the refinement plan. It does not complete its authoritative conversation service, runtime integration or integrated context loop. There are no connected accounts, real contacts/delivery, server authorization, shared editing/presence, live retrieval, executing agents, durable approvals/jobs, authenticated browser sessions or native Office engine. Routine context maintenance and project initialization through a real agent are still unimplemented. Saving an agent definition/version locally is not deployment.

Next integration work must connect the existing object/access contract to actual identity, resources, revision/event storage and delivery; then bind agent definitions/versions/assignments to an executing runtime with permission-filtered context, durable approvals and recoverable jobs. File/browser feasibility gates remain. No paid service, provider or production hosting stack was selected by this UI revision. Do not add a mocked Deploy success to hide that gap.

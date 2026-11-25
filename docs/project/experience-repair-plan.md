# Experience repair implementation — 2026-11-06

Authorized: “proceed with a plan to fix, implement, and inporve the whole experiance. needs to be so smooth, easily traversed, and simple”.

## Implementation choices

1. Persistent narrow app strip: navigation disclosure, new chat, account. Adjacent menu: Personal and all projects expand independently; an explicit Workspace leaf opens work, channels and conversations open chats. Expansion never navigates. No duplicated space switcher, Members page or new destination invented for the strip.
2. Participant identity opens the existing private conversation; project agent identity in fixed work module opens its shared project work. Chat headers expose secondary settings through in-place disclosure. Shared transcripts remain shared with or without mentions. Remove composer audience menu; show destination as text, keep drafts by destination.
3. Fixed utilities contain clickable real agent identity/status, work and pending decisions, plus orientation and participants. No settings popup. Preserve individual minimization across navigation. Agent configuration remains a real server operation in conversation context.
4. Graph retains its full surface. Documents occupy a bounded reading sheet within it; ancestor nodes provide back navigation. Remove Full graph control, keep keyboard traversal and physics. Chat documents expand inside the transcript region, never into a side column.
5. Arial, neutral contrast, crisp unscaled chrome, compact consistent spacing. Preserve profile appearance/sign-out functionality in an inline account view.

## Control budget

Reuse existing controls/identities: rail disclosure replaces space-mode selection, Workspace leaf distinguishes destination from heading disclosure, participant identity replaces separate message/profile actions, native settings disclosure replaces standalone agent page, ancestor nodes replace Full graph. No new global destinations. Existing create/deploy/add/member and document-edit operations remain available in context.

## Verification

Automated regressions: independent disclosures, drafts across private/group and surfaces, direct agent conversations/settings persistence, full-size Graph with reader, no stale controls, parent/root node traversal, physics spring-back, utility minimization and nav resizing, server permissions and actual persistence. Review actual preview build/process/data/runtime and screenshots at full/compact sizes in both themes. Verify real provider separately; deterministic fixtures do not close live-runtime acceptance.

## Implemented and verified

- Independent project disclosure, persistent narrow app strip, resizable/hideable adjacent navigation. Opening account settings and returning preserves the active conversation.
- Conversation-bound composer with no audience menu or delegation mode. Existing participant names open private chats. Group drafts remain when returning. Separate personal chats are persisted with named histories.
- Agent identities open real conversations. Configuration expands within the conversation; permissions are saved on the server. Ongoing assignments remain available through `/assign` in an agent work/personal conversation, with active assignments and Stop in the conversation. This replaces the former assignment form/mode; it does not introduce a composer control.
- Content-sized, individually minimizable fixed utilities; no settings popup or utility column. Tools remember minimization per space. The agent identity connects to shared work, and job/approval/assignment rows use actual records.
- Graph document reader stays bounded inside the full work surface. Parent/root graph nodes replace Full graph. Graph positions are remembered across surface changes; nodes avoid the reader and measured utility bounds. Compact reading width improves when the container narrows. Chat resources expand within the conversation.
- Unsaved reader edits and per-conversation drafts survive navigation. Draft persistence is account-scoped. Legacy unscoped `sw-ui-v1` data is retained untouched, but not automatically imported into another account because it contains no reliable ownership information.
- Arial remains the app font. Fixed `.graph svg` styling that incorrectly absolutely positioned icons inside Graph nodes. No page zoom or rasterized text scaling was introduced.
- Live execution is the default. Missing credentials and exhausted budgets produce explicit errors; they never substitute scripted replies. Scripted runtimes are explicit fixtures only.

## Root causes repaired

Graph, Utilities and Composer had duplicate sibling React keys (all the space ID). This left orphan Graph DOM after switching to Canvas and explains the sticking Graph controls. Keys are now distinct, and regressions assert that no Graph DOM remains after switching. Browser checks also fail on rendering exceptions or duplicate-key warnings.

Orb state changes could reset the animation start time after the queued RAF timestamp. That passed negative time into the package's shaping renderer. Elapsed time is clamped at zero; a deterministic regression reproduces the timestamp ordering.

## Evidence and limits

- Typecheck, production build and format check pass.
- **21 unit/server tests pass**, covering permissions, separate personal histories, provider budget behavior, default unavailable runtime and the orb timing regression.
- **8 browser scenarios pass**, covering real persisted test conversations between two browser users, private/group visibility, Graph spring-back and nested navigation, fixed-tool minimization, navigation resizing/disclosure, specialist settings, reader draft retention, profile return, separate personal histories and account-isolated drafts. Agent replies in these tests use an explicitly scripted fixture and do not prove live model execution.
- Reviewed actual port 4175 with its existing `data/real-preview.db`, at 1440×900 and 820×700, light/dark. Native-scale captures are under `workstation/test-results/experience-review/` (local ignored review evidence). The compact-reader capture includes the final width adjustment; earlier dark capture precedes that width adjustment. No fabricated messages were inserted; preview message count remained zero.
- No stale Graph DOM after Canvas navigation; no browser exceptions in the final verified run. The compact reader and visible Graph nodes were checked against tool/reader rectangles with no intersections in the reviewed state.
- **Blocked (updated Nov 7):** live model execution was attempted through the browser with the configured key, using an isolated in-memory database and the existing application runtime. OpenAI returned HTTP 429: no credits remaining. The actual preview on port 4175 reports OpenAI / gpt-4.1-mini and serves the current build. Billing credits are required before a successful reply can be verified. No scripted fallback ran.
- **Not implemented:** external plugin integrations. The settings correctly identify current built-in tools and state that external plugins are not connected. A checkbox does not claim a service integration.
- **Not checked:** arbitrary phone-sized layouts, large teams/history loads, production authentication and user acceptance of the revised visual design. The preview still uses the existing local name-picker sign-in.

## History audit

Compared the current Graph to `archive/prototype-2026-10-28:workstation/src/Graph.tsx`. Restored/preserved force-link distance/strength, repulsion, collisions, center attraction, bounded central drag and spring-back, remembered coordinates and exclusion around fixed content. The earlier Full graph control is deliberately removed per the latest instruction, not copied from history.

The server-backed rewrite also omitted message pins, image references/drops, richer structured Canvas editing and saved arrangements/per-person layouts. These are confirmed gaps against the earlier implementation/review, not features verified by this UI repair. Porting the old browser-only data implementations would bypass the current persistence/access model. They remain recorded for a separate server-backed implementation, rather than silently labeled complete. Existing direct writing, notes, resource permissions and shared discussions remain covered.



## November 7 — resumed live validation

The user authorized configuring the supplied credential for a quick validation. The key is stored only in the gitignored root `.env` with permissions 600; it is not included in this record. The preview was restarted with the live runtime.

A real request was submitted through the app's browser composer in an isolated in-memory database. The job failed with OpenAI HTTP 429 and the provider message “You have no credits remaining.” No success is claimed. The application displayed the provider error and did not fall back to scripted output. Local evidence: `workstation/test-results/experience-review/live-validation.json`. The existing preview's message count remained zero, and its HTML matched the current built artifact. Retry one small request after the user adds API credits; no further UI change is needed to address this provider response.

# Working on Sandbox Workstation

1. Read `docs/SPEC.md` (confirmed requirements), `docs/DECISIONS.md` (dated decisions and open items) and `docs/STATE.md` (what is built). Later decisions win. Read `docs/project/product-corrections.md` before UI work: it consolidates the latest corrections and mandatory acceptance gates. Shared planning notes: `docs/project/`.
2. `docs/record/conversation-context.md` is the verbatim interview record. Append to it when Dylan gives durable direction; don't rewrite it.
3. `docs/archive/` holds superseded plans, reviews and evidence. Use it as history only; never restore rejected designs from it.

Rules:

- Don't fake anything: no simulated people, agents, delivery or "working" states. Scripted agent output is labelled as scripted.
- Every read goes through the server's access checks. Private stays private across chat, graph, search, presence and agent context.
- Ask Dylan only consequential, decision-shaped questions. Don't re-ask anything settled in `DECISIONS.md`.
- Keep `main` working: typecheck, format and tests green. Add tests for new behaviour.
- Secrets (`OPENAI_API_KEY`) live only in the gitignored root `.env` and are read server-side.

Product review gates (required):

- Current user direction overrides older plans and built UI. Keep confirmed requirements, proposals and implementation status distinct; update conflicting docs in the same change.
- Map UI work to `docs/project/product-corrections.md`. Review the supplied screenshot references and complete user flow before choosing components.
- Do not default to another button, popup, selector, page or rail. Justify each new control against existing interactions. Rejected designs cannot return under another component name.
- Preserve the open Canvas/Graph surface. Project tools float at fixed positions and minimize in place; neither tools nor the Graph reader may take a full-height side column.
- Navigation expansion is independent of destination selection. Preserve current work and drafts. The far-left strip and adjacent menu must not duplicate private/workspace switching.
- Treat collaborative agents as participants. Show actual work and conversation before configuration; no placeholder module or fake execution.
- Verify transitions and visual quality on the exact intended running preview, plus appropriate automated checks. Report each affected requirement as verified, failed, blocked or not checked. Tests passing is not design acceptance.
- Do not present an incomplete replacement preview as ready. Keep unverified and blocked requirements open and state the limitation plainly.

- All application agents must exclusively use OpenAI gpt-6-luna. No user-facing model selection or client/per-agent model overrides. Verify provider compatibility before enabling calls. Follow `docs/project/mvp-plan.md` for the expanded MVP scope.

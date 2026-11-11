# Working on Sandbox Workstation

0. Read `docs/PLAN.md` first: what is being built, the lineage across Dylan's repos (CampaignOS, mimirs-well, DropDeployment, this one) and his working rules. Reuse that earlier work; do not reinvent it.
1. Read `docs/SPEC.md` (confirmed requirements), `docs/DECISIONS.md` (dated decisions and open items) and `docs/STATE.md` (what is built). Later decisions win.
2. `docs/record/conversation-context.md` is the verbatim interview record. Append to it when Dylan gives durable direction; don't rewrite it.
3. `docs/archive/` holds superseded plans, reviews and evidence. Use it as history only; never restore rejected designs from it.

Rules:

- Don't fake anything: no simulated people, agents, delivery or "working" states. Scripted agent output is labelled as scripted.
- Every read goes through the server's access checks. Private stays private across chat, graph, search, presence and agent context.
- Dylan does not run terminal commands and does not review PRs. Give him something that opens (`npm run build:inpage`, published as a page), finish the work, and report plainly.
- Never show an empty product for review; the in-page preview seeds a labelled example project.
- Ask Dylan only consequential, decision-shaped questions. Don't re-ask anything settled in `DECISIONS.md`.
- Keep `main` working: typecheck, format and tests green. Add tests for new behaviour.
- Secrets (`OPENAI_API_KEY`) live only in the gitignored root `.env` and are read server-side.

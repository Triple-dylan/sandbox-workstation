# Working on Sandbox Workstation

These instructions apply to every harness (Claude Code, Codex, Cursor and any other). The repository on GitHub is the project's only memory: no harness's chat history, memory, cloud session or published page (artifact) counts as the record. If something matters, it is committed and pushed here.

## GitHub rules (hard)

- **Never add a co-author tag or AI attribution** anywhere on GitHub: no `Co-Authored-By:` trailers, no "Generated with …" lines, in commits, PR titles or bodies, review comments, issues, tags or releases. Commits are authored as Dylan (the local git identity).
- **`main` is the source of truth.** It always builds and passes CI. Nothing is committed to `main` directly; work reaches it through a pull request.
- **Start from an up-to-date `main`** (`git fetch && git switch -c <harness>/<topic> origin/main`). Name branches by harness and topic: `claude/…`, `codex/…`, `cursor/…`.
- **Never end a session with uncommitted or unpushed work.** Commit in small, coherent steps and push the branch before you stop, even if the work is unfinished (say so in the PR).
- **One pull request per change, kept small.** The PR body says what changed, why, and what was and was not verified. Update `docs/STATE.md` and `docs/DECISIONS.md` in the same PR when behaviour or direction changes.
- **Merge only with green CI and Dylan's go-ahead.** Squash-merge so `main` gets one clean commit per change, then delete the branch.
- **Never force-push `main`** or rewrite history on a branch someone else may have pulled, unless Dylan asks for it.
- **Before starting, check for open branches and PRs** touching the same area (`git fetch --prune`, `gh pr list`). Continue or rebase onto that work rather than starting a parallel line.
- Nothing secret or generated goes in git: `.env`, databases under `workstation/data/`, build output, logs.
- Commit messages are short, imperative and say what changed (and why, when it isn't obvious).

## Before you work

0. Read `docs/PLAN.md` first: what is being built, the lineage across Dylan's repos (CampaignOS, mimirs-well, DropDeployment, this one) and his working rules. Reuse that earlier work; do not reinvent it.
1. Read `docs/WEBAPP.md` for what a hosted version still needs. Read `docs/SPEC.md` (confirmed requirements), `docs/DECISIONS.md` (dated decisions and open items) and `docs/STATE.md` (what is built). Later decisions win.
2. `docs/record/conversation-context.md` is the verbatim interview record. Append to it when Dylan gives durable direction; don't rewrite it.
3. `docs/archive/` holds superseded plans, reviews and evidence. Use it as history only; never restore rejected designs from it.

Rules:

- Don't fake anything: no simulated people, agents, delivery or "working" states. Scripted agent output is labelled as scripted.
- Every read goes through the server's access checks. Private stays private across chat, graph, search, presence and agent context.
- Dylan does not run terminal commands. Give him something that opens (`npm run build:inpage` writes one HTML file), finish the work, and report plainly. A published preview page is only a way to look at a build; the code and decisions behind it must be on GitHub first.
- Don't compartmentalise the interface: no summary pages that take over the view, no frames and separator lines boxing areas off, and nothing docked or fixed over content that scrolls. Check layouts while resizing the window.
- Never show an empty product for review; the in-page preview seeds a labelled example project.
- Ask Dylan only consequential, decision-shaped questions. Don't re-ask anything settled in `DECISIONS.md`.
- Keep `main` working: typecheck, format and tests green. Add tests for new behaviour.
- Secrets (`OPENAI_API_KEY`) live only in the gitignored root `.env` and are read server-side.
- Agents answer only with OpenAI `gpt-6-luna`, fixed in code with no setting to change it. The one other model allowed is `text-embedding-3-small`, for search vectors only.

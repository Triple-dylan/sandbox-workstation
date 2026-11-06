# Sandbox Workstation: project context

Repo: Triple-dylan/sandbox-workstation (private). Review: [project-review.md](./project-review.md)

## Decisions (Dylan, 2026-11-05)

- Next phase: build the real product (backend, real identities and data, running agents). Stop the UI-only redesign loop.
- Everything needs refining; overhauls are welcome wherever they move closer to Dylan's vision. Fresh eyes are wanted.
- Multiplayer from the first real build: usable by Dylan plus a second and ideally a third person.
- All five first-message situations must work: workspace instruction, private agent ask, message a person, discuss selected work, delegate ongoing work.
- The agent may choose the stack and paid providers. No cost ceiling has been stated, so flag anything significant.
- Delete `prototype/`, keeping a git tag so it can be recovered.
- Move the repo off the iCloud-synced Desktop.
- Agents use the **Orb** character: abstract core in a thin ring, no face; state shown through motion. Dylan picked this on 2026-11-05.
- The canvas starts blank but usable: no demo planning-doc content.

## Direction update (Dylan, 2026-11-05)

- Proceed with all phases, but put the effort into a usable demo first: local first, and if it goes on the web, hosted at minimal cost through Dylan's Cursor account (for example Cursor's app publishing, with its built-in database and sign-in) instead of paid Convex, Clerk or Vercel.
- Don't take on paid providers or LLM spend yet. The full stack and the LLM cap are deferred until the demo is in good shape.
- Dylan can supply an OpenAI API key for agents. The runtime uses a scripted stub by default and the OpenAI provider when `OPENAI_API_KEY` is set in a local `.env`.

## Defaults assumed (not yet confirmed)

- Consolidate the docs into a spec, a decision log and a current-state note, and archive the rest.
- Adopt an off-the-shelf rich-text editor.
- Office and browser modules are deferred until the core loop works.

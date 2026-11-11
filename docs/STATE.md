# Current state

_Updated 2026-11-11._

## Run it

```sh
cd workstation
npm ci
npm start                 # http://127.0.0.1:4174
HOST=0.0.0.0 npm start    # let others on a trusted network join
```

Optional real agents: `cp .env.example .env` in the repo root and set `OPENAI_API_KEY`. Without it, agents use the free scripted runtime.

## Open it without running anything

`npm run build:inpage` writes `dist-inpage/workstation.html`: the client and the real server (store, access checks, agent engine) bundled into one page, with data kept in that browser. It is for looking and trying alone; several people at once still need `npm start`.

## What works (demo track)

- Local server with SQLite and live sync (Server-Sent Events). Several people at once, each picking a name; no passwords (demo only).
- Personal space (always private) plus shared projects. Each project gets `#general`, a project agent, a "Resources & context" folder and an Orientation doc the agent maintains.
- Blank canvas: click anywhere and type. Notes save as you type, move on a 24px grid with collision checks, can be private or shared, and show who is working on them.
- Graph: live physics with the space anchored at the centre (it can be nudged and springs back), draggable nodes, foldable folders, typed unframed nodes, private items marked, and documents readable without leaving the graph. Agents and people appear at what they are touching.
- Shell: one full-bleed dotted surface. Slim floating rail, navigation sheet, conversation, project tools and composer sit in reserved lanes and never cover work. The newest unread reply shows above the composer.
- Composer with an explicit audience covering the five first-message situations: instruct the project agent, privately ask your agent, message a person, discuss selected work, delegate ongoing work.
- Agents shown as animated orbs with visible states (idle, working, waiting for approval). Proposals need a person's approval; delegated work can be stopped.
- One access check in the store governs everything a person or agent can see.

## Next

See `docs/PLAN.md`. Step 3 is the living board: more object types, and opening an object into a full working view with the rest folded into a shelf.

## Not yet

Real accounts, hosting, file uploads, images, search, undo, and the October prototype's richer canvas (pins, plans, image drops). See `docs/DECISIONS.md` for what was deliberately cut.

## Checks

From `workstation/`: `npm run typecheck`, `npm run format:check`, `npm test`, `npm run build && npm run test:e2e`. CI runs all of them. Set `CHROMIUM_PATH` to run the browser test with an existing Chromium.

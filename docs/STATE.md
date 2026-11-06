# Current state

_Updated 2026-11-05._

## Run it

```sh
cd workstation
npm ci
npm start                 # http://127.0.0.1:4174
HOST=0.0.0.0 npm start    # let others on a trusted network join
```

Optional real agents: `cp .env.example .env` in the repo root and set `OPENAI_API_KEY`. Without it, agents use the free scripted runtime.

## What works (demo track)

- Local server with SQLite and live sync (Server-Sent Events). Several people at once, each picking a name; no passwords (demo only).
- Personal space (always private) plus shared projects. Each project gets `#general`, a project agent, a "Resources & context" folder and an Orientation doc the agent maintains.
- Blank canvas: click anywhere and type. Notes save as you type, move on a 24px grid with collision checks, can be private or shared, and show who is working on them.
- Graph: the space as a tree (space, folders, docs, canvas notes), with agents and people shown on what they are touching.
- Composer with an explicit audience covering the five first-message situations: instruct the project agent, privately ask your agent, message a person, discuss selected work, delegate ongoing work.
- Agents use the **Orb** character via `thinking-orbs` (canvas particles; idle=`breathing`, working=`working`, waiting=`shaping`) at chat/rail 18, canvas 26, graph 28, panel 40. Proposals need a person's approval; delegated work can be stopped.
- One access check in the store governs everything a person or agent can see.

## Not yet

Real accounts, hosting, file uploads, images, search, undo, and the October prototype's richer canvas (pins, plans, image drops). See `docs/DECISIONS.md` for what was deliberately cut.

## Checks

From `workstation/`: `npm run typecheck`, `npm run format:check`, `npm test`, `npm run build && npm run test:e2e`. CI runs all of them.

# Current state

_Updated 2026-11-06._

## Product acceptance status

The Nov 6 navigation, conversation and Graph UI repairs are implemented and checked; see [the implementation/evidence record](project/experience-repair-plan.md). The runtime is pinned to gpt-6-luna with no environment or constructor model override. A minimal Nov 7 live API request returned HTTP 200 with gpt-6-luna; full agent workflows still need live validation. External plugin integrations and user acceptance of the revised design remain outstanding. Automated tests use explicit scripted fixtures, not live-model proof.

## Run it

```sh
cd workstation
npm ci
npm start                 # http://127.0.0.1:4174
HOST=0.0.0.0 npm start    # let others on a trusted network join
```

Optional real agents: `cp .env.example .env` in the repo root and set `OPENAI_API_KEY`. Without it, agents report Model unavailable. Scripted execution requires an explicit development/test setting; budget exhaustion does not trigger a scripted fallback.

## What works (demo track)

- Local server with SQLite and live sync (Server-Sent Events). Several people at once, each picking a name; no passwords (demo only).
- Personal space (always private) plus shared projects. Each project gets `#general`, a project agent, a "Resources & context" folder and an Orientation doc the agent maintains.
- Blank canvas: click anywhere and type. Notes save as you type, move on a 24px grid with collision checks, can be private or shared, and show who is working on them.
- Graph: the space as a tree (space, folders, docs, canvas notes), with agents and people shown on what they are touching.
- A persistent app strip beside the resizable/hideable navigation menu. Personal/projects expand independently in place, with channels, named personal/work conversations and participant DMs. The project composer starts work with the main agent in a separate shared conversation. An open channel uses the main area and keeps its own composer.
- Project owners can deploy specialists and edit instructions, skills and built-in tool permissions within their conversations. Members can inspect real work/status, DM a specialist or mention it in a channel. External plugins are not connected.
- Agents use the **Orb** character via `thinking-orbs` (canvas particles; idle=`breathing`, working=`working`, waiting=`shaping`) at chat/rail 18, canvas 26, graph 28, panel 40. Proposals need a person's approval; delegated work can be stopped.
- Projects start with empty channels and an empty agent conversation. Graph starts with a folder tree and an Orientation or workspace guide document. Shared resources open inside the chat that references them. Graph reading uses a bounded sheet inside Graph, never a side column.
- One access check in the store governs everything a person or agent can see.

## Not yet

Real accounts, hosting, file uploads, images, search, undo, and the October prototype's richer canvas (pins, plans, image drops). See `docs/DECISIONS.md` for what was deliberately cut.

## Checks

From `workstation/`: `npm run typecheck`, `npm run format:check`, `npm test`, `npm run build && npm run test:e2e`. CI runs all of them.

## November 7 MVP foundation work (in progress)

Direct Google sign-in was added using google-auth-library, with identity keyed by Google subject rather than display name. New sessions expire after seven days; logout revokes the server session. Production requires a Google client ID and HTTPS origin, blocks demo-profile login and rejects scripted runtime. Live Google sign-in remains unverified and unconfigured. User asked for easier setup: Firebase Authentication is recommended; switching providers has not been implemented. Existing demo profiles are preserved, not silently linked to Google accounts.

Graph-to-Canvas placement no longer uses a stale global canvas size. It opens Canvas, measures the actual viewport and avoids visible tool/composer/toolbar rectangles before saving the same resource placement. General resize recovery and movable rich document/sheet components remain outstanding.

Deployment Dockerfile and health endpoint are prepared; no container build, hosting setup or deployment has been validated. This is not yet a release-ready MVP.

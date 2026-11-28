# Workstation app

A local server (Node + built-in SQLite) and a React client. Several people can use it at once from one machine or a trusted local network; every change syncs live.

## Run

Node 22.18 or later.

```sh
npm ci
npm start            # builds the client, then serves everything on http://127.0.0.1:4174
```

- **Others on your network:** `HOST=0.0.0.0 npm start`, then share the printed LAN address. Sign-in is a name picker with no passwords, so only do this on a network you trust.
- **Development:** `npm run dev` runs the API on 4175 (reloads on change) and Vite on 4174 with a proxy.
- **Data:** `data/workstation.db` (gitignored). Delete it to start fresh. `WORKSTATION_DB=/path/to.db` uses another file.

## Agents

Agents run on a pluggable runtime (`server/agents/runtime.ts`).

- **Not connected** (no key): agents say so and answer nothing. The scripted runtime in `server/agents/scripted.ts` is used only by the tests.
- **OpenAI**: used when `OPENAI_API_KEY` is set. Copy `../.env.example` to `../.env` (repo root, gitignored) and fill in the key. The key is read only by the server and never sent to the browser or logged. Every agent uses `gpt-6-luna`; there is no model setting. Default safety net: 10M tokens per UTC day for the server (`OPENAI_DAILY_TOKEN_LIMIT`); past the limit, agents say so and answer nothing.

The server prints which runtime is active at startup, and agent messages are tagged with it.

## Layout

| Path | What |
| --- | --- |
| `server/` | HTTP + live events (`app.ts`), the access-checked data store (`store.ts`), SQLite schema (`db.ts`), agents (`agents/`), live document editing (`collab.ts`), Google Sheets and Excel links (`connectors/`), the bridge to the shared browser service (`browser/`) |
| `shared/` | Records shared by server and client (`types.ts`), the sheet model and formulas (`sheet.ts`, `formula.ts`) |
| `src/app/` | Shell, sign-in, the left list, the agent rail, view state |
| `src/data/` | `client.ts`: the only place the browser talks to the server; live snapshot |
| `src/pages/` | One editor per page kind (document, sheet, deck, canvas, browser, asset, chat, graph, people) and `Pane.tsx`, which hosts them |
| `src/features/` | `graph`, `feed`, `share`, `collab`, `import`, `presence`, `plan`, `agents` (characters), `connectors`, `canvas` |
| `tests/` | Server, privacy, five-situation and client-logic tests; `e2e/` drives two browsers |

## Checks

```sh
npm run typecheck
npm run lint           # rules of hooks
npm run format:check
npm test             # server + client logic
npm run build && npm run test:e2e   # two people in two browsers (uses local Chrome; bundled Chromium in CI)
```

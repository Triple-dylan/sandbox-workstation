# Sandbox Workstation

A general-purpose open canvas workstation for people and agents, with private and collaborative spaces, project channels, and a physics-based graph of shared knowledge.

**Current status:** local interaction prototype. Previous visual passes were rejected; the current revision has not been accepted by the user. Real multiplayer, server-enforced access, durable resource storage, document-engine integration, retrieval and executing agents are not implemented.

## Start here for handoff

1. Read [AGENTS.md](AGENTS.md).
2. Read [Conversation Context.md](Conversation%20Context.md) in full. Later confirmed answers supersede earlier exploratory ideas. Do not restart a generic discovery interview.
3. Read [Interaction Contract.md](Interaction%20Contract.md) and [Design Research and Revision Plan.md](Design%20Research%20and%20Revision%20Plan.md). They contain the rejected behavior, latest corrections, reference research, second-pass audit and next implementation gates.
4. Use [Object and Access Model.md](Object%20and%20Access%20Model.md) as the proposed data/access contract, not a claim of implemented authorization.
5. Follow [prototype/README.md](prototype/README.md) for the review flow, tests and exact capability limits.

Confirmed requirements, proposed architecture and implementation facts are intentionally distinguished. No production stack, provider, hosting service, budget or schedule has been approved.

## Run locally

Requires Python 3.10+; the application and Office parser use the standard library and browser APIs. No application installation/build is needed.

```sh
python3 prototype/server.py --port 4173
```

Open <http://127.0.0.1:4173/>. The server binds to loopback. Office imports need this server, rather than a generic static file server. Records persist in browser-local storage; they are not Git-tracked project data or durable backups.

## Code map

| Path | Responsibility |
| --- | --- |
| `prototype/app.js` | Local records, scope filtering, channels/threads, sharing/history, Project module, graph/canvas orchestration |
| `prototype/spatial.js` | World/screen coordinates, anchored zoom, fit and snapping |
| `prototype/viewers.js` | Local document/workbook/slide surfaces and basic formula evaluation |
| `prototype/icons.js`, `prototype/style.css` | SVG icon family and current visual treatment |
| `prototype/office_import.py`, `prototype/server.py` | Bounded local OOXML extraction and loopback import endpoint |
| `prototype/tests/` | Geometry/formula/parser checks, browser scenarios and generated Office fixtures |

## Checks

```sh
node prototype/tests/spatial.cjs
node prototype/tests/viewers.cjs
python3 -m unittest discover -s prototype/tests -p 'test_*.py'
```

Browser tests are optional development tooling. With the local server running, install Playwright locally and run:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node prototype/tests/run-browser.cjs
```

`WORKSTATION_URL` can override the local URL. Each scenario uses a fresh browser context. Fixtures load from the preview server, so no original machine paths are required. The recorded prior run passed 66 browser assertions; see the prototype guide for what those assertions establish. Passing checks do not establish design acceptance, production readiness or a completed MVP.

Current visual-review images are retained with the prototype. Superseded screenshots and generated machine artifacts are excluded from Git; the original local files are preserved.

# Shared browser service

The workstation's shared browser runs here: real Chrome on its own Railway service, driven by the
app over a WebSocket. Nothing browser-related runs on the app's server or on anyone's computer.

Everything it needs is in this folder (`service.ts`, `guard.ts`, `pages.ts`, `health.ts`,
`front.ts`, `Dockerfile`), so Railway builds
it on its own with **Root Directory** set to `/browser-service`. Its other settings live in Railway
(Restart Policy: On Failure), not in a file.

Settings: `BROWSER_TOKEN` (a long random secret, 24+ characters) and `PORT` (Railway sets it).
The app connects with `BROWSER_SERVICE_URL=ws://<service>.railway.internal:<port>/<BROWSER_TOKEN>`.

Playwright's own server listens on the service's machine alone. `PORT` is a small front door
(`front.ts`) that lets through only a connection to `/<BROWSER_TOKEN>` and answers `GET /healthz`
with whether Chrome is running, its memory and how many pages are open (200, or 503 when Chrome
is gone). Everything else gets a 404; in particular Playwright's `/json`, which would otherwise
tell anyone who asks the secret address. Railway's health check can point at `/healthz`.

## Staying inside its memory

The service runs in 2 GB, and every open page in Chrome costs memory, so it looks after itself:

- **Idle pages close.** A page whose address and title haven't changed for 30 minutes is closed,
  whichever app connection opened it. The app already closes a workspace's pages five minutes after
  the last person leaves; this catches any page that slips past that. `PAGE_IDLE_MINUTES` changes
  the time, and `0` turns it off. Someone reading one page for half an hour without clicking
  anywhere will see that tab close too.
- **A health line every minute** in the service's log, for example
  `health: memory 900 MB of 2048 MB, Chrome 550 MB, service 60 MB, 5 pages open in 2 workspaces, 3 idle pages closed`.
  Memory is the container's own count against its limit; Chrome's figure adds up its processes and
  reads a little high, since memory they share is counted in each.

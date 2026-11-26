# Shared browser service

The workstation's shared browser runs here: real Chrome on its own Railway service, driven by the
app over a WebSocket. Nothing browser-related runs on the app's server or on anyone's computer.

Everything it needs is in this folder (`service.ts`, `guard.ts`, `Dockerfile`), so Railway builds
it on its own with **Root Directory** set to `/browser-service`. Its other settings live in Railway
(Restart Policy: On Failure), not in a file.

Settings: `BROWSER_TOKEN` (a long random secret, 24+ characters) and `PORT` (Railway sets it).
The app connects with `BROWSER_SERVICE_URL=ws://<service>.railway.internal:<port>/<BROWSER_TOKEN>`.

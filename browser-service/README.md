# Shared browser service

The workstation's shared browser runs here: real Chrome on its own Railway service, driven by the
app over a WebSocket. Nothing browser-related runs on the app's server or on anyone's computer.

The code is `workstation/server/browser/service.ts` (it shares the connection guard with the app).
This folder holds what builds and runs it: `Dockerfile` and `railway.json`.

Settings: `BROWSER_TOKEN` (a long random secret, 24+ characters) and `PORT` (Railway sets it).
The app connects with `BROWSER_SERVICE_URL=ws://<service>.railway.internal:<port>/<BROWSER_TOKEN>`.

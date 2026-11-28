# Self-hosting Sandbox

Sandbox runs on one machine with Docker Compose: the app, its shared browser, and the database on
a named Docker volume, so it survives restarts, rebuilds and upgrades.

## Start it

1. Install Docker (with Compose) and clone this repository.
2. Copy `.env.example` to `.env` in the repository root and set:
   - `ACCESS_CODE`: the setup code the first people type to get in. Everyone after them joins
     through a workspace's invite link.
   - `BROWSER_TOKEN`: a long random secret, for example the output of `openssl rand -hex 24`.
   - `OPENAI_API_KEY`, if agents should answer. Without it they say they are not connected.
   - `SANDBOX_PORT`, if 8080 is taken.
   - `PUBLIC_URL`, if people reach it at an address other than this machine's (for example
     `https://sandbox.example.com` behind a reverse proxy that adds HTTPS).
3. From the repository root, run `docker compose up -d --build`.
4. Open `http://<this machine>:8080`, choose a name and type the setup code.

Compose stops with a clear message if `ACCESS_CODE` or `BROWSER_TOKEN` is missing.

## Look after it

- **Upgrade:** `git pull`, then `docker compose up -d --build`. The data stays on the
  `sandbox-data` volume.
- **Logs:** `docker compose logs -f app`.
- **Health:** `http://<this machine>:8080/healthz`.
- **Stop:** `docker compose down`. This keeps the data. `docker compose down -v` deletes the
  volume and everything in it.

The browser service publishes no port: only the app reaches it, over Compose's own network.
Google sign-in and Sheets or Excel linking need the same settings as the hosted copy
(`docs/WEBAPP.md`), with this machine's address in place of Railway's.

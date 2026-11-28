# Becoming a web app

Where the build stands against what a hosted, multi-team version needs. Updated 2026-11-14.

## Ready now

- **One deployable unit.** The root `Dockerfile` builds the client and runs the server that serves it; Railway builds it and checks `/healthz` (set in the service's settings, not a file: Railway stops reading `railway.json` on 2026-12-01). Settings come from the environment: `PORT`, `HOST`, `WORKSTATION_DB`, `SIGN_IN`, `ACCESS_CODE`, `GOOGLE_CLIENT_ID`, `WORKSPACE_CREATORS`, `OPENAI_API_KEY`, `OPENAI_DAILY_TOKEN_LIMIT`, `AGENT_SPACE_DAILY_TOKENS`, `AGENT_PERSON_DAILY_TOKENS`, `AGENT_REQUESTS_PER_MINUTE`, `PURGE_AFTER_DAYS`.
- **Health check** at `/healthz`.
- **Sign-in by invitation** (`SIGN_IN=invite`, set in the container). New people join only through a space's invite link (good for 14 days, replaceable) or, for the first people in, the setup code in `ACCESS_CODE`. Someone signs in on another device with a one-time link they make in Settings (15 minutes). Session and sign-in tokens are stored only as hashes. People outside your spaces are not visible and cannot be messaged. The doors in are rate limited.
- **Google sign-in** (set `GOOGLE_CLIENT_ID`). Anyone with a verified Google account can sign up; the same Google account always comes back as the same person. Someone in no workspace yet chooses to start one they own or join one with an invite link; both stay in the space switcher, and a person can be in any number of workspaces. `WORKSPACE_CREATORS` (emails and/or `@domain`s, comma-separated) limits who may start workspaces; unset, anyone signed in may. What anyone can see is still only their private space and the workspaces they start or are invited to. With Google on, joining by name alone is turned off and no setup code is needed. Device sign-in links still work.
- **Safe defaults for a public address:** a content security policy, no framing, session cookies that are `HttpOnly`, `SameSite=Lax` and `Secure` behind HTTPS, a request header check on every write, fingerprinted files cached for a year and the page itself never cached.
- **Installable:** a web manifest and icon, so it can be added to a dock or home screen.
- **One access check** in `server/store.ts` governs every read by a person or an agent. Hosting does not change it.
- **Agents:** passage retrieval, an answer cache and cache-friendly prompts are in the engine, independent of the model provider.
- **Meaning-based search.** With an OpenAI key, page passages are turned into vectors with `text-embedding-3-small` (search only; every answer is still written by gpt-6-luna), stored in the database and redone only when a page changes. Each question is matched by keyword and by meaning, and the two rankings are merged. A page is embedded in the background the first time an agent could search it, so a brand-new page is found by keyword only until then. Embedding tokens are not counted against allowances (they cost about a fiftieth of an answer).
- **Spend safety nets.** One agent call is about 3-4k tokens. Daily limits default to 10M for the server, 3M per space and 1M per person (about 300 questions), and one person can ask agents at most 20 times a minute. They stop a runaway loop or a surprise bill; they are not meant to ration use. Background upkeep counts against its space. Over an allowance, or asking too fast, the agent says so and answers nothing. When OpenAI itself is busy (its per-minute limit for the key, or an error on its side), a call waits as long as OpenAI asks and tries again, for up to 45 seconds, then the agent says OpenAI is busy.
- **Live window sharing** goes browser to browser; the server only relays set-up messages.

## Must be done before real teams use it

1. **Email sign-in.** Invite and device links work without email. Signing in by email (for a lost device) needs an email service such as Resend; not built.
2. **A hosted database.** The database lives on a Railway volume mounted at `/data`. That is fine for one team on one server; more than that needs Postgres (all queries are in `server/store.ts`).
3. **Files out of the database.** Pictures are stored inline as text. Move them to object storage and keep a pointer.
4. **Two people on one slide.** Sheets save per cell and documents merge edits as people type (Yjs, 2026-11-26). Slides are still last-save-wins.
5. **Live updates at scale.** Each change tells every browser to refetch everything it can see. Send changes, not snapshots, and move to WebSockets.
6. **Relay for window sharing.** Across office networks, direct browser-to-browser connections often fail; a TURN relay is needed.
7. **Retrieval at scale.** Keyword ranking is still rebuilt in memory and vectors are compared by brute force, which is fine for thousands of passages; a large corpus wants a vector index (pgvector with Postgres). PDF import is not built.
8. **Limits and abuse.** Upload size policy. (Agent spend limits per space and per person, and a per-person rate, are done.)
9. **Operations.** Error reporting. Nightly backups exist (a copy of the database in `backups/` beside it, last 7 kept); they live on the same volume, so they guard against bad writes, not against losing the volume. Restoring one: `docs/BACKUPS.md`. Deleted workspaces and pages are purged after 30 days (`PURGE_AFTER_DAYS`). A person can delete their data from Settings.

## Suggested order

Accounts and invitations, then Postgres and object storage, then merging slide edits, then change-based live updates. The rest follows demand.

## Deploying to Railway

Built from the root `Dockerfile`, which runs by invitation and keeps its database at `/data/workstation.db`. Railway sets `PORT` and handles HTTPS; the server marks its cookie `Secure` when it sees HTTPS.

Three accounts are needed. Do them in this order, because Google needs the address Railway gives you.

### 1. Railway: create the service

1. Sign in at railway.com with GitHub.
2. **New Project → Deploy from GitHub repo →** `Triple-dylan/sandbox-workstation`. Railway builds the root `Dockerfile`. Leave the branch as `main`, so every merge to `main` deploys. In the service's **Settings**, set **Healthcheck Path** to `/healthz` and **Restart Policy** to On Failure with 5 retries; in **Variables**, `RAILWAY_HEALTHCHECK_TIMEOUT_SEC=60`.
3. Open the service, **Settings → Networking → Generate Domain**. Copy the address (for example `https://sandbox-workstation-production.up.railway.app`).
4. Right-click the service on the canvas → **Attach volume**, mount path `/data`. Without it, everything is lost on each deploy.

### 2. Google: make a sign-in client ID

1. At console.cloud.google.com, create a project (any name).
2. **APIs & Services → OAuth consent screen**: user type **External**, app name "Sandbox Workstation", your email as support and developer contact. Save. While it is in Testing, add your testers' Google emails under **Test users**, or choose **Publish app** so anyone with an invite can sign in (basic sign-in needs no Google review).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**.
4. Under **Authorized JavaScript origins** add the Railway address from step 1.3 (no trailing slash). No redirect URI is needed.
5. Create, then copy the **Client ID** (it ends in `.apps.googleusercontent.com`). The client secret is not used.

### 3. Railway: set the variables

In the service, **Variables**, add:

| Variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | the Client ID from step 2.5 |
| `GOOGLE_CLIENT_SECRET` | optional; turns on linking Google Sheets. The same OAuth client's secret. In Google Cloud, enable the **Google Sheets API**, add the `.../auth/spreadsheets` scope to the consent screen, and add `https://<your address>/api/connect/google/callback` as an authorised redirect URI |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | optional; turn on linking Excel workbooks in OneDrive or SharePoint. An app registration in Microsoft Entra with delegated `Files.ReadWrite`, `User.Read` and `offline_access`, and the redirect URI `https://<your address>/api/connect/microsoft/callback` |
| `BROWSER_SERVICE_URL` | optional; turns on shared browser pages. See "The shared browser service" below |
| `PUBLIC_URL` | optional; the address people use, if sign-in redirects should not be worked out from the request |
| `WORKSPACE_CREATORS` | optional; emails and/or `@domain`s allowed to start workspaces. Unset, anyone signed in may |
| `OPENAI_API_KEY` | your OpenAI key. Without it, agents say they are not connected and answer nothing |
| `OPENAI_DAILY_TOKEN_LIMIT` | optional; default 10000000 per day for the whole server |
| `AGENT_SPACE_DAILY_TOKENS`, `AGENT_PERSON_DAILY_TOKENS`, `AGENT_REQUESTS_PER_MINUTE` | optional; defaults 3000000, 1000000 and 20 |
| `BACKUP_KEEP`, `BACKUP_HOUR`, `BACKUP_DIR`, `BACKUPS` | optional; nightly database copies. Defaults: keep 7, at 3:00 UTC, in `backups/` beside the database. `BACKUPS=off` turns them off |
| `BACKUP_OWNERS` | optional; emails of the people who run this copy. Signed in with one of them, `https://<your address>/api/backup` downloads the newest backup. Unset, nobody can |

Railway redeploys when variables change.

### 4. First sign-in and inviting people

1. Open the Railway address and **Continue with Google**.
2. Start a workspace, then share its invite link (good for 14 days). Invited people only need **Continue with Google**.
3. Check `https://<your address>/healthz` returns `{"ok":true,...}` if anything looks wrong, and read the service's **Deploy Logs** in Railway.

### The shared browser service

Chrome runs in a second Railway service, not in the app. In the same Railway project:

1. **New → Empty service**, named `browser`, connected to this repository. In its **Settings**, set **Root Directory** to `/browser-service` (it builds that folder's `Dockerfile` on its own). Give it at least 2 GB of memory.
2. In its **Variables**: `PORT=3000` and `BROWSER_TOKEN=${{ secret(48, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") }}` (Railway generates it). Don't give it a public domain; the app reaches it on Railway's private network.
3. In the app service's **Variables**: `BROWSER_SERVICE_URL=ws://${{browser.RAILWAY_PRIVATE_DOMAIN}}:3000/${{browser.BROWSER_TOKEN}}`.

The app keeps each workspace's sign-ins in its database; the browser service keeps nothing.


# Becoming a web app

Where the build stands against what a hosted, multi-team version needs. Updated 2026-11-14.

## Ready now

- **One deployable unit.** The root `Dockerfile` builds the client and runs the server that serves it; `railway.json` tells Railway to use it and to check `/healthz`. Settings come from the environment: `PORT`, `HOST`, `WORKSTATION_DB`, `SIGN_IN`, `ACCESS_CODE`, `GOOGLE_CLIENT_ID`, `OPENAI_API_KEY`, `OPENAI_DAILY_TOKEN_LIMIT`, `AGENT_SPACE_DAILY_TOKENS`, `AGENT_PERSON_DAILY_TOKENS`, `AGENT_REQUESTS_PER_MINUTE`.
- **Health check** at `/healthz`.
- **Sign-in by invitation** (`SIGN_IN=invite`, set in the container). New people join only through a space's invite link (good for 14 days, replaceable) or, for the first people in, the setup code in `ACCESS_CODE`. Someone signs in on another device with a one-time link they make in Settings (15 minutes). Session and sign-in tokens are stored only as hashes. People outside your spaces are not visible and cannot be messaged. The doors in are rate limited.
- **Google sign-in** (set `GOOGLE_CLIENT_ID`). People continue with their Google account; only verified Google emails are accepted, and the same Google account always comes back as the same person. Google proves who someone is; an invite link or the setup code still decides who may make a new account. With it set, joining by name alone is turned off. Device sign-in links still work.
- **Safe defaults for a public address:** a content security policy, no framing, session cookies that are `HttpOnly`, `SameSite=Strict` and `Secure` behind HTTPS, a request header check on every write, fingerprinted files cached for a year and the page itself never cached.
- **Installable:** a web manifest and icon, so it can be added to a dock or home screen.
- **One access check** in `server/store.ts` governs every read by a person or an agent. Hosting does not change it.
- **Agents:** passage retrieval, an answer cache and cache-friendly prompts are in the engine, independent of the model provider.
- **Agent spend guardrails.** Besides the server-wide daily limit, each space and each person has a daily token allowance (defaults 100,000 and 50,000), and one person can ask agents at most 10 times a minute. Background upkeep counts against its space. Over an allowance, the agent says so and the labelled stand-in answers; asking too fast gets no answer.
- **Live window sharing** goes browser to browser; the server only relays set-up messages.

## Must be done before real teams use it

1. **Email sign-in.** Invite and device links work without email. Signing in by email (for a lost device) needs an email service such as Resend; not built.
2. **A hosted database.** The database lives on a Railway volume mounted at `/data`. That is fine for one team on one server; more than that needs Postgres (all queries are in `server/store.ts`).
3. **Files out of the database.** Pictures are stored inline as text. Move them to object storage and keep a pointer.
4. **Two people in one document.** Sheets save per cell. Documents and slides are last-save-wins; they need merging edits (a CRDT such as Yjs fits the editor already in use).
5. **Live updates at scale.** Each change tells every browser to refetch everything it can see. Send changes, not snapshots, and move to WebSockets.
6. **Relay for window sharing.** Across office networks, direct browser-to-browser connections often fail; a TURN relay is needed.
7. **Retrieval at scale.** Ranking is lexical and in memory. A large corpus wants a stored index and meaning-based search alongside it; PDF import is not built.
8. **Limits and abuse.** Upload size policy. (Agent spend limits per space and per person, and a per-person rate, are done.)
9. **Operations.** Backups, error reporting, and a way to delete a person's data.

## Suggested order

Accounts and invitations, then Postgres and object storage, then merging edits, then change-based live updates. The rest follows demand.

## Deploying to Railway

Configured by `railway.json` and the root `Dockerfile`, which runs by invitation and keeps its database at `/data/workstation.db`. Railway sets `PORT` and handles HTTPS; the server marks its cookie `Secure` when it sees HTTPS.

Three accounts are needed. Do them in this order, because Google needs the address Railway gives you.

### 1. Railway: create the service

1. Sign in at railway.com with GitHub.
2. **New Project → Deploy from GitHub repo →** `Triple-dylan/sandbox-workstation`. Railway finds `railway.json` and builds the `Dockerfile`. Leave the branch as `main`, so every merge to `main` deploys.
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
| `ACCESS_CODE` | a long random code; the first people in type it once |
| `OPENAI_API_KEY` | your OpenAI key. Without it, agents answer with the labelled scripted stand-in |
| `OPENAI_DAILY_TOKEN_LIMIT` | optional; default 200000 per day for the whole server |
| `AGENT_SPACE_DAILY_TOKENS`, `AGENT_PERSON_DAILY_TOKENS`, `AGENT_REQUESTS_PER_MINUTE` | optional; defaults 100000, 50000 and 10 |

Railway redeploys when variables change.

### 4. First sign-in and inviting people

1. Open the Railway address, type the setup code, and **Continue with Google**.
2. Create a project, then share its invite link (good for 14 days). Invited people only need **Continue with Google**; they don't need the setup code.
3. Check `https://<your address>/healthz` returns `{"ok":true,...}` if anything looks wrong, and read the service's **Deploy Logs** in Railway.

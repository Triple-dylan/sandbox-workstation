# Becoming a web app

Where the build stands against what a hosted, multi-team version needs. Updated 2026-11-14.

## Ready now

- **One deployable unit.** The root `Dockerfile` builds the client and runs the server that serves it; `railway.json` tells Railway to use it and to check `/healthz`. Settings come from the environment: `PORT`, `HOST`, `WORKSTATION_DB`, `SIGN_IN`, `ACCESS_CODE`, `OPENAI_API_KEY`, `OPENAI_DAILY_TOKEN_LIMIT`.
- **Health check** at `/healthz`.
- **Sign-in by invitation** (`SIGN_IN=invite`, set in the container). New people join only through a space's invite link (good for 14 days, replaceable) or, for the first people in, the setup code in `ACCESS_CODE`. Someone signs in on another device with a one-time link they make in Settings (15 minutes). Session and sign-in tokens are stored only as hashes. People outside your spaces are not visible and cannot be messaged. The doors in are rate limited.
- **Safe defaults for a public address:** a content security policy, no framing, session cookies that are `HttpOnly`, `SameSite=Strict` and `Secure` behind HTTPS, a request header check on every write, fingerprinted files cached for a year and the page itself never cached.
- **Installable:** a web manifest and icon, so it can be added to a dock or home screen.
- **One access check** in `server/store.ts` governs every read by a person or an agent. Hosting does not change it.
- **Agents:** passage retrieval, an answer cache and cache-friendly prompts are in the engine, independent of the model provider.
- **Live window sharing** goes browser to browser; the server only relays set-up messages.

## Must be done before real teams use it

1. **Email sign-in.** Invite and device links work without email. Signing in by email (for a lost device) needs an email service such as Resend; not built.
2. **A hosted database.** The database lives on a Railway volume mounted at `/data`. That is fine for one team on one server; more than that needs Postgres (all queries are in `server/store.ts`).
3. **Files out of the database.** Pictures are stored inline as text. Move them to object storage and keep a pointer.
4. **Two people in one document.** Sheets save per cell. Documents and slides are last-save-wins; they need merging edits (a CRDT such as Yjs fits the editor already in use).
5. **Live updates at scale.** Each change tells every browser to refetch everything it can see. Send changes, not snapshots, and move to WebSockets.
6. **Relay for window sharing.** Across office networks, direct browser-to-browser connections often fail; a TURN relay is needed.
7. **Retrieval at scale.** Ranking is lexical and in memory. A large corpus wants a stored index and meaning-based search alongside it; PDF import is not built.
8. **Limits and abuse.** Per-person rate limits, upload size policy, and per-space agent spend limits (there is one daily limit for the whole server).
9. **Operations.** Backups, error reporting, and a way to delete a person's data.

## Suggested order

Accounts and invitations, then Postgres and object storage, then merging edits, then change-based live updates. The rest follows demand.

## Railway

Configured by `railway.json` and the root `Dockerfile`. A service needs:

- a **volume** mounted at `/data` (without it, everything is lost on each deploy);
- the variable `ACCESS_CODE` set to a long random code, for the first people in;
- optionally `OPENAI_API_KEY` (agents answer with the labelled scripted stand-in without it);
- a public domain.

Railway sets `PORT` and terminates HTTPS; the server marks its cookie `Secure` when it sees HTTPS.

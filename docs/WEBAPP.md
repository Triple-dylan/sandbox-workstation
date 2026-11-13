# Becoming a web app

Where the build stands against what a hosted, multi-team version needs. Updated 2026-11-13.

## Ready now

- **One deployable unit.** `workstation/Dockerfile` builds the client and runs the server that serves it. Settings come from the environment: `PORT`, `HOST`, `WORKSTATION_DB`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_DAILY_TOKEN_LIMIT`, `ACCESS_CODE`.
- **Health check** at `/healthz`.
- **An access code** (`ACCESS_CODE`): joining needs it, people are not listed to outsiders, and they come back by typing their name. This is a gate, not accounts.
- **Safe defaults for a public address:** a content security policy, no framing, session cookies that are `HttpOnly`, `SameSite=Strict` and `Secure` behind HTTPS, a request header check on every write, fingerprinted files cached for a year and the page itself never cached.
- **Installable:** a web manifest and icon, so it can be added to a dock or home screen.
- **One access check** in `server/store.ts` governs every read by a person or an agent. Hosting does not change it.
- **Agents:** passage retrieval, an answer cache and cache-friendly prompts are in the engine, independent of the model provider.
- **Live window sharing** goes browser to browser; the server only relays set-up messages.

## Must be done before real teams use it

1. **Accounts.** Replace "pick a name" with real sign-in (email link or an identity provider) and invitations to a space. The session and membership model already exist; the identity step does not.
2. **A hosted database.** SQLite on a volume is fine for one small team on one machine. More than that needs Postgres; all queries are in `server/store.ts`.
3. **Files out of the database.** Pictures are stored inline as text. Move them to object storage and keep a pointer.
4. **Two people in one document.** Sheets save per cell. Documents and slides are last-save-wins; they need merging edits (a CRDT such as Yjs fits the editor already in use).
5. **Live updates at scale.** Each change tells every browser to refetch everything it can see. Send changes, not snapshots, and move to WebSockets.
6. **Relay for window sharing.** Across office networks, direct browser-to-browser connections often fail; a TURN relay is needed.
7. **Retrieval at scale.** Ranking is lexical and in memory. A large corpus wants a stored index and meaning-based search alongside it; PDF import is not built.
8. **Limits and abuse.** Per-person rate limits, upload size policy, and per-space agent spend limits (there is one daily limit for the whole server).
9. **Operations.** Backups, error reporting, and a way to delete a person's data.

## Suggested order

Accounts and invitations, then Postgres and object storage, then merging edits, then change-based live updates. The rest follows demand.

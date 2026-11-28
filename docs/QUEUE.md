# PR queue

_Built 2026-11-27 from `docs/WEBAPP.md`, `docs/AUDIT-2026-11-25.md` and the known gaps in `docs/STATE.md`, checked against `main` at #43._ One line per PR, in the suggested order. When a PR lands, remove its line here in the same PR. Before you start one, check `gh pr list` for a PR already in that area.

## Already done from the audit

Audit steps 1–6 shipped in #21 (ask on the sheet, agents change sheets), #22 (workspace agent as the front door, untagged follow-ups, agents asking agents) and #23 (sheets like Excel, Sheets/Excel connectors, the private chat, @people, watched pages, approval levels). Most of step 7 (D1–D2) is also done: asking a teammate's agent sends them a request, and they decide what it shares. A workspace's own agent can't be retired (A1).

## Next, in order

1. **Run the agent evals against the live model.** `STATE.md` says they have never run live (the OpenAI key's daily limit). Fix whatever fails before building more on agents. *Check, may not need a PR.*
2. **Email sign-in** with an email service such as Resend, for someone who has lost their device (WEBAPP 1).
3. **Postgres instead of the database file on the Railway volume** (WEBAPP 2). All queries are in `server/store.ts`. pgvector can come with it (WEBAPP 7).
4. **Pictures in object storage**, with a pointer kept in the database (WEBAPP 3).
5. **Two people on one slide**: merge edits as documents already do with Yjs (WEBAPP 4).
6. **Live updates that send changes**, not a full refetch, over WebSockets (WEBAPP 5).
7. **One "Waiting for you" place** for every proposal waiting on you (audit C2). Proposals already show where the request came from; no single list was found in the code.
8. **Teammates' agents show as available or busy** (audit D3). Not found in the code.
9. **The workspace agent hands off in the open in channels** ("Asking @Finance", the answer threaded under it) (audit A3). Not confirmed in the code; check it first, since it may already work through #22.
10. **PDF import** (STATE known gaps, WEBAPP 7).
11. **A Claude runtime on the local server**; it has OpenAI only today (STATE known gaps).
12. **Saved graph views, saved questions and seen pages on the server**, not only in the browser (STATE known gaps).
13. **Operations**: backups, error reporting, deleting a person's data, and purging a deleted workspace's rows, which today are only closed off (WEBAPP 9).
14. **Upload size policy** (WEBAPP 8).
15. **A TURN relay for window sharing** across office networks (WEBAPP 6).
16. **Document and file connectors** (Google Docs, Word on OneDrive, Drive, OneDrive), chosen by what real projects use (audit G5). Only when there is demand.

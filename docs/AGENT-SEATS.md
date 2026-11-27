# Agent seats and the MCP server

An **agent seat** lets an agent that runs somewhere else (Claude Code, Codex, Hermes, a Grok bot, anything that speaks MCP) work in Sandbox as itself. Code: `workstation/server/seats.ts` (seats and tokens) and `workstation/server/mcp.ts` (the MCP server). Tests: `tests/seats.test.ts`, `tests/mcp.test.ts`.

## Access

- A seat belongs to the person who made it. Only they bring it into workspaces (shared workspaces they are in), make or revoke its tokens, rename it or retire it. A workspace's owner can also take a seat out.
- In a workspace a seat is a member with its own access, like a person: what the space shares, plus private pages opened to it by name. It never acts with its owner's access (unlike a personal agent), because its token lives on another machine.
- Sandbox's own model never answers for a seat or runs a job as one. A message to it waits until it reads its inbox.
- Reading and chatting are direct. Changes to pages are suggestions that a person in the workspace accepts or declines, the same cards Sandbox's own agents make.

## Tokens

`sbx_` and 43 more characters. Shown once when made, stored only as a SHA-256 hash, last use noted. Revoking one or retiring the seat stops it on the next request. Routes for the owner (signed in): `GET/POST /api/seats`, `POST /api/seats/:id/spaces`, `DELETE /api/seats/:id/spaces/:spaceId`, `POST /api/seats/:id/tokens`, `DELETE /api/seats/:id/tokens/:tokenId`, `POST /api/seats/:id/retire`.

## The MCP server

`POST /mcp` on the app's own address, Streamable HTTP with plain JSON answers (no server-sent stream; `GET` gets 405, which the spec allows). Every request carries `Authorization: Bearer sbx_…`; no session is kept. Requests with an `Origin` other than the app's own are refused, so a web page can't use a token. 120 requests a minute per seat.

Tools: `whoami`, `list_workspaces`, `list_pages`, `read_page` (documents as Markdown, sheets as tab-separated values with their formulas), `search`, `list_chats`, `read_chat`, `inbox` (tagged, addressed or a reply in its thread), `post_message`, `suggest_edit` (replace exact text in a document), `suggest_cells` (`B3 = 2800`, one per line), `suggest_page`, `suggestion_status`, `working_on` (it shows at work on that page, orbiting it in the graph, until `done: true` or 10 quiet minutes).

## Connecting an agent

Use the hosted address, for example `https://<your Sandbox>/mcp`, and a token from the seat.

- **Claude Code:** `claude mcp add --transport http sandbox https://<your Sandbox>/mcp --header "Authorization: Bearer sbx_…"`
- **Codex** (`~/.codex/config.toml`): `[mcp_servers.sandbox]` with `url = "https://<your Sandbox>/mcp"` and `bearer_token_env_var = "SANDBOX_TOKEN"`, then set `SANDBOX_TOKEN`.
- **Hermes, Grok and others:** any remote MCP client that can send an `Authorization` header.

## Not yet

- A screen for seats in the Agents list (make, add to a workspace, copy a token and the line above).
- Browser sign-in (OAuth) for clients that log in themselves (`codex mcp login`, `hermes mcp login`); today a token is pasted.
- Telling an agent when something new arrives (webhooks or a stream); today it checks its inbox.
- A seat in its owner's private space, and direct writes for seats its owner trusts.

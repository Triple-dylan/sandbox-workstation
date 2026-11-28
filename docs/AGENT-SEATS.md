# Agent seats and the MCP server

An **agent seat** lets an agent that runs somewhere else (Claude Code, Codex, Hermes, a Grok bot, anything that speaks MCP) work in Sandbox as itself. Code: `workstation/server/seats.ts` (seats and tokens) and `workstation/server/mcp.ts` (the MCP server). Tests: `tests/seats.test.ts`, `tests/mcp.test.ts`.

## Access

- A seat belongs to the person who made it. Only they bring it into workspaces (shared workspaces they are in), make or revoke its tokens, rename it or retire it. A workspace's owner can also take a seat out.
- In a workspace a seat is a member with its own access, like a person: what the space shares, plus private pages opened to it by name. It never acts with its owner's access (unlike a personal agent), because its token lives on another machine.
- Sandbox's own model never answers for a seat or runs a job as one. A message to it waits until it reads its inbox.
- Reading and chatting are direct. Changes to pages are suggestions that a person in the workspace accepts or declines, the same cards Sandbox's own agents make.

## Tokens

`sbx_` and 43 more characters. Shown once when made, stored only as a SHA-256 hash, last use noted. Revoking one or retiring the seat stops it on the next request. Routes for the owner (signed in): `GET/POST /api/seats`, `POST /api/seats/:id/spaces`, `DELETE /api/seats/:id/spaces/:spaceId`, `POST /api/seats/:id/tokens`, `DELETE /api/seats/:id/tokens/:tokenId`, `POST /api/seats/:id/retire`, `GET /api/seats/:id/activity`.

## What it did

Every MCP tool call is noted for the seat's owner: the tool, whether it read or wrote, whether it worked, the page, chat or workspace it named, and what it searched for. Never what it read or wrote. The owner sees it under What it did on the seat's page. A page, chat or workspace is named only if the owner can see it too; one opened to the seat alone shows as something you can't see. The last 1,000 calls per seat are kept.

A sign-in with a token that once worked but was revoked, or for a retired seat, is noted there too (as Tried to sign in, with why), at most once a minute, so the owner sees why it stopped. Unknown tokens are not noted.

## Test connection

Under Connection on the seat's page (`POST /api/seats/:id/check`, owner only): whether it is connected (signed in within 10 minutes), signed in before but idle, never signed in, has no live token, was turned away on its latest sign-in, or is retired; when and with which token it last signed in; its latest tool call; and a warning when it is in no workspaces. The owner can paste a token to learn whether it is one of this seat's and still works. A pasted token is matched by its hash, is not kept, and does not count as a sign-in; another seat's token is only called not this agent's.

## The MCP server

`POST /mcp` on the app's own address, Streamable HTTP with plain JSON answers (no server-sent stream; `GET` gets 405, which the spec allows). Every request carries `Authorization: Bearer sbx_…`; no session is kept. Requests with an `Origin` other than the app's own are refused, so a web page can't use a token. 120 requests a minute per seat.

Tools: `whoami`, `list_workspaces`, `list_pages`, `read_page` (documents as Markdown, sheets as tab-separated values with their formulas), `search`, `list_chats`, `read_chat`, `inbox` (tagged, addressed or a reply in its thread), `post_message`, `suggest_edit` (replace exact text in a document), `suggest_cells` (`B3 = 2800`, one per line), `suggest_page`, `suggestion_status`, `working_on` (it shows at work on that page, orbiting it in the graph, until `done: true` or 10 quiet minutes).

## Browser sign-in (OAuth)

`server/oauth.ts`. An MCP client that signs in with a browser needs only the address. The 401 from `/mcp` points (`resource_metadata`) to `/.well-known/oauth-protected-resource`, which names this app as the authorization server (`/.well-known/oauth-authorization-server`). The client registers itself at `/oauth/register` (public clients; redirects to https, loopback http on any port, or an app's reverse-domain scheme), sends the person to `/oauth/authorize`, and trades the code at `/oauth/token` (PKCE S256 only, one use, 10 minutes). The person must be signed in to Sandbox in that browser. They choose one of their seats or make a new one in a workspace, and the client gets an ordinary seat token labelled with its name, listed and revocable on the seat's page. Seat tokens don't expire, so there are no refresh tokens. Allow only counts from Sandbox's own page (Origin checked) for the person who opened it.

## Connecting an agent

In a shared workspace, choose New agent, then "Runs elsewhere, like Claude Code" at the bottom of the form. Its page shows the token once, with the lines below filled in for this Sandbox; it makes more tokens later. By hand: the hosted address, for example `https://<your Sandbox>/mcp`, and a token from the seat.

- **Claude Code:** `claude mcp add --transport http sandbox https://<your Sandbox>/mcp`, then sign in from `/mcp` in Claude Code; or add `--header "Authorization: Bearer sbx_…"` to use a token.
- **Codex** (`~/.codex/config.toml`): `[mcp_servers.sandbox]` with `url = "https://<your Sandbox>/mcp"` and `bearer_token_env_var = "SANDBOX_TOKEN"`, then set `SANDBOX_TOKEN`.
- **Hermes, Grok and others:** any remote MCP client that can send an `Authorization` header.

## Not yet

- Trying browser sign-in from each real client (Claude Code, Codex, Hermes) against the hosted copy.
- Telling an agent when something new arrives (webhooks or a stream); today it checks its inbox.
- A seat in its owner's private space, and direct writes for seats its owner trusts.

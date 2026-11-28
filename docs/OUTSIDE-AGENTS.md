# Bringing your own agent

An agent that runs somewhere else (Codex, Hermes, a Grok bot, Claude Code, a script of your own) can work in Sandbox as itself: it reads and writes the workspaces you bring it into, and hears about new messages and page changes. This page is for whoever wires one up.

## 1. Make a seat and a token

A person makes an **agent seat** for the agent and brings it into shared workspaces they are in (`/api/seats`, see `server/seats.ts`). Each seat has tokens that start with `sbx_`. A token is shown once, when it is made; keep it like a password. Its owner can make more, revoke one, or retire the seat, which stops every token.

In a workspace the seat is a member like a person. It reads what the space shares and pages opened to it by name. It never reads its owner's private pages or anything in workspaces it has not joined.

Every request below sends the token:

```sh
export SANDBOX=https://your-sandbox.example
export TOKEN=sbx_...
curl -s -H "Authorization: Bearer $TOKEN" $SANDBOX/api/v1/me
```

## 2. Read

| Request | What comes back |
| --- | --- |
| `GET /api/v1/me` | The seat, its owner and its workspaces |
| `GET /api/v1/spaces` | Its workspaces, with who is in each |
| `GET /api/v1/spaces/:id/pages` | Pages it may open, without their contents |
| `GET /api/v1/pages/:id` | One page with its contents (Markdown for a doc, JSON for a sheet, deck or canvas) |
| `GET /api/v1/spaces/:id/chats` | Chats it may read: channels and discussions of pages it can open |
| `GET /api/v1/chats/:id/messages` | The latest messages, oldest first |
| `GET /api/v1/inbox` | Messages sent to it, the ones waiting for its answer |

`messages` and `inbox` take `limit` (at most 100) and `since` (a date and time). With `since` they return the first messages after that moment, so pass the last `createdAt` you saw to read forward without missing any.

## 3. Write

| Request | Body | What it does |
| --- | --- | --- |
| `POST /api/v1/chats/:id/messages` | `{ "text": "...", "replyTo": "<message id>" }` | Says something, or replies in a thread |
| `POST /api/v1/spaces/:id/pages` | `{ "title": "...", "body": "# Markdown", "visibility": "space" }` | Makes a doc; `"private"` keeps it to the seat |
| `PATCH /api/v1/pages/:id` | `{ "title": "...", "body": "..." }` | Renames a page, or replaces a doc's Markdown |
| `POST /api/v1/pages/:id/cells` | `{ "edits": [{ "row": 0, "col": 0, "value": "..." }] }` | Sets sheet cells, counted from 0 |

Changes carry the seat's name and keep revisions. A seat cannot change someone's private page, a workspace's About page or a browser page, and makes at most 60 changes a minute.

Answering what was sent to it:

```sh
curl -s -H "Authorization: Bearer $TOKEN" "$SANDBOX/api/v1/inbox?since=2026-11-27T00:00:00Z"
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"text":"The build is green.","replyTo":"<message id>"}' \
  $SANDBOX/api/v1/chats/<chat id>/messages
```

## 4. Webhooks

Instead of asking every minute, register an https address:

```sh
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"url":"https://my-agent.example/sandbox"}' $SANDBOX/api/v1/webhooks
```

The answer holds `secret` (`whsec_…`), shown once. `GET /api/v1/webhooks` lists a seat's webhooks with how the last delivery went; `DELETE /api/v1/webhooks/:id` removes one. A seat has at most five. A webhook stops when the token that made it is revoked or the seat is retired.

Sandbox POSTs JSON like this:

```json
{
  "id": "delivery id",
  "type": "message.created",
  "at": "2026-11-27T20:30:00.000Z",
  "agentId": "the seat",
  "data": { "message": { "id": "...", "chatId": "...", "author": { "name": "Maya" }, "text": "@Grok any news?", "toMe": true } }
}
```

- `message.created`: a message in a chat the seat can read. `toMe` is true when it was sent to the seat.
- `page.changed`: a page it can open changed. `data.page` has its details; read the page for its contents. Sent once a burst of edits settles.

The seat's own writes are not sent back. Every event is checked against the seat's access when it is sent.

Check every request before trusting it. `x-sandbox-signature` is `sha256=` and the hex HMAC-SHA256, keyed with the secret, of the `x-sandbox-timestamp` header, a dot, and the raw body:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function fromSandbox(secret, headers, rawBody) {
  const timestamp = headers['x-sandbox-timestamp'];
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const given = String(headers['x-sandbox-signature'] ?? '');
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
```

Answer with any 2xx within 10 seconds. A failed delivery is tried twice more over about a minute. Deliveries are not kept across a server restart, so an agent that must not miss a message also reads `/api/v1/inbox` with `since` when it starts.

Webhooks go only to https addresses on the internet: addresses on the server's own machine or private network are refused, and redirects are not followed.

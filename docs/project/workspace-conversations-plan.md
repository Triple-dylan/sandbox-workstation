# Workspace conversations and agent members

Use the Nov 6 screenshots as functional references. The Codex screenshot shows projects with conversations nested underneath. The Discord screenshot shows channels within a community. Keep these in a single resizable rail. The narrow icon strip is a reference for low visual weight, and the workspace already has a rail hide control.

## Earlier implementation sequence — partially rejected, not instructions

The standalone member view, navigation switching, popup and reader column produced by this sequence were rejected. Use [the consolidated correction register](./product-corrections.md) and its required gates for further work. The recipient-control mechanism below is also not a settled design requirement.

Historical sequence:

1. Separate destinations. Canvas and Graph share the work surface. Opening a channel gives the transcript and its composer the main area. Return to Canvas or Graph from the existing view switch. Check that channel and thread drafts survive.
2. Give the project bar its own path. The first send starts a named project work conversation with the main agent. The composer explicitly labels it shared. Private questions use the existing recipient control and a separate direct conversation. A channel mention gets an agent's attention without changing visibility. See [Slack's agent guide](https://slack.com/help/articles/33076000248851-Work-with-AI-agents-in-Slack).
3. Nest channels, work conversations, direct messages and assignments within their space. List people and agents together as members. Use an agent's member view for its work, status and messaging, then open profile and settings from there.
4. Save deployed agent settings on the server. Only the project owner deploys and edits. Run specialists through the configured provider. Gate project resource context, document proposals and Orientation changes at the server. These are the built-in workspace tools available today.
5. Keep project utilities pinned over Canvas and Graph. A card can minimize independently and has zero grid columns. Keep the preview database free of seeded people and chat history. Verify layout, routing, access checks and settings in a real browser and with server tests.

The preview is local and requires a configured model key for live replies. Browser tests use an isolated database and a labeled deterministic runtime.

## Follow-up corrections from the preview review

- The far-left strip and adjacent menu currently duplicate space switching. Give each a distinct job. Review what belongs on the far-left strip before adding destinations.
- Clicking a workspace heading should expand or collapse it in place. Keep the current work or chat and the rest of the navigation visible.
- Revisit the Members menu placement and how private chats fit alongside workspace chats. Keep one clear route to each destination.
- Rework the agent module around current work and actions that matter. The standalone project-agent view and added popup are rejected. Avoid adding buttons or menus to fill gaps in the interaction model.
- Remove the full-height reader column that opens from Graph. Opening a document must preserve Graph as the primary work surface and its current subject. Review document placement against the open-shell constraints before implementing another viewer layout.

- The extra “Full graph” button is reported to stick and is itself rejected. Preserve Graph navigation without assuming another standalone control is the solution. Reproduction remains pending.

The complete correction list and review rules now live in [product-corrections.md](./product-corrections.md).

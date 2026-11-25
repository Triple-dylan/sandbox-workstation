# MVP deployment preparation — not deployed

The current container build context is `workstation/`. Build with `docker build -t sandbox-workstation .`. It runs as an unprivileged user on port 8080 and requires a writable persistent volume mounted at `/data`. Keep a single instance: SQLite, SSE presence and the current job engine are not a distributed deployment.

Required server environment: `OPENAI_API_KEY`, `GOOGLE_CLIENT_ID`, and exact HTTPS `APP_ORIGIN`. The model is fixed to gpt-6-luna. Never bake secrets or the local preview database into the image. The container disables demo-profile login and scripted execution. An HTTPS reverse proxy must preserve SSE streaming and allow long-lived connections. `/api/health` is a process check, not a provider-readiness check.

Google direct sign-in is implemented but not configured or live-tested. The user asked about easier setup; Firebase Authentication is the recommended alternative and remains a pending provider decision. Do not provision both identity systems or auto-link users by display name. Existing local users require an explicit verified migration before accessing their records through external login.

Release gates still open: container build/run; actual provider login with two accounts; invite-only access; legacy identity migration; backup and restore drill; restart/recovery of active agent work; native documents/sheets, goals and routine execution; Canvas/group-chat acceptance. No host has been selected or provisioned. Do not present this artifact as production-ready.

For backup, stop writes or use SQLite's supported online backup API. Copying only the main database while WAL writes are active is not a valid backup procedure. Test restore into a separate instance before relying on it.

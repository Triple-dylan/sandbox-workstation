# Backups and restoring

## What is kept

Every night at 3:00 UTC the server copies its database into `backups/` beside it (on Railway, `/data/backups/`), keeping the last 7. It also takes one soon after starting when the newest is more than a day old. Each copy is a complete SQLite database named by when it was taken, for example `backup-2026-11-27T030000Z.db`. Settings are in `docs/WEBAPP.md` (`BACKUP_KEEP`, `BACKUP_HOUR`, `BACKUP_DIR`, `BACKUPS=off`).

The copies sit on the same disk as the database. They protect against bad writes and mistakes, not against losing the disk. On Railway that disk is the volume at `/data`; without a volume, the database and its backups are both wiped on every deploy.

To check they are running, open `https://<your address>/healthz`: `backups.newest` is when the last copy was taken, `backups.ageHours` how long ago, and `backups.stale` is true when there is none or the newest is over 26 hours old.

## Getting a copy off the server

Sign in with an email listed in `BACKUP_OWNERS` and open **Settings**. Its **Backups** row shows when the newest copy was taken, with **Back up now** and **Download** beside it. Nobody else sees that row. The download is also at `https://<your address>/api/backup`.

To take a copy now (for example before a risky change), press **Back up now** (it sends `POST /api/backup`). It answers with the new copy's name, which you can then restore by name. A copy taken within the last minute is returned instead of taking another. On-demand copies count toward the 7 kept, so several in a row push out the oldest nightly ones.

## Restoring

A restore is staged while the server runs and put in place the next time it starts, before anything opens the database. This is because on Railway the server is the only thing running in its container, so it cannot be stopped first.

1. Open a shell where the server runs. On Railway: `railway ssh` from the project folder (or the service's shell in the dashboard). Locally: a terminal in `workstation/`.
2. See what there is:

   ```
   npm run restore
   ```

3. Stage one (by its name, or `latest`):

   ```
   npm run restore -- backup-2026-11-27T030000Z.db
   ```

   It checks that the file is a sound Sandbox database before staging it, and refuses one that isn't.

4. Restart the server. On Railway: the service's **Restart** (a restart, not a redeploy). Locally: stop and start it.

The deploy log then says `Restored the database from a backup.` and where the database it replaced was kept (`workstation.db.before-restore-<time>`, beside it). Nothing is deleted, so a restore can be undone by restoring that file the same way (`npm run restore -- /data/workstation.db.before-restore-<time>`). Delete those files by hand once you no longer need them.

If the staged file fails the check at start-up, it is set aside as `workstation.db.restore-failed-<time>`, the log says why, and the database is left as it was.

To restore a file you downloaded, copy it into the `backups/` folder first, then stage it by name.

Anything written after the backup was taken is lost from the restored database (it stays in the kept copy). People stay signed in only if their session existed when the backup was taken.

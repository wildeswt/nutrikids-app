# Backups and data retention (NK-44, RT-11)

NutriKids stores health data of minors, so every backup is encrypted and old backups are deleted on a schedule. Ecuador's data protection law lists limited retention and security among the principles of processing (Asamblea Nacional del Ecuador, 2021, art. 10).

## What is in the repo

| File                                                        | Purpose                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| [`scripts/backup/backup.sh`](../scripts/backup/backup.sh)   | Dumps the database, encrypts it and deletes expired backups. |
| [`scripts/backup/restore.sh`](../scripts/backup/restore.sh) | Decrypts a backup and restores it into a database.           |

Both are Bash scripts (Linux, macOS, or Git Bash on Windows). They need `gpg` and either `pg_dump`/`psql`/`pg_restore` or Docker.

## Making a backup

The dump (`pg_dump --format=custom`) is piped straight into `gpg --symmetric --cipher-algo AES256`, so an unencrypted copy never touches the disk. The result is `nutrikids-<UTC timestamp>.dump.gpg`. It is written under a `.partial` name and renamed only when complete, so a failed run never leaves a truncated backup that looks valid.

Local development (database in Docker):

```bash
export BACKUP_PASSPHRASE='a-long-random-passphrase'
DOCKER_CONTAINER=nutrikids-postgres BACKUP_DIR=./backups scripts/backup/backup.sh
```

Server with PostgreSQL client tools installed (use the owner connection, not the `nutrikids_app` role, so Row Level Security does not hide rows from the dump):

```bash
export BACKUP_PASSPHRASE='a-long-random-passphrase'
DIRECT_URL='postgresql://owner:***@host:5432/nutrikids' BACKUP_DIR=/var/backups/nutrikids scripts/backup/backup.sh
```

| Variable                | Default     | Meaning                                                     |
| ----------------------- | ----------- | ----------------------------------------------------------- |
| `BACKUP_PASSPHRASE`     | (required)  | Encryption passphrase.                                      |
| `DOCKER_CONTAINER`      | -           | Run `pg_dump` inside this container.                        |
| `DIRECT_URL`            | -           | Owner connection string (used when no container is set).    |
| `BACKUP_DIR`            | `./backups` | Where backups are stored.                                   |
| `BACKUP_RETENTION_DAYS` | `30`        | Backups older than this are deleted at the end of each run. |

`backups/` must never be committed. Add it to `.gitignore` in any environment that uses it.

### Scheduling

Run it once a day. Example `crontab` entry (02:00 server time):

```bash
0 2 * * * . /etc/nutrikids/backup.env && /opt/nutrikids/scripts/backup/backup.sh >> /var/log/nutrikids-backup.log 2>&1
```

On Windows use Task Scheduler to run `bash scripts/backup/backup.sh` with the same variables.

### Key management

- Store `BACKUP_PASSPHRASE` in a secret manager or a root-only file, **not** next to the backups and **not** in the repository. Whoever holds the backups but not the passphrase cannot read them.
- Keep a second copy of the passphrase offline with a second team member. A lost passphrase makes every backup unrecoverable.
- Rotate it when someone with access leaves. Old backups stay readable only with the passphrase that created them, so record which passphrase covers which date range.
- Copy backups off the database host (another machine or object storage). A backup on the same disk does not survive a disk failure.

## Restoring

`restore.sh` restores into a **new** database, so the live data is never overwritten by accident:

```bash
export BACKUP_PASSPHRASE='the-passphrase-used-for-that-backup'
DOCKER_CONTAINER=nutrikids-postgres scripts/backup/restore.sh backups/nutrikids-20261114T075917Z.dump.gpg nutrikids_restored
```

What it does, in order:

1. Decrypts the file once and discards the output. A wrong passphrase or a corrupted/tampered file stops here, before any database is touched.
2. Refuses to continue if the target database already exists, unless `RESTORE_CLEAN=1` is set (then it is dropped and recreated).
3. Creates the target database and runs `pg_restore --exit-on-error` on the decrypted stream.

To recover production from a disaster: restore into a new database, check the data (below), point `DATABASE_URL` and `DIRECT_URL` at it, and restart the API. The dump already contains the schema, RLS policies, functions and migration history, so do not run migrations on the restored database. Roles are not part of a database dump: on a brand new server the `nutrikids_app` role must exist before the restore (the first migration creates it, so on a new server run `prisma migrate deploy` once against any empty database to create it).

### How the procedure was tested

Checked on 2026-11-14 against the local Docker database (PostgreSQL 16, 3,097 users, 1,470 children, 1,162 checkups):

| Check                                                                       | Result                                                                                                                 |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Backup, then restore into `nutrikids_restore_test`                          | Row counts identical in `users`, `children`, `checkups`, `reminders`, `notifications`, `audit_logs`, `lms_references`. |
| Backup file contains readable text (`PGDMP`, `CREATE TABLE`, emails, names) | None found.                                                                                                            |
| Restore with a wrong passphrase                                             | Rejected, no database created.                                                                                         |
| Restore of a file with modified bytes                                       | Rejected (`encrypted message has been manipulated`), no database created.                                              |
| Restore into an existing database                                           | Rejected unless `RESTORE_CLEAN=1`.                                                                                     |
| Backup without `BACKUP_PASSPHRASE`                                          | Rejected.                                                                                                              |
| Retention                                                                   | A 45-day-old `nutrikids-*.dump.gpg` was deleted; an unrelated old file in the same folder was kept.                    |

Not tested: the `DIRECT_URL` path (the machine used had no PostgreSQL client tools, only Docker), and restoring on a different server. Test a restore after the first real deployment and repeat it every quarter.

After any restore, compare a few counts with the source:

```bash
psql "$RESTORED_URL" -c "SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM children) AS children, (SELECT count(*) FROM checkups) AS checkups;"
```

## Retention policy

These periods are the team's proposal for the project. They should be reviewed with legal advice before a real deployment (the informe already lists the impact assessment and the data protection officer as pending).

### Backups

| Item                      | Kept for                                 | Then                         |
| ------------------------- | ---------------------------------------- | ---------------------------- |
| Daily encrypted backup    | 30 days (`BACKUP_RETENTION_DAYS`)        | Deleted by `backup.sh`.      |
| Passphrase of each backup | As long as the backups it protects exist | Destroyed with the last one. |

Because deleted data stays in backups until they expire, an erasure request is fully effective at most 30 days after it is executed in the live database. Tell the representative this when answering the request.

### Data in the database

| Data                                                                  | Kept while                                                                                                         | Notes                                                                                                                                                                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Child profile, checkups, indicators, alerts, follow-ups, feeding logs | The child is registered and the consent is active                                                                  | Checkups and alert history are immutable by design (corrections add a new row), so erasure cannot be a plain `DELETE`. How a revoked consent or an erasure request is applied to these tables is defined in NK-41. |
| Consent records                                                       | As long as the child's data exists, plus the legal period for proof of consent (to be confirmed with legal advice) | Proves that processing was authorized.                                                                                                                                                                             |
| Audit log (`audit_logs`)                                              | At least as long as the data it refers to                                                                          | Immutable; it records who accessed or changed health data (RT-10).                                                                                                                                                 |
| Reminders and notifications                                           | 12 months after `scheduled_for` / `sent_at` (proposed)                                                             | Low value after the event. No automatic cleanup exists yet.                                                                                                                                                        |
| Refresh tokens                                                        | 30 days after creation (`REFRESH_TOKEN_TTL_DAYS`)                                                                  | Expired and revoked rows are not purged yet.                                                                                                                                                                       |
| Push device tokens                                                    | Until logout or until Expo reports `DeviceNotRegistered`                                                           | Already removed automatically.                                                                                                                                                                                     |

### Not automated yet

The scripts delete old backups only. Purging old reminders, notifications and expired refresh tokens, and applying erasure to immutable tables, need their own jobs and are not part of NK-44.

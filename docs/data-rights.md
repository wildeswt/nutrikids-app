# Data rights of the legal representative (NK-41, RF-20)

The Ley Orgánica de Protección de Datos Personales gives the representative of a minor the right to access, rectify, export and request the deletion of the child's data. This is the API behind the "Mis datos" screen (NK-55).

Everything here is limited to the **legal representative** of the child (`caregiver_children.is_legal_representative = true`). Other caregivers, professionals and unlinked users get `403`. Every action is recorded in `audit_logs`.

## Endpoints

| Method and path                                         | Description                                                                       | Audit (`action` / `entity_type`) |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------- |
| `GET /children/:childId`                                | Consult the child's identity data (existing endpoint).                            | `READ` / `children`              |
| `PATCH /children/:childId`                              | Rectify identity data (below).                                                    | `UPDATE` / `children`            |
| `GET /children/:childId/export`                         | Download all the child's data as a JSON file (`Content-Disposition: attachment`). | `EXPORT` / `children`            |
| `POST /children/:childId/erasure-requests`              | Request deletion. `201`; `409` if one is already pending.                         | `CREATE` / `erasure_requests`    |
| `GET /children/:childId/erasure-requests`               | History of requests (`pending`, `completed`, `cancelled`).                        | -                                |
| `DELETE /children/:childId/erasure-requests/:requestId` | Cancel a pending request. `409` if it is no longer pending.                       | `REVOKE` / `erasure_requests`    |

### Rectification

Body (strict, at least one field): `firstName`, `lastName`, `birthDate` (`YYYY-MM-DD`), `sex`.

- `firstName` and `lastName` can always be changed.
- `birthDate` and `sex` can only be changed while the child has **no checkups** (`409` otherwise). Every stored z-score was computed from them and checkups are immutable, so changing them afterwards would leave wrong clinical results. If they were entered wrongly after a checkup exists, the checkups have to be corrected (`POST /checkups/:checkupId/correction`) first.
- The new `birthDate` must not be in the future and the age must be 12 to 60 months, the same rule as registration.

### Export

One JSON document: `exportedAt`, `child`, `caregivers`, `professionals`, `consents`, `checkups` (with indicator results, alerts and alert status history), `feedingLogs`, `followUps` and `reminders`. For other people it only includes what the representative already sees: a caregiver's name, email and relationship, and a professional's name and specialty. Never password hashes, licence numbers or other users' contact data.

## What "delete" means

`checkups`, `alert_history` and `audit_logs` cannot be deleted (NK-8: immutability, and the audit trail is itself a legal duty). So a deletion request is fulfilled by **anonymising the child**, not by removing rows:

| Data                                                       | When the request is executed                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Child's first and last name                                | Replaced by `Anonimizado`.                                                            |
| Birth date                                                 | Reduced to the first day of the month (age statistics stay possible).                 |
| Feeding log and reminders                                  | Deleted.                                                                              |
| Free text of follow-ups (can name the child or the family) | Replaced by `[eliminado por solicitud del representante]`.                            |
| Consent                                                    | Revoked.                                                                              |
| Links with professionals                                   | Ended today.                                                                          |
| Links with caregivers                                      | Deleted: nobody sees the child in the app any more.                                   |
| Checkups, indicator results, alerts, alert history         | **Kept, without identity**. They can no longer be tied to a person from the database. |
| Audit log                                                  | Kept, plus an `ERASE` event for the request.                                          |
| Backups                                                    | Still contain the old data until they expire (30 days, [backups.md](backups.md)).     |

### Timeline

1. The representative requests deletion. The request is stored with `due_at = requested_at + 15 days`, the legal deadline.
2. For `ERASURE_GRACE_DAYS` days (7 by default, at most 14) the representative can cancel it.
3. A job (`jobs/erasure.ts`, hourly, first pass 60 s after start) calls the SQL function `execute_erasure_requests(grace_days)`, which anonymises the child in one transaction, marks the request `completed` and writes the `ERASE` audit event. The function is `SECURITY DEFINER` because the job runs without a session user.

Since the grace period is shorter than the legal deadline, every request is executed within the 15 days. Rectification and export are answered immediately.

## Limits

- Once the links with caregivers are deleted, the completed request can no longer be read through the API (RLS needs a link to the child). The record stays in `erasure_requests` and in the audit log.
- Anonymised data is not re-identifiable from the database, but a child's checkups still describe a real measurement history. Whether that is enough anonymisation for the law has to be confirmed with legal advice, together with the retention periods in [backups.md](backups.md).
- A professional's own copy of a child (for example a message sent outside the app) is out of scope.

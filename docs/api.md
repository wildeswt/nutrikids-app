# API endpoint index (`apps/api`)

Every endpoint of the Express API, as mounted in `apps/api/src/app.ts` and defined in `apps/api/src/routes/`. Each row lists the guards the route applies; the details of each area are in the document linked in the last column. Base URL in development: `http://localhost:3000`.

Common rules:

- **Authentication:** every endpoint except `GET /health`, `GET /reference/curves` and `/auth/*` requires `Authorization: Bearer <access token>` (`401` otherwise). See [auth.md](auth.md).
- **Validation:** bodies, queries and params are validated with the Zod schemas of `@nutrikids/shared` (`400` on invalid input; strict bodies reject unknown fields).
- **Link:** `link` means the user must be linked to the child (caregiver of the child, or professional with an active assignment); without it the answer is `403` (or `404` for resources that RLS hides). **Consent** means the child must have an active informed consent (`403` otherwise). See [permissions.md](permissions.md).
- **Errors** share one shape: `{ "error": string, "message": string, "issues"?: [...] }`.
- **Audit** (`audit_logs`) is recorded for the rows marked in the "Audit" column by the `auditHealth` middleware; data-rights actions are described in [data-rights.md](data-rights.md).

## Health and reference data

| Method and path         | Guards | Description                                                                         | Details               |
| ----------------------- | ------ | ----------------------------------------------------------------------------------- | --------------------- |
| `GET /health`           | none   | Service status and database connectivity (`200`, or `503` if the database is down). | README                |
| `GET /reference/curves` | none   | WHO reference curves (`?indicator=&sex=&position=`), cacheable for one day.         | `packages/who-growth` |

## Authentication (`/auth`)

| Method and path              | Guards                            | Description                                            | Details            |
| ---------------------------- | --------------------------------- | ------------------------------------------------------ | ------------------ |
| `POST /auth/register`        | -                                 | Creates a caregiver and/or professional account.       | [auth.md](auth.md) |
| `POST /auth/login`           | login rate limit (per IP + email) | Email and password; returns access and refresh tokens. | [auth.md](auth.md) |
| `POST /auth/refresh`         | -                                 | Rotates the refresh token.                             | [auth.md](auth.md) |
| `POST /auth/logout`          | -                                 | Revokes the refresh token.                             | [auth.md](auth.md) |
| `POST /auth/forgot-password` | rate limit                        | Starts password recovery.                              | [auth.md](auth.md) |
| `POST /auth/reset-password`  | -                                 | Sets a new password with the recovery token.           | [auth.md](auth.md) |

## Children, links and consent (`/children`)

| Method and path                                              | Guards                                               | Description                                                             | Audit             |
| ------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------- | ----------------- |
| `POST /children`                                             | role `CAREGIVER`                                     | Registers a child; the caller becomes (legal representative) caregiver. | `CREATE` children |
| `GET /children`                                              | `child:read`                                         | Children linked to the user.                                            | `READ` children   |
| `GET /children/:childId`                                     | `child:read`, link                                   | One child's identity data.                                              | `READ` children   |
| `GET /children/:childId/professionals`                       | `child:read`, link                                   | Professional assignments (`atiende`), current and past.                 | -                 |
| `POST /children/:childId/professionals`                      | link (legal representative or assigned professional) | Assigns a professional.                                                 | -                 |
| `PATCH /children/:childId/professionals/:professionalId/end` | link (legal representative or the professional)      | Ends an assignment.                                                     | -                 |
| `GET /children/:childId/caregivers`                          | `child:read`, link                                   | Caregiver links (`cuida`).                                              | -                 |
| `POST /children/:childId/caregivers`                         | link (legal representative)                          | Links another caregiver.                                                | -                 |
| `PATCH /children/:childId/caregivers/:caregiverId`           | link (legal representative)                          | Changes relationship or legal-representative flag.                      | -                 |
| `DELETE /children/:childId/caregivers/:caregiverId`          | link (legal representative)                          | Unlinks a caregiver (never the last legal representative).              | -                 |
| `GET /children/:childId/consent`                             | `child:read`, link                                   | Active (or latest) consent.                                             | `READ` consents   |
| `POST /children/:childId/consent`                            | role `CAREGIVER`, link (legal representative)        | Grants or renews consent (RF-02).                                       | `CREATE` consents |
| `DELETE /children/:childId/consent`                          | role `CAREGIVER`, link (legal representative)        | Revokes consent; new records stop being accepted.                       | `REVOKE` consents |

## Checkups, results and sync

| Method and path                        | Guards                          | Description                                                                                                      | Details            |
| -------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------ |
| `GET /children/:childId/checkups`      | `checkup:read`, link            | Checkup history (`?onlyCurrent=true`); caregivers get no z-scores (RF-14).                                       | `READ` checkups    |
| `POST /children/:childId/checkups`     | `checkup:create`, link, consent | Records a checkup (client UUID; resend returns `200`). The server computes the results.                          | `CREATE` checkups  |
| `POST /checkups/:checkupId/correction` | `checkup:create`, link, consent | Corrects a checkup by creating a new one that points to the original (checkups are immutable).                   | `CREATE` checkups  |
| `GET /checkups/:checkupId/results`     | `checkup:read`, link            | The four WHO indicator results; z-score and classification only for professionals.                               | -                  |
| `POST /sync/checkups`                  | `checkup:create`                | Batch (1-100) of checkups captured offline; idempotent, one result per item. Audits creations and discrepancies. | [sync.md](sync.md) |

- Checkup requests (`POST` and corrections) accept optional `notes` (1-500 trimmed chars, stored as `null` when omitted) and return `notes` in `GET`/`POST` responses.
- When `notes` is present, audit logs store `{ hasNotes: true }` in `details` and never copy the note text.

## Alerts and follow-ups (professionals)

| Method and path                      | Guards                                                | Description                                                                                            | Details                        |
| ------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `GET /alerts`                        | `alert:review`                                        | Alert inbox (`?status=A,B&childId=`), overdue flag included. Audit: `READ` alerts.                     | [alerts.md](alerts.md)         |
| `GET /alerts/:alertId`               | `alert:review`                                        | One alert with its state history. Audit: `READ` alerts.                                                | [alerts.md](alerts.md)         |
| `PATCH /alerts/:alertId/status`      | `alert:review`                                        | Changes the state following the state machine. Audit: `REVIEW` alerts.                                 | [alerts.md](alerts.md)         |
| `POST /children/:childId/follow-ups` | role `PROFESSIONAL`, `followup:create`, link, consent | Records a follow-up (observation, recommendation, intervention, referral). Audit: `CREATE` follow_ups. | [follow-ups.md](follow-ups.md) |

## Feeding and education

| Method and path                        | Guards                             | Description                                                                       | Details                                              |
| -------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `GET /children/:childId/feeding-logs`  | `feedinglog:read`, link            | Feeding logs (`?from=&to=&limit=`), newest first. Audit: `READ` feeding_logs.     | [feeding-and-education.md](feeding-and-education.md) |
| `POST /children/:childId/feeding-logs` | `feedinglog:create`, link, consent | Records a day of feeding (client UUID, idempotent). Audit: `CREATE` feeding_logs. | [feeding-and-education.md](feeding-and-education.md) |
| `GET /education`                       | authenticated                      | Educational content filtered by age and language.                                 | [feeding-and-education.md](feeding-and-education.md) |

## Notifications and reminders

| Method and path                        | Guards        | Description                                                           | Details                              |
| -------------------------------------- | ------------- | --------------------------------------------------------------------- | ------------------------------------ |
| `POST /notifications/devices`          | authenticated | Registers the Expo push token of the device.                          | [notifications.md](notifications.md) |
| `DELETE /notifications/devices/:token` | authenticated | Unregisters the token (on sign-out).                                  | [notifications.md](notifications.md) |
| `GET /notifications`                   | authenticated | The user's internal notifications, newest first (max 100).            | [notifications.md](notifications.md) |
| `PATCH /notifications/:id/read`        | authenticated | Marks one as read.                                                    | [notifications.md](notifications.md) |
| `GET /reminders`                       | authenticated | Reminders of the user's children (`?childId=&status=`).               | [reminders.md](reminders.md)         |
| `POST /reminders`                      | link, consent | Creates a `checkup` or `activity` reminder (client UUID, idempotent). | [reminders.md](reminders.md)         |
| `PATCH /reminders/:id/complete`        | authenticated | Marks a reminder as done.                                             | [reminders.md](reminders.md)         |

## Data rights of the legal representative

All on the `/children/:childId` prefix, limited to the child's legal representative. See [data-rights.md](data-rights.md).

| Method and path                                         | Description                                              | Audit                     |
| ------------------------------------------------------- | -------------------------------------------------------- | ------------------------- |
| `PATCH /children/:childId`                              | Rectifies identity data.                                 | `UPDATE` children         |
| `GET /children/:childId/export`                         | Downloads all the child's data as JSON.                  | `EXPORT` children         |
| `POST /children/:childId/erasure-requests`              | Requests deletion (executed after `ERASURE_GRACE_DAYS`). | `CREATE` erasure_requests |
| `GET /children/:childId/erasure-requests`               | History of requests.                                     | -                         |
| `DELETE /children/:childId/erasure-requests/:requestId` | Cancels a pending request.                               | `REVOKE` erasure_requests |

## Audit

| Method and path | Guards       | Description                                                                                                                        | Details                          |
| --------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `GET /audit`    | `audit:read` | Audit trail filtered by `userId`, `entityType`, `entityId`, `from`, `to`; paginated (`page`, `limit` max 100). Professionals only. | [permissions.md](permissions.md) |

## Background jobs (no HTTP endpoint)

Started by `apps/api/src/index.ts` when the server listens: overdue alerts and due reminders (`jobs/overdue-alerts.ts`, every `OVERDUE_ALERTS_INTERVAL_MINUTES`, first run 30 s after start) and execution of erasure requests (`jobs/erasure.ts`, hourly, first run 60 s after start). See [notifications.md](notifications.md), [reminders.md](reminders.md) and [data-rights.md](data-rights.md).

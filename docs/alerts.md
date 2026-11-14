# Risk Alerts (`apps/api`, NK-30 — RF-11, RF-12, RF-17)

Code: `src/services/alerts.service.ts`, `src/routes/alerts.routes.ts`, and the shared state machine in `packages/shared/src/schemas/alert.ts`.

## 1. Automatic Generation

When a checkup is recorded (or corrected), the server computes the 4 WHO `indicator_results` and, **in the same transaction**, creates one alert per result with a risk condition:

| Classification       | `riskType`    | `isSevere` |
| -------------------- | ------------- | :--------: |
| `SEVERE_WASTING`     | `WASTING`     |    yes     |
| `WASTING`            | `WASTING`     |     no     |
| `SEVERE_STUNTING`    | `STUNTING`    |    yes     |
| `STUNTING`           | `STUNTING`    |     no     |
| `SEVERE_UNDERWEIGHT` | `UNDERWEIGHT` |    yes     |
| `UNDERWEIGHT`        | `UNDERWEIGHT` |     no     |
| `OBESITY`            | `OBESITY`     |     no     |
| `OVERWEIGHT`         | `OVERWEIGHT`  |     no     |

`NORMAL` and `OVERWEIGHT_RISK` do not raise alerts. Severe risk = any z < −3 (P/T, T/E, or P/E) and raises the priority. Every alert starts at `GENERATED` with a first `alert_history` row whose `changedById` is the user who recorded the checkup. An idempotent checkup replay does not duplicate alerts.

Each alert reports the **indicator**, the **value** (`zScore`), and the **reason** (`reason`, e.g. `Desnutrición aguda severa: P/T z = -4.76`).

When a checkup is corrected, the original's alerts are kept (no alert closes by itself) and are returned with `checkupIsCurrent: false`; the correction raises its own alerts.

## 2. State Machine (Figura 3)

| From \ To               | GENERATED | PENDING_REVIEW | REVIEWED |    FOLLOW_UP_ESTABLISHED    |
| ----------------------- | :-------: | :------------: | :------: | :-------------------------: |
| `GENERATED`             |     -     |   ✓ (system)   |    ✗     |              ✗              |
| `PENDING_REVIEW`        |     ✗     |       -        | ✓ (prof) |              ✗              |
| `REVIEWED`              |     ✗     |       ✗        |    -     | ✓ (prof, needs a follow-up) |
| `FOLLOW_UP_ESTABLISHED` |     ✗     |       ✗        |    ✗     |          - (final)          |

Single source: `ALERT_TRANSITIONS`, `ALERT_STATUS_SET_BY`, `canTransition` and `canProfessionalTransition` in `@nutrikids/shared`. Any other transition (skip, backwards, same state, leaving the final state) returns `409` and writes no history.

- **`GENERATED`**: created when a result meets a risk condition. No professional has received it yet.
- **`PENDING_REVIEW`**: the **system** notified the assigned professional. This is triggered automatically by `notifyNewAlerts` (NK-36) upon recording/syncing a checkup with risk conditions, and also when an unnotified alert is delivered in-app (`GET /alerts` or `GET /alerts/:alertId`). Both paths call `markAlertsNotified`. The history row records the notified professional as `changedById`. A professional cannot request this transition with `PATCH` (`409`).
  - Figura 3's self-loop ("past the deadline, notify again") is a re-notification (NK-36): it does not change the status and writes no history.
- **`REVIEWED`**: the professional opened the alert and marked it as reviewed (`PATCH`). From here the caregiver receives a non-technical message (RF-14, NK-35, out of scope).
- **`FOLLOW_UP_ESTABLISHED`**: the professional registered the follow-up; requires a `follow_ups` row with `alert_id` (checked by the service and by the `alerts_follow_up` DB trigger). Final state.

Every change appends a row to `alert_history` (immutable) with `changedById` and `changedAt`. Updates are conditioned on the status that was read, so concurrent changes return `409` instead of overwriting each other.

## 3. Unreviewed Deadline ("plazo")

An alert in `GENERATED` or `PENDING_REVIEW` must be reviewed within:

| Variable                             | Default | Applies to                                         |
| ------------------------------------ | :-----: | -------------------------------------------------- |
| `ALERT_REVIEW_DEADLINE_HOURS`        |   72    | normal alerts                                      |
| `ALERT_REVIEW_DEADLINE_SEVERE_HOURS` |   24    | severe alerts (`z < −3`)                           |
| `OVERDUE_ALERTS_INTERVAL_MINUTES`    |   60    | periodic background job execution interval (NK-36) |
| `OVERDUE_ALERT_RENOTIFY_HOURS`       |   24    | minimum interval to re-notify same professional    |

Counted from `createdAt`. The API returns `reviewDueAt` and `isOverdue`. Being overdue is only a flag (used by the alerts tray NK-32 and notifications NK-36); it never changes the status.

The server runs a periodic background job (`runOverdueAlertsJob`) managed in `apps/api/src/jobs/overdue-alerts.ts` and initialized on server start (`apps/api/src/index.ts`). It executes the SQL `SECURITY DEFINER` function `find_overdue_alert_recipients(...)`, creating `alert_overdue` notifications and dispatching push notifications without modifying `alerts.status`. Re-notifications to the same professional for the same alert are suppressed within the `OVERDUE_ALERT_RENOTIFY_HOURS` window.

## 4. Endpoints

All require `authenticate` + `alert:review` (professionals only: alerts carry z-scores, which caregivers never receive, RF-14) and an **active professional link** to the child (a caregiver link is not enough).

| Method and Route                | Description                                                                                                                                                                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /alerts`                   | Tray. Delivers (`GENERATED` → `PENDING_REVIEW`) any undelivered alert first, so it never returns `GENERATED` alerts. Filters: `status` (one or comma-separated), `childId`. Order: severe first → risk (`WASTING`, `STUNTING`, `UNDERWEIGHT`, `OBESITY`, `OVERWEIGHT`) → oldest first. |
| `GET /alerts/:alertId`          | Detail with `history`; delivers it if still `GENERATED`. `404` if hidden by RLS, `403` without an active professional link.                                                                                                                                                            |
| `PATCH /alerts/:alertId/status` | Body `{ "status": "REVIEWED" \| "FOLLOW_UP_ESTABLISHED" }`. `200` with detail; `409` invalid transition / missing follow-up / concurrent change; `400` unknown status.                                                                                                                 |

Follow-ups are created with `POST /children/:childId/follow-ups` (RF-15, see [follow-ups.md](follow-ups.md)); creating one does not change the alert status by itself.

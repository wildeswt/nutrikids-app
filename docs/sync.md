# Offline Checkup Sync (`apps/api`, RT-02)

Code: `src/services/sync.service.ts`, `src/routes/sync.routes.ts`, shared contract in `packages/shared/src/schemas/sync.ts`.

## Endpoint

`POST /sync/checkups` — requires authentication and the `checkup:create` permission.

```json
{
  "checkups": [
    {
      "id": "<client UUID>",
      "childId": "<UUID>",
      "measuredAt": "2026-11-10T14:30:00-05:00",
      "weightKg": 12.5,
      "lengthHeightCm": 90,
      "position": "STANDING",
      "results": [{ "indicator": "WEIGHT_FOR_AGE", "zScore": -0.4, "classification": "NORMAL" }]
    }
  ]
}
```

- Batch of 1 to 100 items (`SYNC_MAX_BATCH_SIZE`). An empty/oversized batch or a malformed body returns `400`.
- Each item has the same fields as `POST /children/:childId/checkups` plus `childId`. Items are validated one by one, so an invalid item does not reject the batch.

## Response

Always `200` with one result per item, **in batch order**:

```json
{
  "results": [
    { "id": "...", "status": "CREATED", "checkup": { ... } },
    { "id": "...", "status": "DUPLICATE", "checkup": { ... } },
    { "id": "...", "status": "ERROR", "error": { "status": 403, "message": "No tienes acceso a este niño" } },
    { "id": "...", "status": "CREATED", "checkup": { ... }, "discrepancies": [{ "indicator": "BMI_FOR_AGE", "fields": ["zScore", "classification"] }] }
  ]
}
```

| `status`    | Meaning                                                                             |
| ----------- | ----------------------------------------------------------------------------------- |
| `CREATED`   | Inserted in this call.                                                              |
| `DUPLICATE` | A checkup with that `id` already existed (resend); nothing was duplicated.          |
| `ERROR`     | Not recorded. `error.status` mirrors the single-checkup endpoint (400/403/404/409). |

`checkup` is the stored checkup with the **server-recomputed** results, shaped by the user's link to the child: professionals receive z-score, percentile and classification; caregivers never do (RF-14). The phone should overwrite its local copy with it.

## Guarantees

- **Idempotent**: the insert is `INSERT ... ON CONFLICT (id) DO NOTHING`; resending the same batch (even concurrently) returns `DUPLICATE` and creates no extra checkups, results or alerts.
- **Failure isolation**: each item runs in its own transaction. A failing item (no link, no active consent, future date, outside WHO range, id owned by another child) is reported as `ERROR` and the rest of the batch is kept.
- **Server is the source of truth (RF-07)**: indicators are always recomputed. Alerts are raised as for a single checkup (RF-11).

## Discrepancies

When a newly created item carries `results` computed by the phone, the server compares each sent field per indicator (`zScore` and `percentile` with a 0.01 tolerance, `classification` exactly). For every differing indicator:

- the server keeps its own values;
- the response lists `{ indicator, fields }` under `discrepancies`;
- an `audit_logs` row is written with `action = 'DISCREPANCY'`, `entityType = 'indicator_results'`, `entityId` = server result id, and `details = { checkupId, indicator, fields, client, server }` (column added by migration `20261113120000_audit_details`).

Resends (`DUPLICATE`) are not compared again. Every created checkup is also audited as `CREATE` / `checkups`.

## Out of scope: feeding logs

Only checkups go through the offline queue and `POST /sync/checkups`. Feeding logs (`POST /children/:childId/feeding-logs`) are online-only for now; see the offline decision in [feeding-and-education.md](feeding-and-education.md).

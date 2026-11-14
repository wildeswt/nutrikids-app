# Role and Link Permissions (`apps/api`)

Implementation of **RT-05**: permissions are enforced on the server, not solely in the client interface. Code located in `src/middlewares/authenticate.ts`, `src/middlewares/access.ts`, and `src/lib/permissions.ts`.

## 1. Evaluation Order

1. **`authenticate`**: requires valid `Authorization: Bearer <jwt>`; sets `req.auth = { userId, roles, specialty }`. Fails with `401`.
2. **`requireRole(...roles)`**: user must possess at least one of the roles (`CAREGIVER`, `PROFESSIONAL`). Fails with `403`.
3. **`requireSpecialty(...)` / `requirePermission(permission)`**: within the professional role, distinguishes `nursing`, `nutrition`, and `pediatrics`. Fails with `403`.
4. **`requireLink(source = 'childId')`**: verifies an active link to the specific child. Fails with `403` (or `400` if the id is not a valid UUID).

Role first, link second: possessing the correct role is never sufficient to view a child without an authorized link.

## 2. Child Link (`req.link`)

| Role         | Table                   | Condition                                                                                          |
| ------------ | ----------------------- | -------------------------------------------------------------------------------------------------- |
| Caregiver    | `caregiver_children`    | Row exists (`cuida`) for (caregiver, child).                                                       |
| Professional | `professional_children` | Active row exists (`atiende`) today: `start_date <= today` and (`end_date IS NULL` or `>= today`). |

- When an account has both roles, satisfying either link grants access; `req.link` indicates which role established the access.
- Non-existent children and unlinked children respond identically with `403 Forbidden` to prevent identifier enumeration.
- Queries run inside `withUser(userId, ...)`, enforcing PostgreSQL Row Level Security (RLS) policies as defense in depth.

## 3. Permission Matrix

| Permission                                                                                           | Caregiver (linked children only) | Nursing | Nutrition | Pediatrics |
| ---------------------------------------------------------------------------------------------------- | :------------------------------: | :-----: | :-------: | :--------: |
| View child, checkups, curves, and alerts (`child:read`, `checkup:read`, `curves:read`, `alert:read`) |               Yes                |   Yes   |    Yes    |    Yes     |
| View feeding logs (`feedinglog:read`)                                                                |               Yes                |   Yes   |    Yes    |    Yes     |
| Record anthropometric checkup (`checkup:create`)                                                     |               Yes                |   Yes   |    Yes    |    Yes     |
| Review alerts (`alert:review`)                                                                       |                No                |   Yes   |    Yes    |    Yes     |
| Create clinical follow-ups (`followup:create`)                                                       |                No                |   No    |    Yes    |    Yes     |
| View audit log (`audit:read`)                                                                        |                No                |   Yes   |    Yes    |    Yes     |

All permissions in this matrix apply **strictly to linked children** (step 4). The `origin` of a checkup (`CAREGIVER`/`PROFESSIONAL`) is derived by the server from the link context, never accepted from the client.

This matrix is single-sourced in `PERMISSIONS_BY_ACTOR`.

## 4. Route Usage

```ts
router.post(
  '/children/:childId/follow-ups',
  authenticate,
  requireRole('PROFESSIONAL'),
  requirePermission('followup:create'),
  requireLink(), // reads req.params.childId; or requireLink((req) => req.body.childId)
  handler,
);
```

## 5. HTTP Error Responses

| Code  | Reason                                                                       |
| ----- | ---------------------------------------------------------------------------- |
| `401` | Missing, invalid, or expired authentication token.                           |
| `403` | Insufficient role or specialty, missing permission, or no active child link. |
| `400` | Child identifier is not a valid UUID.                                        |

---

## 6. Child Registration, Link Management, and WHO Age Range Rules (RF-03)

Implemented in `src/routes/children.routes.ts` and `src/services/children.service.ts`.

### 6.1 Creating and Ending Professional Links (`professional_children`)

In PostgreSQL, the RLS policy on `professional_children` allows `professional_id = app_user_id() OR app_has_child_access(child_id)`. Without application rules, any registered professional could self-assign to any child if their UUID were known.

Therefore, `POST /children/:childId/professionals` and `PATCH /children/:childId/professionals/:professionalId/end` mandate `requireLink('childId')` and enforce differentiated rules:

1. **Creating a link (`POST /children/:childId/professionals` - `assertCanManageProfessionalLinks`):**
   - The child's **legal representative** (`caregiver_children.is_legal_representative = true`), **or**
   - A **professional with an active `atiende` link** on that child (`startDate <= today` and `endDate IS NULL` or `>= today`), enabling clinical referrals and interconsultations (RF-19).
2. **Ending a link (`PATCH /children/:childId/professionals/:professionalId/end` - `assertCanEndProfessionalLink`):**
   - The child's **legal representative** (can end the assignment of any professional linked to the child), **or**
   - The **assigned professional themselves** (`auth.userId === professionalId` with an active link), preventing professionals from dismissing colleagues (`403 Forbidden`).

Any other actor receives `403 Forbidden`. In addition:

- The target professional must exist and be active (`404 Not Found` otherwise).
- No conflicting active link may already exist for that child (`409 Conflict`, enforced in DB with partial index `professional_children_active_unique_idx`).
- `endDate` must be greater than or equal to `startDate` (`400 Bad Request`).

### 6.2 Managing Caregiver Links (`caregiver_children`)

Endpoints under `/children/:childId/caregivers` query and manage linked caregivers:

- **`GET /children/:childId/caregivers`:** accessible to any user with an active link on the child (`requirePermission('child:read')` + `requireLink('childId')`).
- **`POST /children/:childId/caregivers`:** links an additional caregiver (by `caregiverId` or `email`, specifying `relationship` and `isLegalRepresentative`). Restricted **exclusively to the legal representative** (`assertIsChildLegalRepresentative`, `403 Forbidden` otherwise). Returns `404` if the caregiver does not exist/is inactive, and `409 Conflict` if already linked.
- **`PATCH /children/:childId/caregivers/:caregiverId`:** updates `relationship` and/or `isLegalRepresentative`. Restricted to the legal representative. Demoting the only active legal representative returns `409 Conflict`.
- **`DELETE /children/:childId/caregivers/:caregiverId`:** unlinks a caregiver (`204 No Content`). Restricted to the legal representative and prevents removing the last remaining legal representative (`409 Conflict`).

### 6.3 Informed Consent Lifecycle and Order (RF-02, NK-16, NK-17, NK-20)

To guarantee that no clinical or identifying minor data exists without active consent:

1. **Initial Child Registration (`POST /children` - NK-17 and NK-20):**
   - The client application displays the consent document to the legal representative **prior** to confirming child registration.
   - On the server, `POST /children` executes a **single atomic transaction under RLS** (`withUser`), inserting via deferrable foreign key:
     1. The initial link in `caregiver_children` (`is_legal_representative = true`).
     2. The child record in `children` with minimal demographics (`firstName`, `lastName`, `birthDate`, `sex`).
     3. The initial consent in `consents` (`granted_at = now()`, `revoked_at = null`, `text_version = 'v1'`).
2. **Consent Endpoints (`/children/:childId/consent` - NK-16):**
   - **`GET /children/:childId/consent`:** returns active consent (`revokedAt: null`) or the most recent record for auditing.
   - **`POST /children/:childId/consent`:** grants or updates consent. Restricted **exclusively to legal representatives**. Updating to a new version revokes the previous record (`revokedAt = now()`) atomically (`201 Created`). Resending the identical version returns `409 Conflict`.
   - **`DELETE /children/:childId/consent`:** revokes consent logically (`revokedAt = now()`, returns `200 OK` with `ConsentResponse`). Restricted to legal representatives.
   - **Integrity Index:** Partial unique index `consents_child_active_unique_idx` (`WHERE revoked_at IS NULL`) guarantees at most one active consent per child.
3. **Clinical Block without Active Consent:**
   - Any endpoint registering checkups (e.g., `POST /children/:childId/checkups`) enforces `requireActiveConsent('childId')` and service assertion `assertActiveConsent`.
   - PostgreSQL trigger `checkups_active_consent` (`BEFORE INSERT ON checkups`) aborts any insertion lacking active consent for that `child_id`.

### 6.4 WHO Age Range Constraints (12-60 Months)

- **Registration (`POST /children`):** child must be between `12` and `60` completed months (`400 Bad Request` outside this range).
- **Historical Queries (`GET /children`, `GET /children/:childId`, checkups, etc.):** remain fully accessible after `60` months to preserve historical records.
- **New Checkups (`POST /children/:childId/checkups`):** WHO reference tables cover `12` to `60` months. Every checkup validates age **as of the measurement date (`measuredAt`)** via `assertChildAgeInOmsRange`; values outside range are rejected with `400 Bad Request`.

### 6.5 Anthropometric Checkups: Registration, Correction, and Currency (RF-04, RF-05, RF-09)

| Method and Route                       | Description                                                                                                                                                                                                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /children/:childId/checkups`     | Records checkup with client-generated UUID. Requires active consent. `201` on creation; `200` with existing record on idempotent replay. `409` if the UUID belongs to another child.                                                                                             |
| `POST /checkups/:checkupId/correction` | Creates a new checkup with `correctedCheckupId` pointing to original. Same body schema. Idempotent by `id`. `409` if original already corrected. `404` if original checkup does not exist.                                                                                       |
| `GET /children/:childId/checkups`      | Full history (including superseded checkups) in descending `measuredAt` order. `?onlyCurrent=true` filters to active checkups only.                                                                                                                                              |
| `GET /checkups/:checkupId/results`     | The 4 WHO indicator results (RF-07, RF-08). Linked professionals receive `zScore`, `percentile`, and `classification`; linked caregivers only `indicator` and `referenceVersion` (NK-35). `404` if the checkup does not exist or is hidden by RLS; `403` without an active link. |

**Rules:** `origin` (`CAREGIVER` or `PROFESSIONAL`) and `recordedById` are assigned by the server. Physical boundaries return `400 Bad Request`; values outside plausible boundaries require `confirmOutlier: true`. Future dates and pre-birth dates are rejected. On recording (and on correction), the server always recomputes the 4 `indicator_results` with `@nutrikids/who-growth` and stores them in the same transaction as the checkup; any `results` computed by the phone are accepted in the body but ignored (RF-07). Classification cutoffs are read from configuration (`CUTOFF_*` and `OVERWEIGHT_CRITERION` env vars, WHO defaults when unset; see `.env.example`), not hard-coded (RF-08). Caregivers never receive raw z-scores, percentiles, or technical classifications (RF-14).

**Correction Semantics (`checkups` is immutable, NK-8):**

- Original record **remains unmodified**: preserves its `indicator_results` and alerts for historical auditing.
- Current status is **derived**: a checkup is current if no other checkup references it via `corrected_checkup_id`. Exposed via `isCurrent` in API and `current_checkups` database view.
- Only current checkups can be corrected (correction chains are strictly linear).
- Charts (NK-26) and active alerts (NK-30) query current checkups (`onlyCurrent=true` / `current_checkups`).
- Synchronization (NK-28) transfers both original and corrected records.

# Test matrix (NK-46)

Traceability between the high-priority requirements of the analysis report (Tables 2 and 3) and the automated tests that verify them, plus the security and privacy checks asked for by the test plan (Table 8). All test data is synthetic: users use `@nutrikids.local` emails, children are generated with random UUIDs and fixed dummy names, and no test reads or loads real data (`apps/api/src/__tests__/helpers/world.ts`).

How to run: `pnpm test` at the root runs every package. The API tests need the local database (`pnpm db:up`) and run with the restricted role `nutrikids_app` (`DATABASE_URL`), reading the database state with the owner connection (`DIRECT_URL`), the same as CI.

## Functional requirements (Table 2)

RF-06, RF-16, RF-18, RF-19 and RF-20 have medium priority and are listed at the end. The numbering follows the order of the report's Table 2.

| RF    | Requirement                                          | Tests                                                                                                                                                      | Status                                         |
| ----- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| RF-01 | Register an account and log in, loading the profile  | `auth.register`, `auth.login`, `auth.refresh-logout`, `auth.password-reset`, `auth.e2e-flow`; `system.e2e` (step 1); mobile `auth-screens`, `auth-context` | Covered                                        |
| RF-02 | Informed consent before recording data, revocable    | `children` (consent), `immutability` (DB trigger), `security.inputs-privacy` (PPRI-01); mobile `consent-api`, `useConsent`, `consent-screens`              | Covered                                        |
| RF-03 | Register the child and link caregivers/professionals | `children`, `access`, `security.access`, `system.e2e` (step 3); mobile `child-form`, `children-api`                                                        | Covered                                        |
| RF-04 | Record weight, length/height, position, date, author | `checkups`, `indicators.e2e`, `system.e2e` (step 4); shared `checkup`; mobile `checkup-form`, `checkups-api`, `checkup-screens`                            | Covered                                        |
| RF-05 | Plausible ranges and confirmation of outliers        | `checkups` ("outlier value requires confirmOutlier"); shared `checkup`; mobile `checkup-form`                                                              | Covered                                        |
| RF-07 | Age in months and z-score/percentile with WHO tables | `@nutrikids/who-growth` (`age`, `lms`, `length-height`, `reference`); `lms-seed`; `indicators.e2e`                                                         | Covered                                        |
| RF-08 | Classification with configurable cut-offs            | `who-growth` `classification`; `alerts` (risk from classification); `env-and-errors` (cut-offs from configuration)                                         | Covered                                        |
| RF-09 | Immutable checkups, corrections as new records       | `immutability` (UPDATE/DELETE rejected), `checkups` (correction), `system.e2e` (PI-02)                                                                     | Covered                                        |
| RF-10 | Growth charts over reference curves                  | `reference.curves`; mobile `growth-chart`, `reference-api`                                                                                                 | Covered                                        |
| RF-11 | Automatic alert on risk                              | `alerts`, `system.e2e` (alert after a low-weight checkup)                                                                                                  | Covered                                        |
| RF-12 | Alert status management with who/when                | `alerts` (allowed and forbidden transitions, history), `system.e2e`; mobile `alerts-api`, `useAlerts`                                                      | Covered                                        |
| RF-13 | Notify on new alert and on overdue alert             | `notifications`, `overdue-alerts`, `system.e2e`; mobile `notifications-api`, `notifications-screen`                                                        | Covered (real push on a device not tested)     |
| RF-14 | Plain message to the caregiver after review          | `system.e2e` checks the API response to the caregiver has no z-score or classification                                                                     | **Partial**: the message after review is NK-35 |
| RF-15 | Follow-ups and next checkup date                     | `followUps`, `system.e2e`                                                                                                                                  | Covered                                        |
| RF-17 | List assigned children by risk and pending alerts    | `alerts` (`compareAlerts` ordering), `security.access` (listings do not leak other children); mobile `alerts-screen`                                       | Covered                                        |
| RF-21 | Audit of accesses and modifications                  | `audit`, `immutability` (`audit_logs`), `security.access` (denied access leaves no change), `dataRights`                                                   | Covered                                        |

Medium priority: RF-06 `feedingLogs`; RF-16 `reminders`; RF-18 `education`; RF-19 `messages` (NK-38 branch); RF-20 `dataRights`, `security.inputs-privacy`.

## Technological requirements (Table 3)

The report does not mark a priority on the RT rows, so all of them are listed.

| RT    | Requirement                                                | Tests                                                                                                                                                | Status                                                  |
| ----- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| RT-01 | Mobile app on phone and tablet                             | Mobile suite (screens render, layouts); no device or tablet run                                                                                      | Partial: not run on real devices                        |
| RT-02 | Offline operation and sync with client-generated ids       | `sync`, `system.e2e` (PS-02: no duplicates, also from several devices at once)                                                                       | **Partial**: server side only; the local queue is NK-27 |
| RT-03 | REST API over HTTPS                                        | All API tests use the REST API; HTTPS is a deployment matter                                                                                         | Partial: transport not tested                           |
| RT-04 | Relational database with integrity and transactions        | `immutability`, `children`, `security.access` (RLS), foreign keys exercised by every API test                                                        | Covered                                                 |
| RT-05 | Role-based access control enforced on the server           | `access`, `security.access` (every endpoint with child data rejects users without role or link; RLS with the restricted role)                        | Covered                                                 |
| RT-06 | Hashed passwords, expiring sessions, 2FA for professionals | `security-primitives` (Argon2id), `auth.login` (attempt limit), `auth.refresh-logout`, `security.inputs-privacy` (no, forged or expired token → 401) | **Partial**: 2FA is NK-14, not done                     |
| RT-07 | Encryption at rest and pseudonymised exports               | None                                                                                                                                                 | **Missing**: NK-43 is not done                          |
| RT-08 | WHO LMS tables as reference data, same library everywhere  | `lms-seed`, `reference.curves`, `indicators.e2e`; only the server uses the library today                                                             | Partial: no on-device calculation                       |
| RT-09 | In-app and push notifications, scheduled tasks             | `notifications`, `overdue-alerts`, `reminders`                                                                                                       | Covered (push to a real device not tested)              |
| RT-10 | Spanish interface, ready for other languages               | Mobile `i18n`, `language-selector`                                                                                                                   | Covered                                                 |
| RT-11 | Encrypted backups and retention policy                     | Procedure tested by hand on 2026-11-14 (`docs/backups.md`)                                                                                           | Partial: no automated test                              |

## Test plan cases (Table 8)

| Case                                                          | Where                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| PU-01 to PU-06 (unit)                                         | `packages/who-growth/src/*.test.ts` (z-score, round trip, length/height, boundaries) |
| PI-01 (alert chain)                                           | `alerts`, `system.e2e`, `overdue-alerts`                                             |
| PI-02 (UPDATE/DELETE rejected, correction)                    | `immutability`, `system.e2e`                                                         |
| PI-03 (audit of every access)                                 | `audit`, `security.access`                                                           |
| PS-01 (end-to-end flow)                                       | `system.e2e` (register, consent, checkup, alert, follow-up, reminder)                |
| PS-02 (same checkup twice, devices)                           | `system.e2e`, `sync`                                                                 |
| PS-03 (offline checkup syncs)                                 | `sync` (server side); the offline flow on the phone needs NK-27                      |
| PSEG-01 (invalid credentials, SQL injection, expired session) | `security.inputs-privacy`, `auth.login`                                              |
| PSEG-02 (no access without link)                              | `security.access`                                                                    |
| PPRI-01 (consent, revocation, rights)                         | `security.inputs-privacy`, `dataRights`, `children`                                  |
| PUS-01, PA-01 (usability, acceptance with users)              | Not automatable: NK-47                                                               |

## Findings and rules

- **Defect found and fixed (migration `20261114170000_harden_link_table_rls`):** the row-level policies of `caregiver_children` and `professional_children` accepted any INSERT of a row that was "own" (`caregiver_id` or `professional_id` equal to the session user), without requiring prior access to the child. At the database level any user could link themselves to any child whose UUID they knew and then read all of its data. The API prevented it with `requireLink`, but RLS is the second barrier (RT-05). Now linking requires access to the child (or being the registration of a child that does not exist yet) and nobody can reopen an expired professional link. Covered by `security.access` ("nadie puede vincularse a sí mismo").
- **Critical defect rule:** a defect that stops a main task or exposes a child's data to a user without a link blocks the delivery. The tests in `security.access` and `security.inputs-privacy` run in CI (`.github/workflows`) with the restricted role, so such a defect fails the build.
- **Immutable tables:** checkups, alert history and audit logs cannot be deleted, so the tests that create them do not clean up; they use random ids and do not depend on an empty database.

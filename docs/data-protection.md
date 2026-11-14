# Data Protection & Encryption at Rest (RT-07, NK-41, NK-44)

NutriKids handles sensitive personal data of minors and healthcare users. To ensure confidentiality, compliance with data protection laws (e.g. Ecuador's LOPDP) and defense-in-depth, personal identifiable information (PII) is encrypted at column level in PostgreSQL, and backups are encrypted symmetrically with GPG (see [`docs/backups.md`](backups.md)).

---

## 1. PII Fields Encrypted at Rest

| Entity       | Field          | Database Column | Notes                                                     |
| ------------ | -------------- | --------------- | --------------------------------------------------------- |
| `users`      | `firstNameEnc` | `first_name`    | AES-256-GCM ciphertext (`v1:...`)                         |
| `users`      | `lastNameEnc`  | `last_name`     | AES-256-GCM ciphertext (`v1:...`)                         |
| `caregivers` | `phoneEnc`     | `phone`         | Optional; AES-256-GCM ciphertext (`v1:...`)               |
| `children`   | `firstNameEnc` | `first_name`    | AES-256-GCM (`v1:...`) or literal `'Anonimizado'` (NK-41) |
| `children`   | `lastNameEnc`  | `last_name`     | AES-256-GCM (`v1:...`) or literal `'Anonimizado'` (NK-41) |

### Fields kept in cleartext with explicit rationale

- `users.email`: Unique lookup key for authentication. Kept in cleartext to avoid complex deterministic/blind-index schemes during MVP. Protected by PostgreSQL access controls and RLS.
- `children.birth_date`: Required by WHO growth chart curves and SQL functions. Truncated to the first of the month upon erasure execution (NK-41). Treated as quasi-identifier protected by RLS.

---

## 2. Cryptographic Architecture

### Algorithm & Parameters

- **Cipher:** AES-256-GCM (Authenticated Encryption with Associated Data).
- **Key:** 256 bits (32 bytes), loaded via `DATA_ENCRYPTION_KEY` as Base64.
- **Initialization Vector (IV):** 12 bytes randomly generated per operation (`crypto.randomBytes(12)`). Non-deterministic.
- **Authentication Tag:** 128 bits (16 bytes).
- **Additional Authenticated Data (AAD):** `nutrikids:pii:v1:<context>`, e.g. `nutrikids:pii:v1:users:first_name`. Prevents ciphertext transplantation attacks between columns or entities.

### Serialized Storage Format

```text
v1:<keyId>:<iv_base64url>:<tag_base64url>:<ciphertext_base64url>
```

Example:

```text
v1:k1:r7K2...:9XzL...:AbCdEf...
```

---

## 3. Architecture & Decryption Boundaries

```text
Routes & Middlewares (Express)   -->  NO crypto imports, NO decryption
Services (auth, children, etc.)  -->  Consume pii.service.ts
services/pii.service.ts          -->  Single point of PII decryption & entity mapping
lib/pii-crypto.ts                -->  Low-level AES-256-GCM primitive
```

Prisma fields are named `firstNameEnc`, `lastNameEnc`, and `phoneEnc` using `@map("first_name")`, etc. This leverages TypeScript to ensure compile-time type safety against accidental exposure of ciphertext or bypassing the decryption layer.

### Erasure & Anonymization (NK-41)

When a legal guardian exercises the right to erasure, `execute_erasure_requests` sets `first_name` and `last_name` of the child to `'Anonimizado'`. The application layer (`decryptChildNames`) and database constraints explicitly tolerate `'Anonimizado'` without attempting AES decryption.

---

## 4. Environment Variables & Key Management

Generate 32-byte Base64 keys using OpenSSL:

```bash
openssl rand -base64 32
```

Configure in `.env`:

```bash
DATA_ENCRYPTION_KEY="<base64-key>"
DATA_ENCRYPTION_KEY_ID="k1"
PSEUDONYMIZATION_KEY="<base64-key>"
```

- Keys must never be committed to Git.
- CI and test suites generate ephemeral keys dynamically in memory (`src/__tests__/setup-env.ts`).

---

## 5. Exports: Portability vs. Statistical

1. **Portability Export (NK-41 / `GET /children/:childId/export`):**
   - Intended for the authenticated legal representative exercising access/portability rights over their own child.
   - Returns **decrypted** names and comprehensive clinical history.
2. **Statistical Export (RT-07 / `statistics-export.service.ts`):**
   - Population-level and epidemiological research export.
   - **Pseudonymized:** Children IDs replaced with irreversible HMAC-SHA256 tokens (`psn_...`).
   - **Strict Whitelist:** Only non-identifying health indicators (`ageMonths`, `sex`, `indicator`, `zScore`, `classification`, `measuredMonth`).
   - Guarded by `assertNoDirectIdentifiers` against UUIDs, emails, phone numbers, and full dates.

---

## 6. Database Migration & Backfill Runbook

For existing databases with unencrypted rows:

```bash
# 1. Apply schema and NOT VALID constraints
pnpm --filter api db:migrate:deploy

# 2. Run the idempotent backfill script (encrypts rows and validates constraints)
pnpm --filter api db:encrypt-pii

# 3. (Optional / Development) Populate synthetic seed data
pnpm --filter api db:seed
```

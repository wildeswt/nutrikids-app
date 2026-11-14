# Messages and referrals (NK-38, RF-19)

Conversation between a caregiver and the professionals linked to the child, and referrals ("interconsultas") between professionals. This is the API behind the chat screens (NK-50) and the professional-to-professional screen (NK-51). Messages live in the existing `messages` table, extended by migration `20261114160000_messages_and_referrals`.

## Decisions

| Topic                 | Decision                                                                                                                                                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What a message is     | Always about **one child** (`child_id`). A conversation is "a child + the other person"; the same two people talking about two children have two conversations.                                                                                                                   |
| Who can write to whom | Sender and recipient must both be linked to the child (caregiver of the child, or professional with an active assignment today), and **at least one must be a professional**. Caregiver ↔ caregiver, writing to yourself, or to anyone unlinked is `403`.                         |
| Referral              | A message with `kind = 'referral'`. Both sides must be **professionals with an active link to the same child**. A referral does not grant access to the child: to refer to someone, they must already be assigned (the assignment is managed elsewhere).                          |
| Referral visibility   | Only the sender and the recipient see it. The caregiver never sees it, and it is not listed in the caregiver's conversations. The recipient can reply with a normal message (professional ↔ professional is allowed).                                                             |
| Consent               | Sending requires an active informed consent for the child (`403` otherwise), like every write about a child. Reading does not.                                                                                                                                                    |
| Losing access         | If a user stops being linked to the child (assignment ended, erasure), the child's messages disappear for them: the `SELECT` policy requires `app_has_child_access(child_id)`.                                                                                                    |
| Immutability          | A message cannot be edited or deleted from the app. The only change allowed is `read_at`, once, by the recipient (trigger `messages_only_mark_read`; `DELETE` is revoked from `nutrikids_app`).                                                                                   |
| Erasure               | When the representative's deletion request is executed (NK-41, [data-rights.md](data-rights.md)) the child's messages are deleted: bodies can contain health data. `execute_erasure_requests` was updated.                                                                        |
| Read receipts         | `read_at` on the message. Marking one or a whole thread as read also marks the matching internal notifications as read.                                                                                                                                                           |
| Pagination            | Thread: newest first, cursor pagination (`cursor` = `nextCursor` of the previous page, `limit` 1-100, default 30). Conversations and referrals: newest first, capped (100).                                                                                                       |
| Notification          | Each new message creates a `message_new` notification (`entity_type = 'message'`) for the recipient; each referral creates `referral_new`. Same table and `GET /notifications` as [notifications.md](notifications.md). The push says only "you have a new message" (no content). |
| Audit                 | Sending (`CREATE`) and reading a thread or the referral list (`READ`) are recorded in `audit_logs` with `entity_type = 'messages'`. Listing conversations is not audited (no message content).                                                                                    |

The rule "who can write to whom" is a single SQL function, `app_can_message(child, recipient, kind)`, used by the `INSERT` policy of `messages` (defence in depth) and by the service to answer a clean `403`.

## Endpoints

All require a bearer token.

| Method and path                                     | Description                                                                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /messages/conversations`                       | Conversations with last message, other participant and `unreadCount`. Optional `?childId=`.                                               |
| `GET /messages?childId=&withUserId=&cursor=&limit=` | Thread with one person about a child: `{ items, nextCursor }`. `403` if the user is not linked to the child; empty if there is no thread. |
| `POST /messages`                                    | Sends a message. Body `{ id, childId, recipientId, body }` (strict, `body` 1-2000 chars, trimmed). `201`; same `id` again → `200`.        |
| `PATCH /messages/:id/read`                          | Marks a received message as read. Idempotent. Not found, not yours or sent by you → `404`.                                                |
| `PATCH /messages/read`                              | Marks a whole thread as read. Body `{ childId, withUserId }`. Returns `{ updated }`.                                                      |
| `GET /referrals`                                    | Professionals only. Optional `?childId=` and `?box=sent\|received`. Includes sender and recipient (name, specialty).                      |
| `POST /referrals`                                   | Professionals only. Body `{ id, childId, recipientId, body }`; `body` is the reason. `201`; same `id` again → `200`.                      |

Errors: `400` invalid input (including extra fields), `401` no token, `403` no link / not allowed / no consent / caregiver using `/referrals`, `404` message not found, `409` the same `id` already belongs to a different message.

`id` is generated by the client so a retry after a network failure never duplicates the message. Re-sending the same `id` with different content is `409`.

## Data model

`messages(id, child_id, sender_id, recipient_id, kind 'message'|'referral', body, sent_at, read_at)`. Constraints: `kind` check, `body` 1-2000 characters, `sender_id <> recipient_id`. Indexes: `messages_thread_idx (child_id, sender_id, recipient_id, sent_at DESC)` and `messages_recipient_unread_idx (recipient_id, read_at)`.

RLS policies: `messages_read` (participant and access to the child), `messages_insert` (sender is the session user and `app_can_message`), `messages_mark_read` (recipient only). The table was empty when the migration ran, so `child_id` is `NOT NULL`.

## Known limits

- Caregiver devices do not register push tokens yet (the app registers them for professionals only), so the push to a caregiver is a no-op until that is added. The internal notification is created anyway.
- No attachments, no editing or deleting messages, no typing indicators or real-time delivery: the apps poll `GET /messages` and `GET /notifications`.
- There is no rate limit on sending; the 2000-character cap and the link requirement bound the abuse.
- A referral does not assign the recipient to the child; if that is needed it is a separate feature.

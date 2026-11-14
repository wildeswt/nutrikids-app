import type { AlertStatus, CreateFollowUpInput, FollowUpResponse } from '@nutrikids/shared';
import { fetchAlertDetail, updateAlertStatus } from './alerts-api.js';
import { isoDateToInput } from './follow-up-form.js';
import { FollowUpApiError, FollowUpOfflineError, createFollowUp } from './follow-ups-api.js';
import {
  addPending,
  draftKey,
  listPending,
  removePending,
  saveDraft,
} from './follow-up-storage.js';

export interface FollowUpSubmission {
  userId: string;
  childId: string;
  alertId?: string | undefined;
  establish: boolean;
  input: CreateFollowUpInput;
}

export type SubmitResult =
  /** Saved on the server. `alertError` is set when the alert could not be moved afterwards. */
  | {
      kind: 'sent';
      followUp: FollowUpResponse;
      alertStatus: AlertStatus | null;
      alertError?: string;
    }
  /** No connection: saved on the phone and sent later (see `flushPendingFollowUps`). */
  | { kind: 'queued' };

/**
 * Moves the alert to «seguimiento establecido». The follow-up proves the professional looked at the
 * alert, so one still waiting for review goes through `REVIEWED` first (the state machine has no
 * shortcut). Returns the final status.
 */
export async function establishAlert(alertId: string): Promise<AlertStatus> {
  const alert = await fetchAlertDetail(alertId);
  let status = alert.status;
  if (status === 'FOLLOW_UP_ESTABLISHED') return status;
  if (status === 'PENDING_REVIEW') {
    status = (await updateAlertStatus(alertId, 'REVIEWED')).status;
  }
  if (status === 'REVIEWED') {
    status = (await updateAlertStatus(alertId, 'FOLLOW_UP_ESTABLISHED')).status;
  }
  return status;
}

/** A refused request that will not succeed by itself (validation, permission, conflict). */
function isPermanent(err: unknown): err is FollowUpApiError {
  return (
    err instanceof FollowUpApiError &&
    err.status >= 400 &&
    err.status < 500 &&
    err.status !== 408 &&
    err.status !== 429
  );
}

/**
 * Sends a follow-up and, when asked, moves its alert forward. Sending again with the same `id` is
 * safe (the API returns the existing follow-up), so a half-finished attempt can simply be repeated.
 * Throws when the server refuses the follow-up for good (`FollowUpApiError` 4xx); the caller shows it.
 */
async function send(
  submission: FollowUpSubmission,
): Promise<Extract<SubmitResult, { kind: 'sent' }>> {
  const followUp = await createFollowUp(submission.childId, submission.input);
  if (!submission.establish || !submission.alertId) {
    return { kind: 'sent', followUp, alertStatus: null };
  }
  try {
    const alertStatus = await establishAlert(submission.alertId);
    return { kind: 'sent', followUp, alertStatus };
  } catch (err) {
    // No connection while moving the alert: let the caller queue the whole thing and retry.
    if (err instanceof FollowUpOfflineError || isNetworkFailure(err))
      throw new FollowUpOfflineError({ cause: err });
    // Anything else (for example someone else already moved the alert): the follow-up is saved.
    return {
      kind: 'sent',
      followUp,
      alertStatus: null,
      alertError: err instanceof Error ? err.message : String(err),
    };
  }
}

function isNetworkFailure(err: unknown): boolean {
  // `authFetch` lets the `fetch` TypeError ("Network request failed") through.
  return err instanceof TypeError;
}

/**
 * Saves a follow-up: sent now when there is connection, otherwise kept on the phone to be sent when
 * it comes back («Sin conexión · Se guardará en este teléfono...»).
 */
export async function submitFollowUp(submission: FollowUpSubmission): Promise<SubmitResult> {
  try {
    return await send(submission);
  } catch (err) {
    if (err instanceof FollowUpOfflineError) {
      await addPending({
        userId: submission.userId,
        childId: submission.childId,
        ...(submission.alertId ? { alertId: submission.alertId } : {}),
        establish: submission.establish,
        input: submission.input,
      });
      return { kind: 'queued' };
    }
    throw err;
  }
}

export interface FlushResult {
  sent: number;
  /** Still waiting (no connection yet). */
  remaining: number;
  /** Refused by the server: kept as drafts with the reason so the professional can fix them. */
  rejected: number;
}

/**
 * Tries to send the follow-ups this user saved without connection. Stops at the first one that
 * still cannot be sent for lack of connection. A follow-up the server refuses for good moves to the
 * drafts with the server message instead of being lost.
 */
export async function flushPendingFollowUps(userId: string): Promise<FlushResult> {
  const pending = await listPending(userId);
  const result: FlushResult = { sent: 0, remaining: pending.length, rejected: 0 };

  for (const entry of pending) {
    try {
      await send(entry);
      await removePending(entry.input.id);
      result.sent += 1;
      result.remaining -= 1;
    } catch (err) {
      if (err instanceof FollowUpOfflineError) break;
      if (!isPermanent(err)) break;
      await saveDraft(draftKey(userId, entry), {
        userId,
        childId: entry.childId,
        alertId: entry.alertId,
        form: {
          type: entry.input.type,
          details: entry.input.details,
          nextCheckupText: entry.input.nextCheckupDate
            ? isoDateToInput(entry.input.nextCheckupDate)
            : '',
          establish: entry.establish,
        },
        lastError: err.message,
      });
      await removePending(entry.input.id);
      result.rejected += 1;
      result.remaining -= 1;
    }
  }
  return result;
}

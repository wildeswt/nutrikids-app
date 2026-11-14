import type { AlertStatus, ChildResponse } from '@nutrikids/shared';
import { useCallback, useRef, useState } from 'react';
import { useAuth } from '../context/auth-context.js';
import i18n from '../i18n/index.js';
import { fetchAlertDetail } from '../lib/alerts-api.js';
import { fetchChild } from '../lib/children-api.js';
import {
  EMPTY_FOLLOW_UP_FORM,
  buildFollowUpInput,
  isFollowUpFormEmpty,
  type FollowUpFormData,
  type FollowUpFormError,
} from '../lib/follow-up-form.js';
import { clearDraft, draftKey, getDraft, saveDraft } from '../lib/follow-up-storage.js';
import { flushPendingFollowUps, submitFollowUp } from '../lib/follow-up-sync.js';
import { generateUuid } from '../lib/uuid.js';

/** What happened when the professional pressed «Guardar seguimiento». */
export type FollowUpSaveOutcome =
  /** Saved on the server (and the alert moved if asked). */
  | 'sent'
  /** No connection: saved on the phone, it is sent when the connection comes back. */
  | 'queued'
  /** Saved, but the alert could not be moved: the screen stays to explain. */
  | 'sentAlertNotMoved'
  | null;

export interface UseFollowUpFormParams {
  alertId?: string | undefined;
  childId?: string | undefined;
}

export interface UseFollowUpFormResult {
  loading: boolean;
  /** The form cannot be opened (no alert or child to attach the follow-up to). */
  fatalError: string | null;
  child: ChildResponse | null;
  alertStatus: AlertStatus | null;
  form: FollowUpFormData;
  setForm: (changes: Partial<FollowUpFormData>) => void;
  /** The alert can still be moved to «seguimiento establecido» (shows the checkbox). */
  canEstablish: boolean;
  /** No connection was detected (a request failed for lack of it, or follow-ups are waiting). */
  offline: boolean;
  saving: boolean;
  formError: FollowUpFormError | null;
  /** Message from the server when it refused the follow-up. */
  apiError: string | null;
  notice: 'draftSaved' | 'draftRestored' | null;
  /** Why a follow-up that was waiting on the phone was refused by the server. */
  rejectedReason: string | null;
  alertNotMoved: string | null;
  load: () => Promise<void>;
  save: () => Promise<FollowUpSaveOutcome>;
  saveAsDraft: () => Promise<void>;
}

/** `authFetch` lets the `fetch` TypeError ("Network request failed") through when offline. */
function isNetworkFailure(err: unknown): boolean {
  return err instanceof TypeError;
}

/**
 * State of the follow-up form (NK-34): resolves the child and the alert from the route params,
 * restores the saved draft, sends the follow-up that were waiting on the phone, and saves (sent or
 * queued when there is no connection) or keeps a draft.
 */
export function useFollowUpForm({
  alertId,
  childId,
}: UseFollowUpFormParams): UseFollowUpFormResult {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [child, setChild] = useState<ChildResponse | null>(null);
  const [targetChildId, setTargetChildId] = useState<string | null>(childId ?? null);
  const [alertStatus, setAlertStatus] = useState<AlertStatus | null>(null);
  const [form, setFormState] = useState<FollowUpFormData>({
    ...EMPTY_FOLLOW_UP_FORM,
    establish: Boolean(alertId),
  });
  const [offline, setOffline] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<FollowUpFormError | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [notice, setNotice] = useState<'draftSaved' | 'draftRestored' | null>(null);
  const [rejectedReason, setRejectedReason] = useState<string | null>(null);
  const [alertNotMoved, setAlertNotMoved] = useState<string | null>(null);
  /** Id of the follow-up being written: kept across retries so a resend never duplicates it. */
  const attemptId = useRef<string>(generateUuid());

  const canEstablish = Boolean(alertId) && alertStatus !== 'FOLLOW_UP_ESTABLISHED';

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setFatalError(null);
    let resolvedChildId = childId ?? null;
    let status: AlertStatus | null = null;
    let isOffline = false;

    if (alertId) {
      try {
        const alert = await fetchAlertDetail(alertId);
        status = alert.status;
        resolvedChildId ??= alert.childId;
      } catch (err) {
        if (isNetworkFailure(err)) isOffline = true;
        else if (!resolvedChildId) {
          setFatalError(err instanceof Error ? err.message : i18n.t('errors:alerts.detail'));
          setLoading(false);
          return;
        }
      }
    }

    if (!resolvedChildId) {
      setFatalError(i18n.t('professional:followUp.missingTarget'));
      setLoading(false);
      return;
    }

    try {
      setChild(await fetchChild(resolvedChildId));
    } catch (err) {
      if (isNetworkFailure(err)) isOffline = true;
    }

    // Follow-ups saved without connection are sent first: a refused one comes back as a draft.
    try {
      const flushed = await flushPendingFollowUps(userId);
      if (flushed.remaining > 0) isOffline = true;
    } catch {
      /* the follow-up stays queued */
    }

    const key = draftKey(userId, { alertId, childId: resolvedChildId });
    const draft = await getDraft(key).catch(() => null);
    if (draft) {
      setFormState(draft.form);
      setNotice('draftRestored');
      setRejectedReason(draft.lastError ?? null);
    }

    setTargetChildId(resolvedChildId);
    setAlertStatus(status);
    setOffline(isOffline);
    setLoading(false);
  }, [userId, alertId, childId]);

  const setForm = useCallback((changes: Partial<FollowUpFormData>) => {
    setFormState((prev) => ({ ...prev, ...changes }));
    setFormError(null);
    setApiError(null);
    setNotice(null);
  }, []);

  const save = useCallback(async (): Promise<FollowUpSaveOutcome> => {
    if (!userId || !targetChildId) return null;

    const built = buildFollowUpInput(form, { id: attemptId.current, alertId });
    if (!built.ok) {
      setFormError(built.error);
      return null;
    }

    setSaving(true);
    setFormError(null);
    setApiError(null);
    setNotice(null);
    try {
      const result = await submitFollowUp({
        userId,
        childId: targetChildId,
        alertId,
        establish: canEstablish && form.establish,
        input: built.input,
      });
      const key = draftKey(userId, { alertId, childId: targetChildId });
      await clearDraft(key).catch(() => {});
      attemptId.current = generateUuid();

      if (result.kind === 'queued') {
        setOffline(true);
        return 'queued';
      }
      if (result.alertError) {
        setAlertNotMoved(result.alertError);
        setAlertStatus(result.alertStatus);
        return 'sentAlertNotMoved';
      }
      return 'sent';
    } catch (err) {
      setApiError(err instanceof Error ? err.message : i18n.t('errors:followUps.create'));
      return null;
    } finally {
      setSaving(false);
    }
  }, [userId, targetChildId, form, alertId, canEstablish]);

  const saveAsDraft = useCallback(async () => {
    if (!userId || !targetChildId || isFollowUpFormEmpty(form)) return;
    await saveDraft(draftKey(userId, { alertId, childId: targetChildId }), {
      userId,
      childId: targetChildId,
      alertId,
      form,
    });
    setRejectedReason(null);
    setNotice('draftSaved');
  }, [userId, targetChildId, form, alertId]);

  return {
    loading,
    fatalError,
    child,
    alertStatus,
    form,
    setForm,
    canEstablish,
    offline,
    saving,
    formError,
    apiError,
    notice,
    rejectedReason,
    alertNotMoved,
    load,
    save,
    saveAsDraft,
  };
}

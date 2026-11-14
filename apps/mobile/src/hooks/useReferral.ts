import type { ChildResponse, ProfessionalAssignmentResponse } from '@nutrikids/shared';
import { useCallback, useRef, useState } from 'react';
import { useAuth } from '../context/auth-context.js';
import i18n from '../i18n/index.js';
import {
  EMPTY_REFERRAL_FORM,
  buildCreateReferralInput,
  clearReferralDraft,
  filterEligibleRecipients,
  loadReferralDraft,
  saveReferralDraft,
  type ReferralFormData,
  type ReferralFormError,
} from '../lib/referral-form.js';
import {
  createReferral,
  fetchChildProfessionals,
  fetchMyChildren,
  isReferralNetworkError,
} from '../lib/referrals-api.js';
import { generateUuid } from '../lib/uuid.js';

export interface UseReferralParams {
  initialChildId?: string | undefined;
}

export type ReferralNotice = 'draftSaved' | 'draftRestored' | 'sent' | null;

export interface UseReferralResult {
  loadingChildren: boolean;
  childrenError: string | null;
  children: ChildResponse[];
  loadingRecipients: boolean;
  recipientsError: string | null;
  recipients: ProfessionalAssignmentResponse[];
  form: ReferralFormData;
  sending: boolean;
  formError: ReferralFormError | null;
  apiError: string | null;
  isOffline: boolean;
  notice: ReferralNotice;
  canSubmit: boolean;
  load: () => Promise<void>;
  reloadRecipients: () => Promise<void>;
  selectChild: (childId: string) => void;
  setForm: (changes: Partial<ReferralFormData>) => void;
  saveDraft: () => Promise<void>;
  submit: () => Promise<boolean>;
}

/**
 * Estado del formulario de interconsulta profesional (NK-51, RF-19):
 * carga pacientes vinculados, profesionales elegibles por niño, borrador local y envío idempotente.
 */
export function useReferral({ initialChildId }: UseReferralParams = {}): UseReferralResult {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [loadingChildren, setLoadingChildren] = useState(true);
  const [childrenError, setChildrenError] = useState<string | null>(null);
  const [children, setChildren] = useState<ChildResponse[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [recipientsError, setRecipientsError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<ProfessionalAssignmentResponse[]>([]);
  const [form, setFormState] = useState<ReferralFormData>({
    ...EMPTY_REFERRAL_FORM,
    childId: initialChildId ?? null,
  });
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<ReferralFormError | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [notice, setNotice] = useState<ReferralNotice>(null);

  /** Mismo `id` en reintentos del mismo contenido para evitar duplicados en `POST /referrals`. */
  const attemptId = useRef<string | null>(null);
  /** Solo la última carga de profesionales puede actualizar el estado. */
  const latestRecipientsLoad = useRef(0);

  const loadRecipients = useCallback(
    async (childId: string | null, preferredRecipientId: string | null = null) => {
      const requestId = ++latestRecipientsLoad.current;
      if (!childId) {
        setRecipients([]);
        setRecipientsError(null);
        setLoadingRecipients(false);
        return;
      }

      setLoadingRecipients(true);
      setRecipientsError(null);
      setRecipients([]);

      try {
        const assignments = await fetchChildProfessionals(childId);
        if (requestId !== latestRecipientsLoad.current) return;
        const eligible = filterEligibleRecipients(assignments, userId);
        setRecipients(eligible);
        setFormState((prev) => {
          if (prev.childId !== childId) return prev;
          const validPreferred =
            preferredRecipientId && eligible.some((p) => p.professionalId === preferredRecipientId)
              ? preferredRecipientId
              : null;
          return { ...prev, recipientId: validPreferred };
        });
      } catch (err) {
        if (requestId !== latestRecipientsLoad.current) return;
        setRecipients([]);
        setRecipientsError(
          err instanceof Error ? err.message : i18n.t('errors:referrals.professionals'),
        );
      } finally {
        if (requestId === latestRecipientsLoad.current) {
          setLoadingRecipients(false);
        }
      }
    },
    [userId],
  );

  const load = useCallback(async () => {
    setLoadingChildren(true);
    setChildrenError(null);

    try {
      const [loadedChildren, draft] = await Promise.all([
        fetchMyChildren(),
        userId ? loadReferralDraft(userId) : Promise.resolve(null),
      ]);

      setChildren(loadedChildren);

      const hasChild = (id: string | null | undefined): id is string =>
        Boolean(id && loadedChildren.some((c) => c.id === id));

      let nextChildId: string | null = null;
      let nextRecipientId: string | null = null;
      let nextPriority = EMPTY_REFERRAL_FORM.priority;
      let nextReason = EMPTY_REFERRAL_FORM.reason;
      let restored = false;

      if (hasChild(initialChildId)) {
        nextChildId = initialChildId;
        if (draft && draft.childId === initialChildId) {
          nextRecipientId = draft.recipientId;
          nextPriority = draft.priority;
          nextReason = draft.body;
          restored = true;
        }
      } else if (draft) {
        nextChildId = hasChild(draft.childId) ? draft.childId : (loadedChildren[0]?.id ?? null);
        nextRecipientId = nextChildId === draft.childId ? draft.recipientId : null;
        nextPriority = draft.priority;
        nextReason = draft.body;
        restored = true;
      } else {
        nextChildId = loadedChildren[0]?.id ?? null;
      }

      setFormState({
        childId: nextChildId,
        recipientId: nextRecipientId,
        priority: nextPriority,
        reason: nextReason,
      });
      setNotice(restored ? 'draftRestored' : null);
      attemptId.current = null;
      setLoadingChildren(false);

      await loadRecipients(nextChildId, nextRecipientId);
    } catch (err) {
      setChildrenError(err instanceof Error ? err.message : i18n.t('errors:consent.childList'));
      setLoadingChildren(false);
    }
  }, [initialChildId, loadRecipients, userId]);

  const reloadRecipients = useCallback(async () => {
    await loadRecipients(form.childId, form.recipientId);
  }, [form.childId, form.recipientId, loadRecipients]);

  const selectChild = useCallback(
    (childId: string) => {
      attemptId.current = null;
      setFormError(null);
      setApiError(null);
      setIsOffline(false);
      setNotice(null);
      setFormState((prev) => ({ ...prev, childId, recipientId: null }));
      void loadRecipients(childId, null);
    },
    [loadRecipients],
  );

  const setForm = useCallback((changes: Partial<ReferralFormData>) => {
    attemptId.current = null;
    setFormError(null);
    setApiError(null);
    setIsOffline(false);
    setNotice(null);
    setFormState((prev) => ({ ...prev, ...changes }));
  }, []);

  const saveDraft = useCallback(async () => {
    if (!userId || sending) return;
    await saveReferralDraft(userId, form);
    setNotice('draftSaved');
  }, [form, sending, userId]);

  const submit = useCallback(async (): Promise<boolean> => {
    if (sending || loadingRecipients || recipients.length === 0) return false;

    setFormError(null);
    setApiError(null);
    setIsOffline(false);
    setNotice(null);

    attemptId.current ??= generateUuid();
    const built = buildCreateReferralInput(form, { id: attemptId.current });
    if (!built.ok) {
      setFormError(built.error);
      return false;
    }

    setSending(true);
    try {
      await createReferral(built.input);
      attemptId.current = null;
      if (userId) {
        await clearReferralDraft(userId).catch(() => {});
      }
      setNotice('sent');
      return true;
    } catch (err) {
      if (isReferralNetworkError(err)) {
        setIsOffline(true);
        setApiError(i18n.t('errors:referrals.network'));
      } else {
        setApiError(err instanceof Error ? err.message : i18n.t('errors:referrals.create'));
      }
      return false;
    } finally {
      setSending(false);
    }
  }, [form, loadingRecipients, recipients.length, sending, userId]);

  const canSubmit =
    !loadingChildren &&
    !loadingRecipients &&
    !recipientsError &&
    !sending &&
    Boolean(form.childId) &&
    recipients.length > 0;

  return {
    loadingChildren,
    childrenError,
    children,
    loadingRecipients,
    recipientsError,
    recipients,
    form,
    sending,
    formError,
    apiError,
    isOffline,
    notice,
    canSubmit,
    load,
    reloadRecipients,
    selectChild,
    setForm,
    saveDraft,
    submit,
  };
}

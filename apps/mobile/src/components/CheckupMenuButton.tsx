import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { APP_ROUTES } from '../constants/routes.js';
import { formatLongDate } from '../i18n/format.js';
import { deleteChildCheckup } from '../lib/checkups-api.js';
import type { CheckupRoleMode } from '../lib/checkup-route.js';
import { CardMenuButton } from './CardMenuButton.js';
import { ConfirmDialog } from './ui/ConfirmDialog.js';

export interface CheckupMenuTarget {
  id: string;
  childId: string;
  measuredAt: string;
  weightKg: number | string;
  lengthHeightCm: number | string;
  position: string;
  notes: string | null;
  /** Saved only on this phone (not synced yet): there is nothing on the server to correct. */
  localOnly?: boolean;
}

/**
 * Menú de tres puntos de la tarjeta de un control: «Corregir control» (abre el formulario con los
 * datos cargados; el servidor guarda un control nuevo que reemplaza a este) y «Eliminar control»
 * (eliminación lógica, con confirmación).
 */
export function CheckupMenuButton({
  checkup,
  roleMode,
  onDeleted,
  returnTo,
  testID = 'checkup-menu-button',
}: {
  checkup: CheckupMenuTarget;
  roleMode: CheckupRoleMode;
  onDeleted: () => void;
  /** Screen to return to after correcting; by default the previous one in the history. */
  returnTo?: 'checkup-history';
  testID?: string;
}) {
  const { t } = useTranslation(['caregiver', 'common']);
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (checkup.localOnly) return null;

  const handleCorrect = () => {
    router.push({
      pathname: (roleMode === 'PROFESSIONAL'
        ? APP_ROUTES.PROFESSIONAL.ADD_CHECKUP
        : APP_ROUTES.CAREGIVER.ADD_CHECKUP) as never,
      params: {
        childId: checkup.childId,
        correctsCheckupId: checkup.id,
        measuredAt: checkup.measuredAt,
        weightKg: String(checkup.weightKg),
        heightCm: String(checkup.lengthHeightCm),
        position: checkup.position,
        notes: checkup.notes ?? '',
        ...(returnTo ? { returnTo } : {}),
      },
    });
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteChildCheckup(checkup.id);
      setConfirming(false);
      onDeleted();
    } catch (err) {
      setConfirming(false);
      setError(err instanceof Error ? err.message : t('checkupActions.deleteErrorTitle'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <CardMenuButton
        testID={testID}
        accessibilityLabel={t('checkupActions.menuA11y')}
        title={t('checkupActions.menuTitle')}
        subtitle={formatLongDate(checkup.measuredAt)}
        actions={[
          {
            id: 'correct-checkup',
            label: t('checkupActions.correct'),
            icon: 'create-outline',
            onPress: handleCorrect,
          },
          {
            id: 'delete-checkup',
            label: t('checkupActions.delete'),
            icon: 'trash-outline',
            destructive: true,
            onPress: () => setConfirming(true),
          },
        ]}
      />
      <ConfirmDialog
        visible={confirming}
        tone="danger"
        icon="trash-outline"
        title={t('checkupActions.deleteTitle')}
        message={t('checkupActions.deleteMessage', { date: formatLongDate(checkup.measuredAt) })}
        confirmLabel={t('checkupActions.deleteConfirm')}
        cancelLabel={t('common:actions.cancel')}
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirming(false)}
        testID="checkup-delete-dialog"
      />
      <ConfirmDialog
        visible={error !== null}
        tone="danger"
        icon="alert-circle-outline"
        title={t('checkupActions.deleteErrorTitle')}
        message={error ?? ''}
        confirmLabel={t('common:actions.accept')}
        onConfirm={() => setError(null)}
        onCancel={() => setError(null)}
        testID="checkup-delete-error-dialog"
      />
    </>
  );
}

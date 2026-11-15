import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { PALETTE } from '../constants/colors.js';
import { font } from '../constants/typography.js';
import { formatElapsedTime } from '../lib/relative-time.js';
import { Card } from './ui/Card.js';

export interface OfflineDataNoticeProps {
  /** Indica si los datos provienen de la caché local. */
  fromCache?: boolean;
  /** Indica si la copia local está desactualizada por no poder refrescar desde el servidor. */
  stale?: boolean;
  /** Marca temporal ISO 8601 de la última sincronización exitosa. */
  lastSyncedAt?: string | null;
  /** Fecha de referencia opcional para pruebas deterministas. */
  now?: Date;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Aviso discreto mostrado únicamente cuando la pantalla presenta datos guardados en el dispositivo
 * que no se pudieron refrescar desde el servidor (`fromCache && stale`).
 */
export function OfflineDataNotice({
  fromCache,
  stale,
  lastSyncedAt,
  now,
  testID = 'offline-data-notice',
  style,
}: OfflineDataNoticeProps) {
  const { t } = useTranslation('common');

  if (!fromCache || !stale) {
    return null;
  }

  const time = lastSyncedAt ? formatElapsedTime(lastSyncedAt, now) : '';
  const message = time ? t('offline.dataNotice', { time }) : t('offline.dataNoticeNoTime');

  return (
    <Card style={[styles.card, style]} testID={testID}>
      <View style={styles.row}>
        <Ionicons name="cloud-offline-outline" size={18} color={PALETTE.text.muted} />
        <Text style={styles.text}>{message}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  text: {
    flex: 1,
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
    lineHeight: 18,
  },
});

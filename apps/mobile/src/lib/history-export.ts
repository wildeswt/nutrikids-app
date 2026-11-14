import { Platform, Share } from 'react-native';
import i18n from '../i18n/index.js';
import type { ChildExport } from './data-rights-api.js';

/**
 * Export of the checkup history as CSV (NK-55, RF-20).
 *
 * Why CSV and not PDF: the history is a table (date, weight, height…), a CSV opens in any
 * spreadsheet and can be re-used, and building it needs no native module or layout engine. A PDF
 * would need `expo-print` (a native module, so a new dev-client build) for a table nobody needs
 * formatted. The complete export (JSON, with consents, feeding logs, follow-ups…) stays available
 * at `GET /children/:childId/export`.
 *
 * It lists what the caregiver already sees in the app (RF-14): no z-scores or classifications.
 */

/** Byte order mark: makes Excel read the file as UTF-8 (accents). */
const UTF8_BOM = String.fromCharCode(0xfeff);

/** Quotes a CSV field when it has a comma, a quote or a line break. */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function translateOrRaw(key: string, raw: string): string {
  return i18n.exists(key) ? (i18n.t(key as never) as string) : raw;
}

/**
 * CSV text of the checkups of a child, oldest first, with translated headers. Dates are
 * `YYYY-MM-DD` and numbers keep the dot as decimal separator, so spreadsheets read them as is.
 * Starts with a BOM so Excel opens the accents correctly.
 */
export function buildHistoryCsv(data: ChildExport): string {
  const header = [
    i18n.t('caregiver:privacy.csv.date'),
    i18n.t('caregiver:privacy.csv.weight'),
    i18n.t('caregiver:privacy.csv.height'),
    i18n.t('caregiver:privacy.csv.position'),
    i18n.t('caregiver:privacy.csv.recordedBy'),
    i18n.t('caregiver:privacy.csv.correction'),
  ];

  const rows = [...data.checkups]
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
    .map((checkup) => [
      checkup.measuredAt.slice(0, 10),
      checkup.weightKg,
      checkup.lengthHeightCm,
      translateOrRaw(`caregiver:addCheckup.positions.${checkup.position}`, checkup.position),
      translateOrRaw(`caregiver:evolution.origin.${checkup.origin}`, checkup.origin),
      checkup.correctedCheckupId
        ? i18n.t('caregiver:privacy.csv.yes')
        : i18n.t('caregiver:privacy.csv.no'),
    ]);

  const lines = [header, ...rows].map((row) => row.map(csvField).join(','));
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`;
}

/** File name of the export, e.g. `nutrikids-historial-mateo-2026-11-14.csv`. */
export function historyFileName(firstName: string, now: Date = new Date()): string {
  const slug = firstName
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `nutrikids-historial-${slug || 'nino'}-${now.toISOString().slice(0, 10)}.csv`;
}

/**
 * Hands the CSV to the user. On the web it downloads the file; on the phone it opens the share
 * sheet with the CSV as text (the user can send it by email or chat, or save it in a note): React
 * Native can only share files with a native module (`expo-sharing`) that this app does not have.
 */
export async function deliverHistoryCsv(fileName: string, csv: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }

  await Share.share({ title: fileName, message: csv });
}

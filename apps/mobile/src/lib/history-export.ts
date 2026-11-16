import { Platform } from 'react-native';

/**
 * Export of the child's history as an Excel workbook (NK-55, RF-20).
 *
 * The API builds the workbook (`GET /children/:childId/export.xlsx`: summary, checkups, feeding
 * and permissions, with formatting); the app only downloads it and hands it to the user. It lists
 * what the caregiver already sees in the app (RF-14): no z-scores or classifications.
 */

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** File name from a `Content-Disposition` header, or a generic dated one. */
export function historyFileName(
  contentDisposition: string | null | undefined,
  now: Date = new Date(),
): string {
  const match = /filename="?([^";]+)"?/i.exec(contentDisposition ?? '');
  const name = match?.[1]?.trim();
  if (name && /^[\w.-]+$/.test(name)) return name;
  return `nutrikids-historial-${now.toISOString().slice(0, 10)}.xlsx`;
}

/**
 * Hands the workbook to the user. On the web it downloads the file; on the phone it saves the file
 * in the app cache and opens the system share sheet (save to Drive/Files, send by email or chat).
 */
export async function deliverHistoryWorkbook(fileName: string, data: ArrayBuffer): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([data], { type: XLSX_MIME }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }

  const [{ File, Paths }, Sharing] = await Promise.all([
    import('expo-file-system'),
    import('expo-sharing'),
  ]);
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  await file.write(new Uint8Array(data));
  await Sharing.shareAsync(file.uri, {
    mimeType: XLSX_MIME,
    dialogTitle: fileName,
    UTI: 'org.openxmlformats.spreadsheetml.sheet',
  });
}

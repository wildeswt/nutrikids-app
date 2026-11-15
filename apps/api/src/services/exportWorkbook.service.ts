import { ageInMonths } from '@nutrikids/who-growth';
import ExcelJS from 'exceljs';
import type { exportChildData } from './dataRights.service.js';

/**
 * Libro de Excel con el historial de un niño (RF-20: el representante puede exportar los datos).
 * Es una copia de lo que el representante ya ve en la app (RF-14): sin puntajes z ni
 * clasificaciones técnicas. Hojas: Resumen, Controles, Alimentación y Consentimientos.
 */

type ChildExport = Awaited<ReturnType<typeof exportChildData>>;

const COLOR = {
  primary: 'FF2D5F59',
  accent: 'FFF98650',
  light: 'FFEAF2F0',
  zebra: 'FFF6FAF9',
  border: 'FFD3E0DD',
  text: 'FF1F2937',
  muted: 'FF6B7280',
  white: 'FFFFFFFF',
  warnBg: 'FFFFF3E8',
};

const POSITION_LABEL: Record<string, string> = { STANDING: 'De pie', RECUMBENT: 'Acostado' };
const SEX_LABEL: Record<string, string> = { MALE: 'Niño', FEMALE: 'Niña' };
const ORIGIN_LABEL: Record<string, string> = {
  CAREGIVER: 'Cuidador',
  PROFESSIONAL: 'Profesional de salud',
};

const toDate = (iso: string): Date => new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
const round = (value: number, digits: number): number => Number(value.toFixed(digits));

/** `1 año y 11 meses`, `8 meses`… */
export function describeAge(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years > 0 ? `${years} ${years === 1 ? 'año' : 'años'}` : '';
  const m = rest > 0 ? `${rest} ${rest === 1 ? 'mes' : 'meses'}` : '';
  return [y, m].filter(Boolean).join(' y ') || '0 meses';
}

/** Separa `Comidas: Desayuno, Cena. texto libre` en comidas y notas (ver la app: feeding-form). */
export function splitFeedingDetails(details: string | null): { meals: string; notes: string } {
  if (!details) return { meals: '', notes: '' };
  const match = /^Comidas:\s*([^.]*)\.\s*/.exec(details);
  if (!match) return { meals: '', notes: details.trim() };
  return { meals: (match[1] ?? '').trim(), notes: details.slice(match[0].length).trim() };
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.height = 30;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLOR.white }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: COLOR.accent } } };
  });
}

function styleBodyRow(row: ExcelJS.Row, index: number, muted = false): void {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { color: { argb: muted ? COLOR.muted : COLOR.text }, italic: muted, size: 11 };
    if (index % 2 === 1) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.zebra } };
    }
    cell.border = { bottom: { style: 'thin', color: { argb: COLOR.border } } };
    cell.alignment = { vertical: 'middle', wrapText: true, ...cell.alignment };
  });
}

/** Tabla con encabezado fijo, filtros y columnas con ancho y formato. */
function addTable(
  sheet: ExcelJS.Worksheet,
  columns: Array<{ header: string; width: number; format?: string; align?: 'left' | 'center' }>,
): void {
  sheet.columns = columns.map((c) => ({ header: c.header, width: c.width }));
  styleHeaderRow(sheet.getRow(1));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  columns.forEach((c, i) => {
    const column = sheet.getColumn(i + 1);
    if (c.format) column.numFmt = c.format;
    column.alignment = { horizontal: c.align ?? 'left', vertical: 'middle', wrapText: true };
  });
}

export async function buildChildWorkbook(data: ChildExport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NutriKids';
  wb.title = 'Historial de crecimiento';
  wb.created = new Date(data.exportedAt);

  const child = data.child;
  const fullName = `${child.firstName} ${child.lastName}`.trim();
  const checkups = [...data.checkups].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  const superseded = new Set(
    checkups.map((c) => c.correctedCheckupId).filter((id): id is string => id !== null),
  );
  const current = checkups.filter((c) => !superseded.has(c.id));
  const first = current[0];
  const last = current[current.length - 1];
  const exportedOn = toDate(data.exportedAt);
  const ageNow = ageInMonths(child.birthDate, exportedOn);
  const legalRepresentative = data.caregivers.find((c) => c.isLegalRepresentative)?.name ?? '';
  const activeConsent = data.consents.find((c) => c.revokedAt === null);

  // ------------------------------------------------------------------ Resumen
  const summary = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
  summary.columns = [{ width: 34 }, { width: 38 }];

  summary.mergeCells('A1:B1');
  const title = summary.getCell('A1');
  title.value = 'NutriKids · Historial de crecimiento';
  title.font = { bold: true, size: 18, color: { argb: COLOR.white } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  summary.getRow(1).height = 40;

  summary.mergeCells('A2:B2');
  const subtitle = summary.getCell('A2');
  subtitle.value = fullName;
  subtitle.font = { bold: true, size: 14, color: { argb: COLOR.primary } };
  subtitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.light } };
  subtitle.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  summary.getRow(2).height = 28;

  let rowIndex = 4;
  const section = (label: string): void => {
    summary.mergeCells(`A${rowIndex}:B${rowIndex}`);
    const cell = summary.getCell(`A${rowIndex}`);
    cell.value = label;
    cell.font = { bold: true, size: 12, color: { argb: COLOR.accent } };
    cell.border = { bottom: { style: 'medium', color: { argb: COLOR.accent } } };
    summary.getRow(rowIndex).height = 22;
    rowIndex += 1;
  };
  const line = (label: string, value: string | number | Date, numFmt?: string): void => {
    const row = summary.getRow(rowIndex);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true, color: { argb: COLOR.text } };
    const valueCell = row.getCell(2);
    valueCell.value = value;
    valueCell.font = { color: { argb: COLOR.text } };
    valueCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    if (numFmt) valueCell.numFmt = numFmt;
    [row.getCell(1), valueCell].forEach((cell) => {
      cell.border = { bottom: { style: 'thin', color: { argb: COLOR.border } } };
    });
    row.height = 20;
    rowIndex += 1;
  };

  section('Datos del niño');
  line('Nombre', fullName);
  line('Fecha de nacimiento', toDate(child.birthDate), 'dd/mm/yyyy');
  line('Sexo', SEX_LABEL[child.sex] ?? child.sex);
  line('Edad al exportar', describeAge(ageNow));
  if (legalRepresentative) line('Representante legal', legalRepresentative);
  line('Archivo generado el', exportedOn, 'dd/mm/yyyy');
  rowIndex += 1;

  section('Resumen del historial');
  line('Controles registrados', current.length);
  if (superseded.size > 0) line('Controles reemplazados por una corrección', superseded.size);
  if (first && last) {
    line('Primer control', toDate(first.measuredAt), 'dd/mm/yyyy');
    line('Último control', toDate(last.measuredAt), 'dd/mm/yyyy');
    line('Peso del último control', `${last.weightKg} kg`);
    line('Estatura del último control', `${last.lengthHeightCm} cm`);
    if (current.length > 1) {
      const gain = round(Number(last.weightKg) - Number(first.weightKg), 2);
      const grow = round(Number(last.lengthHeightCm) - Number(first.lengthHeightCm), 1);
      line('Peso ganado desde el primer control', `${gain > 0 ? '+' : ''}${gain} kg`);
      line('Estatura ganada desde el primer control', `${grow > 0 ? '+' : ''}${grow} cm`);
    }
  } else {
    line('Controles', 'Aún no hay controles registrados');
  }
  line('Registros de alimentación', data.feedingLogs.length);
  line(
    'Permiso para guardar los datos',
    activeConsent
      ? `Vigente desde el ${activeConsent.grantedAt.slice(0, 10).split('-').reverse().join('/')}`
      : 'Retirado o sin registrar',
  );

  rowIndex += 1;
  summary.mergeCells(`A${rowIndex}:B${rowIndex + 2}`);
  const note = summary.getCell(`A${rowIndex}`);
  note.value =
    'Este archivo es una copia de los datos de tu niño que guardas en NutriKids. Sirve para ' +
    'consultarlos o llevarlos contigo; no reemplaza la valoración de un profesional de salud.';
  note.font = { italic: true, size: 10, color: { argb: COLOR.muted } };
  note.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.warnBg } };
  note.alignment = { wrapText: true, vertical: 'middle', horizontal: 'left', indent: 1 };

  // ----------------------------------------------------------------- Controles
  const sheet = wb.addWorksheet('Controles', { properties: { tabColor: { argb: COLOR.primary } } });
  addTable(sheet, [
    { header: 'Fecha', width: 13, format: 'dd/mm/yyyy', align: 'center' },
    { header: 'Edad', width: 16 },
    { header: 'Peso (kg)', width: 11, format: '0.00', align: 'center' },
    { header: 'Estatura (cm)', width: 14, format: '0.0', align: 'center' },
    { header: 'IMC (kg/m²)', width: 12, format: '0.0', align: 'center' },
    { header: 'Cambio de peso (kg)', width: 15, format: '+0.00;-0.00;0.00', align: 'center' },
    { header: 'Cambio de estatura (cm)', width: 17, format: '+0.0;-0.0;0.0', align: 'center' },
    { header: 'Cómo se midió', width: 14, align: 'center' },
    { header: 'Registrado por', width: 24 },
    { header: 'Estado', width: 22, align: 'center' },
    { header: 'Notas', width: 40 },
  ]);

  let previous: (typeof current)[number] | undefined;
  checkups.forEach((checkup, index) => {
    const isCurrent = !superseded.has(checkup.id);
    const weight = Number(checkup.weightKg);
    const height = Number(checkup.lengthHeightCm);
    const months = ageInMonths(child.birthDate, checkup.measuredAt);
    const row = sheet.addRow([
      toDate(checkup.measuredAt),
      describeAge(months),
      weight,
      height,
      round(weight / (height / 100) ** 2, 1),
      isCurrent && previous ? round(weight - Number(previous.weightKg), 2) : null,
      isCurrent && previous ? round(height - Number(previous.lengthHeightCm), 1) : null,
      POSITION_LABEL[checkup.position] ?? checkup.position,
      checkup.recordedBy || (ORIGIN_LABEL[checkup.origin] ?? checkup.origin),
      isCurrent
        ? checkup.correctedCheckupId
          ? 'Vigente (corregido)'
          : 'Vigente'
        : 'Reemplazado por una corrección',
      checkup.notes ?? '',
    ]);
    styleBodyRow(row, index, !isCurrent);
    if (isCurrent) previous = checkup;
  });
  if (checkups.length === 0) {
    const row = sheet.addRow(['Aún no hay controles registrados']);
    sheet.mergeCells(row.number, 1, row.number, 11);
    row.getCell(1).font = { italic: true, color: { argb: COLOR.muted } };
  }

  // -------------------------------------------------------------- Alimentación
  const feeding = wb.addWorksheet('Alimentación', {
    properties: { tabColor: { argb: COLOR.accent } },
  });
  addTable(feeding, [
    { header: 'Fecha', width: 13, format: 'dd/mm/yyyy', align: 'center' },
    { header: 'Comidas al día', width: 15, format: '0', align: 'center' },
    { header: 'Comidas marcadas', width: 44 },
    { header: 'Qué comió / notas', width: 52 },
  ]);
  [...data.feedingLogs]
    .sort((a, b) => a.logDate.localeCompare(b.logDate))
    .forEach((log, index) => {
      const { meals, notes } = splitFeedingDetails(log.details);
      const row = feeding.addRow([toDate(log.logDate), log.mealsPerDay, meals, notes]);
      styleBodyRow(row, index);
    });
  if (data.feedingLogs.length === 0) {
    const row = feeding.addRow(['Aún no hay registros de alimentación']);
    feeding.mergeCells(row.number, 1, row.number, 4);
    row.getCell(1).font = { italic: true, color: { argb: COLOR.muted } };
  }

  // ----------------------------------------------------------- Consentimientos
  const consents = wb.addWorksheet('Permisos');
  addTable(consents, [
    { header: 'Aceptado el', width: 16, format: 'dd/mm/yyyy', align: 'center' },
    { header: 'Retirado el', width: 16, format: 'dd/mm/yyyy', align: 'center' },
    { header: 'Estado', width: 16, align: 'center' },
  ]);
  [...data.consents]
    .sort((a, b) => a.grantedAt.localeCompare(b.grantedAt))
    .forEach((consent, index) => {
      const row = consents.addRow([
        toDate(consent.grantedAt),
        consent.revokedAt ? toDate(consent.revokedAt) : null,
        consent.revokedAt ? 'Retirado' : 'Vigente',
      ]);
      styleBodyRow(row, index);
    });

  for (const ws of wb.worksheets) {
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Nombre del archivo, p. ej. `nutrikids-historial-mateo-2026-11-14.xlsx`. */
export function workbookFileName(firstName: string, exportedAt: string): string {
  const slug = firstName
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `nutrikids-historial-${slug || 'nino'}-${exportedAt.slice(0, 10)}.xlsx`;
}

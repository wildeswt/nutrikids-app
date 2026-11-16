import {
  STATISTICAL_EXPORT_COLUMNS,
  StatisticalExportRowSchema,
  type StatisticalExportRow,
} from '@nutrikids/shared';
import { pseudonymize } from '../lib/pseudonym.js';

const FORBIDDEN_KEYS = new Set([
  'id',
  'childId',
  'userId',
  'caregiverId',
  'professionalId',
  'checkupId',
  'alertId',
  'firstName',
  'lastName',
  'first_name',
  'last_name',
  'phone',
  'email',
  'birthDate',
  'birth_date',
  'licenseNumber',
  'license_number',
]);

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_RE = /^\+?[0-9 ()-]{7,20}$/;

export function assertNoDirectIdentifiers(row: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(row)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`Export contains a forbidden identifier field: ${key}`);
    }

    if (key === 'measuredMonth') {
      continue;
    }

    if (typeof value === 'string') {
      if (UUID_RE.test(value)) {
        throw new Error(`Export contains a UUID identifier value in field: ${key}`);
      }
      if (EMAIL_RE.test(value)) {
        throw new Error(`Export contains an email identifier value in field: ${key}`);
      }
      if (PHONE_RE.test(value)) {
        throw new Error(`Export contains a phone identifier value in field: ${key}`);
      }
    }
  }
}

export function toStatisticalRow(input: {
  childId: string;
  ageMonths: number;
  sex: StatisticalExportRow['sex'];
  indicator: StatisticalExportRow['indicator'];
  zScore: number;
  classification: string;
  measuredAt: Date;
}): StatisticalExportRow {
  const row: StatisticalExportRow = {
    pseudonym: pseudonymize('child', input.childId),
    ageMonths: input.ageMonths,
    sex: input.sex,
    indicator: input.indicator,
    zScore: input.zScore,
    classification: input.classification,
    measuredMonth: input.measuredAt.toISOString().slice(0, 7),
  };

  const parsed = StatisticalExportRowSchema.parse(row);
  assertNoDirectIdentifiers(parsed as Record<string, unknown>);
  return parsed;
}

export function toCsv(rows: StatisticalExportRow[]): string {
  const header = STATISTICAL_EXPORT_COLUMNS.join(',');
  const lines = rows.map((row) =>
    STATISTICAL_EXPORT_COLUMNS.map((column) => {
      const value = String(row[column]);
      return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
    }).join(','),
  );

  return [header, ...lines].join('\n');
}

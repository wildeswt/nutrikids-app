import { z } from 'zod';
import { IndicatorSchema, SexSchema } from './enums.js';

export const STATISTICAL_EXPORT_COLUMNS = [
  'pseudonym',
  'ageMonths',
  'sex',
  'indicator',
  'zScore',
  'classification',
  'measuredMonth',
] as const;

export const StatisticalExportRowSchema = z.strictObject({
  pseudonym: z.string().regex(/^psn_[A-Za-z0-9_-]{22}$/),
  ageMonths: z.number().int().min(0).max(60),
  sex: SexSchema,
  indicator: IndicatorSchema,
  zScore: z.number(),
  classification: z.string().min(1),
  measuredMonth: z.string().regex(/^\d{4}-\d{2}$/),
});

export type StatisticalExportRow = z.infer<typeof StatisticalExportRowSchema>;

import { describe, expect, it } from 'vitest';
import { EducationQuerySchema } from '../index.js';

describe('EducationQuerySchema', () => {
  it('idioma «es» por defecto, edad opcional y normaliza el idioma', () => {
    expect(EducationQuerySchema.parse({})).toEqual({ language: 'es' });
    expect(EducationQuerySchema.parse({ ageMonths: '30', language: ' QU ' })).toEqual({
      ageMonths: 30,
      language: 'qu',
    });
  });

  it.each([{ ageMonths: '-1' }, { ageMonths: '1.5' }, { ageMonths: 'x' }, { language: 'es-EC' }])(
    'rechaza %j',
    (query) => {
      expect(EducationQuerySchema.safeParse(query).success).toBe(false);
    },
  );
});

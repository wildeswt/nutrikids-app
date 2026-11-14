import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { pseudonymize } from '../lib/pseudonym.js';
import {
  assertNoDirectIdentifiers,
  toCsv,
  toStatisticalRow,
} from '../services/statistics-export.service.js';

describe('Exportaciones estadísticas y seudonimización (RT-07)', () => {
  const childId = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d';

  it('pseudonymize es determinista para la misma entidad e ID', () => {
    const p1 = pseudonymize('child', childId);
    const p2 = pseudonymize('child', childId);
    expect(p1).toBe(p2);
    expect(p1.startsWith('psn_')).toBe(true);
    expect(p1.length).toBe(26); // psn_ + 22 chars
  });

  it('produce seudónimos distintos para distintas entidades o distintos IDs', () => {
    const pChild = pseudonymize('child', childId);
    const pCaregiver = pseudonymize('caregiver', childId);
    const pOtherChild = pseudonymize('child', crypto.randomUUID());

    expect(pChild).not.toBe(pCaregiver);
    expect(pChild).not.toBe(pOtherChild);
  });

  it('el seudónimo no contiene fragmentos reconocibles del UUID original', () => {
    const p = pseudonymize('child', childId);
    expect(p).not.toContain(childId);
    expect(p).not.toContain('a1b2c3d4');
  });

  it('toStatisticalRow transforma un registro clínico en fila estadística conforme al esquema', () => {
    const row = toStatisticalRow({
      childId,
      ageMonths: 24,
      sex: 'FEMALE',
      indicator: 'WEIGHT_FOR_AGE',
      zScore: -1.25,
      classification: 'Normal',
      measuredAt: new Date('2026-05-18T10:30:00Z'),
    });

    expect(row).toMatchObject({
      pseudonym: expect.stringMatching(/^psn_[A-Za-z0-9_-]{22}$/),
      ageMonths: 24,
      sex: 'FEMALE',
      indicator: 'WEIGHT_FOR_AGE',
      zScore: -1.25,
      classification: 'Normal',
      measuredMonth: '2026-05',
    });
    // Verifica que no se incluye la fecha exacta, solo el mes
    expect(row).not.toHaveProperty('measuredAt');
    expect(row).not.toHaveProperty('childId');
  });

  it('assertNoDirectIdentifiers rechaza objetos con claves prohibidas (nombres, IDs, correo, teléfono)', () => {
    expect(() =>
      assertNoDirectIdentifiers({
        pseudonym: 'psn_1234567890123456789012',
        firstName: 'Mateo',
      }),
    ).toThrow(/forbidden identifier field: firstName/);

    expect(() =>
      assertNoDirectIdentifiers({
        pseudonym: 'psn_1234567890123456789012',
        childId,
      }),
    ).toThrow(/forbidden identifier field: childId/);
  });

  it('assertNoDirectIdentifiers rechaza valores que parezcan UUIDs, emails o teléfonos', () => {
    expect(() =>
      assertNoDirectIdentifiers({
        pseudonym: 'psn_1234567890123456789012',
        customField: childId,
      }),
    ).toThrow(/UUID identifier/);

    expect(() =>
      assertNoDirectIdentifiers({
        pseudonym: 'psn_1234567890123456789012',
        customField: 'usuario@example.test',
      }),
    ).toThrow(/email identifier/);

    expect(() =>
      assertNoDirectIdentifiers({
        pseudonym: 'psn_1234567890123456789012',
        customField: '+584120000001',
      }),
    ).toThrow(/phone identifier/);
  });

  it('toCsv genera un CSV con cabeceras estrictas y sin identificadores directos', () => {
    const row = toStatisticalRow({
      childId,
      ageMonths: 36,
      sex: 'MALE',
      indicator: 'WEIGHT_FOR_LENGTH_HEIGHT',
      zScore: -2.3,
      classification: 'Emaciación',
      measuredAt: new Date('2026-10-18T09:12:00Z'),
    });

    const csv = toCsv([row]);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('pseudonym,ageMonths,sex,indicator,zScore,classification,measuredMonth');
    expect(lines[1]).toContain(row.pseudonym);
    expect(lines[1]).toContain('36,MALE,WEIGHT_FOR_LENGTH_HEIGHT,-2.3,Emaciación,2026-10');

    // No debe contener UUID original ni nombres
    expect(csv).not.toContain(childId);
    expect(csv).not.toContain('Mateo');
  });
});

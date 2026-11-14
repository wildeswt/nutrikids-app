import { Platform, Share } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChildExport } from '../lib/data-rights-api.js';
import {
  buildHistoryCsv,
  csvField,
  deliverHistoryCsv,
  historyFileName,
} from '../lib/history-export.js';

const makeCheckup = (
  id: string,
  measuredAt: string,
  overrides: Partial<ChildExport['checkups'][number]> = {},
): ChildExport['checkups'][number] => ({
  id,
  measuredAt,
  weightKg: '13.4',
  lengthHeightCm: '91.5',
  position: 'STANDING',
  origin: 'CAREGIVER',
  correctedCheckupId: null,
  ...overrides,
});

const data: ChildExport = {
  exportedAt: '2026-11-14T10:00:00.000Z',
  child: {
    id: '11111111-1111-4111-8111-111111111111',
    firstName: 'Mateo',
    lastName: 'Gómez',
    birthDate: '2023-06-15',
    sex: 'MALE',
  },
  checkups: [
    makeCheckup('b', '2026-10-01T15:00:00.000Z', {
      weightKg: '14.1',
      lengthHeightCm: '93.0',
      position: 'RECUMBENT',
      origin: 'PROFESSIONAL',
      correctedCheckupId: 'a',
    }),
    makeCheckup('a', '2026-08-01T15:00:00.000Z'),
  ],
};

describe('csvField', () => {
  it('leaves plain text as is and quotes commas, quotes and line breaks', () => {
    expect(csvField('Mateo')).toBe('Mateo');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('dijo "hola"')).toBe('"dijo ""hola"""');
    expect(csvField('uno\ndos')).toBe('"uno\ndos"');
  });
});

describe('buildHistoryCsv', () => {
  const csv = buildHistoryCsv(data);
  const lines = csv.trimEnd().split('\r\n');

  it('starts with a BOM and the translated header', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(lines[0]!.slice(1)).toBe(
      'Fecha del control,Peso (kg),Estatura (cm),Cómo se midió,Quién lo anotó,Corrige un control anterior',
    );
  });

  it('lists the checkups oldest first with plain-language values', () => {
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('2026-08-01,13.4,91.5,De pie,Tú,No');
    expect(lines[2]).toBe('2026-10-01,14.1,93.0,Acostado,Equipo de salud,Sí');
  });

  it('never includes z-scores, percentiles or classifications (RF-14)', () => {
    expect(csv.toLowerCase()).not.toMatch(/z-?score|percentil|clasificaci/);
  });

  it('keeps a header-only file for a child without checkups', () => {
    expect(
      buildHistoryCsv({ ...data, checkups: [] })
        .trimEnd()
        .split('\r\n'),
    ).toHaveLength(1);
  });

  it('keeps unknown positions and origins as they come', () => {
    const odd = buildHistoryCsv({
      ...data,
      checkups: [
        makeCheckup('x', '2026-01-01T00:00:00.000Z', { position: 'SITTING', origin: 'ROBOT' }),
      ],
    });

    expect(odd).toContain(',SITTING,ROBOT,');
  });
});

describe('historyFileName', () => {
  it('builds a safe file name from the first name and the date', () => {
    const now = new Date('2026-11-14T10:00:00.000Z');

    expect(historyFileName('Mateo', now)).toBe('nutrikids-historial-mateo-2026-11-14.csv');
    expect(historyFileName('María José', now)).toBe(
      'nutrikids-historial-maria-jose-2026-11-14.csv',
    );
    expect(historyFileName('???', now)).toBe('nutrikids-historial-nino-2026-11-14.csv');
  });
});

describe('deliverHistoryCsv', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens the share sheet with the CSV as text on the phone', async () => {
    Platform.OS = 'android';
    const share = vi
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction', activityType: undefined });

    await deliverHistoryCsv('historial.csv', 'a,b');

    expect(share).toHaveBeenCalledWith({ title: 'historial.csv', message: 'a,b' });
  });

  it('downloads a file on the web', async () => {
    Platform.OS = 'web';
    const click = vi.fn();
    const link = { href: '', download: '', click };
    vi.stubGlobal('document', { createElement: vi.fn(() => link) });
    const createObjectURL = vi.fn(() => 'blob:csv');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    await deliverHistoryCsv('historial.csv', 'a,b');

    expect(link).toMatchObject({ href: 'blob:csv', download: 'historial.csv' });
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv');
  });
});

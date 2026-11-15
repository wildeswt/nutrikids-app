import { Platform } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fileMocks = vi.hoisted(() => ({
  create: vi.fn(),
  write: vi.fn(async () => {}),
  del: vi.fn(),
  exists: false,
  shareAsync: vi.fn(async () => {}),
}));

vi.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache/' },
  File: class {
    uri: string;
    constructor(dir: string, name: string) {
      this.uri = `${dir}${name}`;
    }
    get exists() {
      return fileMocks.exists;
    }
    create = fileMocks.create;
    write = fileMocks.write;
    delete = fileMocks.del;
  },
}));

vi.mock('expo-sharing', () => ({ shareAsync: fileMocks.shareAsync }));

import { XLSX_MIME, deliverHistoryWorkbook, historyFileName } from '../lib/history-export.js';

describe('historyFileName', () => {
  it('uses the file name sent by the API', () => {
    expect(
      historyFileName('attachment; filename="nutrikids-historial-mateo-2026-11-14.xlsx"'),
    ).toBe('nutrikids-historial-mateo-2026-11-14.xlsx');
  });

  it('falls back to a dated generic name when the header is missing or odd', () => {
    const now = new Date('2026-11-14T10:00:00.000Z');
    expect(historyFileName(null, now)).toBe('nutrikids-historial-2026-11-14.xlsx');
    expect(historyFileName('attachment', now)).toBe('nutrikids-historial-2026-11-14.xlsx');
    expect(historyFileName('attachment; filename="../etc/passwd"', now)).toBe(
      'nutrikids-historial-2026-11-14.xlsx',
    );
  });
});

describe('deliverHistoryWorkbook', () => {
  const originalOS = Platform.OS;
  const data = new Uint8Array([80, 75, 3, 4]).buffer;

  afterEach(() => {
    Platform.OS = originalOS;
    fileMocks.exists = false;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('saves the file in the cache and opens the share sheet on the phone', async () => {
    Platform.OS = 'android';

    await deliverHistoryWorkbook('historial.xlsx', data);

    expect(fileMocks.create).toHaveBeenCalledTimes(1);
    expect(fileMocks.write).toHaveBeenCalledWith(new Uint8Array([80, 75, 3, 4]));
    expect(fileMocks.shareAsync).toHaveBeenCalledWith(
      'file:///cache/historial.xlsx',
      expect.objectContaining({ mimeType: XLSX_MIME }),
    );
  });

  it('replaces a previous file with the same name', async () => {
    Platform.OS = 'ios';
    fileMocks.exists = true;

    await deliverHistoryWorkbook('historial.xlsx', data);

    expect(fileMocks.del).toHaveBeenCalledTimes(1);
  });

  it('downloads a file on the web', async () => {
    Platform.OS = 'web';
    const click = vi.fn();
    const link = { href: '', download: '', click };
    vi.stubGlobal('document', { createElement: vi.fn(() => link) });
    const createObjectURL = vi.fn(() => 'blob:xlsx');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    await deliverHistoryWorkbook('historial.xlsx', data);

    expect(link).toMatchObject({ href: 'blob:xlsx', download: 'historial.xlsx' });
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:xlsx');
    expect(fileMocks.shareAsync).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import {
  formatAge,
  formatAgeShort,
  formatDecimal,
  formatLongDate,
  formatShortDate,
} from '../i18n/format.js';
import i18n, {
  DEFAULT_LANGUAGE,
  LANGUAGE_OPTIONS,
  NAMESPACES,
  SUPPORTED_LANGUAGES,
} from '../i18n/index.js';
import { resources } from '../i18n/resources.js';

type Tree = { [key: string]: string | Tree };

function flattenKeys(tree: Tree, prefix = ''): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      result.set(fullKey, value);
    } else {
      for (const [k, v] of flattenKeys(value, fullKey)) result.set(k, v);
    }
  }
  return result;
}

declare global {
  interface ImportMeta {
    glob<T>(
      pattern: string,
      options: { eager: true; import: 'default'; query?: string },
    ): Record<string, T>;
  }
}

// Vite resolves these globs at build time, so the test sees the real files on disk.
const esFiles = import.meta.glob<Tree>('../i18n/locales/es/*.json', {
  eager: true,
  import: 'default',
});
const quFiles = import.meta.glob<Tree>('../i18n/locales/qu/*.json', {
  eager: true,
  import: 'default',
});
const quDocs = import.meta.glob<string>('../i18n/locales/qu/*.md', {
  eager: true,
  import: 'default',
  query: '?raw',
});

const fileNamespace = (filePath: string) =>
  filePath
    .split('/')
    .pop()!
    .replace(/\.json$/, '');

describe('i18n (RT-10)', () => {
  it('uses Spanish as the base and fallback language', () => {
    expect(DEFAULT_LANGUAGE).toBe('es');
    expect(SUPPORTED_LANGUAGES).toContain('es');
    expect(i18n.language).toBe('es');
    expect(i18n.options.fallbackLng).toEqual(['es']);
  });

  it('has a complete Spanish file for every namespace, with no empty values', () => {
    for (const ns of NAMESPACES) {
      const keys = flattenKeys(resources.es[ns] as unknown as Tree);
      expect(keys.size, `namespace ${ns}`).toBeGreaterThan(0);
      for (const [key, value] of keys) {
        expect(value.trim(), `${ns}:${key}`).not.toBe('');
      }
    }
  });

  it('every es/*.json file is registered as a namespace', () => {
    const files = Object.keys(esFiles).map(fileNamespace).sort();
    expect(files).toEqual([...NAMESPACES].sort());
  });

  it('keeps a folder ready for Kichwa (qu) whose files only use keys that exist in Spanish', () => {
    expect(Object.keys(quDocs).some((file) => file.endsWith('/README.md'))).toBe(true);

    for (const [file, quTree] of Object.entries(quFiles)) {
      const ns = fileNamespace(file) as (typeof NAMESPACES)[number];
      expect(NAMESPACES, `${file} must match an es namespace`).toContain(ns);
      const esKeys = flattenKeys(resources.es[ns] as unknown as Tree);
      for (const key of flattenKeys(quTree).keys()) {
        expect(esKeys.has(key), `${file}: unknown key "${key}"`).toBe(true);
      }
    }
  });

  it('registers Kichwa (qu) as a selectable language marked as draft', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['es', 'qu']);
    expect(LANGUAGE_OPTIONS.map((option) => option.code)).toEqual(['es', 'qu']);
    expect(LANGUAGE_OPTIONS.find((option) => option.code === 'qu')?.draft).toBe(true);
  });

  it('translates every Spanish key to Kichwa except versioned legal documents', () => {
    for (const ns of NAMESPACES) {
      const esKeys = flattenKeys(resources.es[ns] as unknown as Tree);
      const quKeys = flattenKeys(resources.qu[ns] as unknown as Tree);
      const missing = [...esKeys.keys()].filter(
        (key) => !quKeys.has(key) && !key.startsWith('documents.'),
      );
      expect(missing, `qu/${ns}.json`).toEqual([]);
    }
  });

  it('falls back to Spanish for missing keys and unsupported languages', () => {
    expect(i18n.getFixedT('qu', 'consent')('documents.v1')).toContain(
      'DECLARACIÓN DE CONSENTIMIENTO INFORMADO',
    );
    expect(i18n.getFixedT('fr', 'common')('actions.back')).toBe('Volver');
  });

  it('formats ages, dates and decimals in the active language', () => {
    expect(formatAge(41)).toBe('3 años y 5 meses');
    expect(formatAge(20)).toBe('1 año y 8 meses');
    expect(formatAge(12)).toBe('1 año');
    expect(formatAge(1)).toBe('1 mes');
    expect(formatAgeShort(39)).toBe('3 años 3m');
    expect(formatLongDate('2026-10-18')).toBe('18 de octubre de 2026');
    expect(formatShortDate('2026-10-16')).toBe('16 oct');
    expect(formatDecimal(12.2)).toBe('12,2');
  });
});

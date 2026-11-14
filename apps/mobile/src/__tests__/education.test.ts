import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  articlePreview,
  childAgeMonths,
  filterByAge,
  readingMinutes,
  splitParagraphs,
} from '../lib/education.js';

const make = (id: string, minAgeMonths: number, maxAgeMonths: number) => ({
  id,
  title: id,
  body: 'Texto',
  minAgeMonths,
  maxAgeMonths,
  language: 'es',
});

describe('filterByAge', () => {
  const articles = [make('a', 12, 23), make('b', 24, 35), make('c', 36, 47), make('d', 12, 60)];

  it('keeps the articles whose range contains the age, both ends inclusive', () => {
    expect(filterByAge(articles, 24).map((item) => item.id)).toEqual(['b', 'd']);
    expect(filterByAge(articles, 23).map((item) => item.id)).toEqual(['a', 'd']);
    expect(filterByAge(articles, 47).map((item) => item.id)).toEqual(['c', 'd']);
  });

  it('returns nothing outside every range', () => {
    expect(filterByAge(articles, 6)).toEqual([]);
    expect(filterByAge(articles, 61)).toEqual([]);
  });
});

describe('childAgeMonths', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts the completed months today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 14, 12, 0, 0));

    expect(childAgeMonths({ birthDate: '2023-06-15' })).toBe(40);
    expect(childAgeMonths({ birthDate: '2023-06-14' })).toBe(41);
    expect(childAgeMonths({ birthDate: '2023-06-13' })).toBe(41);
    expect(childAgeMonths({ birthDate: '2023-11-14' })).toBe(36);
    expect(childAgeMonths({ birthDate: '2023-11-15' })).toBe(35);
  });

  it('never returns a negative age', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 14, 12, 0, 0));

    expect(childAgeMonths({ birthDate: '2026-12-01' })).toBe(0);
  });
});

describe('readingMinutes', () => {
  it('is at least one minute and grows with the length of the text', () => {
    expect(readingMinutes('Hola mundo')).toBe(1);
    expect(readingMinutes('palabra '.repeat(180))).toBe(1);
    expect(readingMinutes('palabra '.repeat(181))).toBe(2);
    expect(readingMinutes('')).toBe(1);
  });
});

describe('splitParagraphs', () => {
  it('splits on blank lines and drops empty blocks', () => {
    expect(splitParagraphs('Uno.\n\nDos.\n  \nTres.\n\n')).toEqual(['Uno.', 'Dos.', 'Tres.']);
  });

  it('keeps a single block as one paragraph', () => {
    expect(splitParagraphs('Solo un párrafo.\nCon salto de línea.')).toEqual([
      'Solo un párrafo.\nCon salto de línea.',
    ]);
  });
});

describe('articlePreview', () => {
  it('returns short text as is, collapsing whitespace', () => {
    expect(articlePreview('Texto   corto\ncon salto')).toBe('Texto corto con salto');
  });

  it('cuts long text at a word and adds an ellipsis', () => {
    const preview = articlePreview('palabra '.repeat(50), 30);

    expect(preview.endsWith('…')).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(31);
    expect(preview).not.toMatch(/palab…$/);
  });
});

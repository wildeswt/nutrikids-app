import { describe, expect, it } from 'vitest';
import {
  parseChildRegisteredParams,
  toChildRegisteredParams,
} from '../lib/child-registered-route.js';

describe('child-registered route params', () => {
  it('round-trips the registered child', () => {
    const params = toChildRegisteredParams({
      id: '11111111-1111-4111-8111-111111111111',
      firstName: 'Mateo',
      birthDate: '2023-06-05',
    });
    expect(parseChildRegisteredParams(params)).toEqual(params);
  });

  it('returns null when any value is missing or empty', () => {
    expect(parseChildRegisteredParams({})).toBeNull();
    expect(
      parseChildRegisteredParams({ childId: 'x', childName: ' ', birthDate: '2023-06-05' }),
    ).toBeNull();
  });

  it('accepts array params (expo-router)', () => {
    expect(
      parseChildRegisteredParams({
        childId: ['a'],
        childName: ['Mateo'],
        birthDate: ['2023-06-05'],
      }),
    ).toEqual({ childId: 'a', childName: 'Mateo', birthDate: '2023-06-05' });
  });
});

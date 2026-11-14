import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {},
  },
}));

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

import { createChild, fetchCaregiverChildren, formatChildAge } from '../lib/children-api.js';

describe('children-api', () => {
  const mockChildData = {
    id: '11111111-1111-4111-8111-111111111111',
    firstName: 'Mateo',
    lastName: 'Gómez',
    birthDate: '2023-06-15',
    sex: 'MALE',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatChildAge', () => {
    it('formats child age in months when less than 1 year', () => {
      // Calculate a birthdate 6 months before today
      const today = new Date();
      const birthDate = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate())
        .toISOString()
        .slice(0, 10);

      const formatted = formatChildAge(birthDate);
      expect(formatted).toBe('6 meses');
    });

    it('formats child age with exact years', () => {
      const today = new Date();
      const birthDate = new Date(today.getFullYear() - 2, today.getMonth(), today.getDate())
        .toISOString()
        .slice(0, 10);

      const formatted = formatChildAge(birthDate);
      expect(formatted).toBe('2 años');
    });

    it('formats child age with years and months', () => {
      const today = new Date();
      const birthDate = new Date(today.getFullYear() - 3, today.getMonth() - 5, today.getDate())
        .toISOString()
        .slice(0, 10);

      const formatted = formatChildAge(birthDate);
      expect(formatted).toBe('3 años y 5 meses');
    });

    it('handles single year and single month correctly', () => {
      const today = new Date();
      const birthDate = new Date(today.getFullYear() - 1, today.getMonth() - 1, today.getDate())
        .toISOString()
        .slice(0, 10);

      const formatted = formatChildAge(birthDate);
      expect(formatted).toBe('1 año y 1 mes');
    });
  });

  describe('fetchCaregiverChildren', () => {
    it('returns array of children when response is 200 OK', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([mockChildData]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchCaregiverChildren();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockChildData);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/children'),
        expect.any(Object),
      );
    });

    it('returns empty array when caregiver has no registered children', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchCaregiverChildren();
      expect(result).toEqual([]);
    });

    it('throws parsed error when endpoint returns 500 error', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'Internal Error',
            message: 'Fallo al consultar la base de datos',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
      vi.stubGlobal('fetch', mockFetch);

      await expect(fetchCaregiverChildren()).rejects.toThrow('Fallo al consultar la base de datos');
    });
  });

  describe('createChild', () => {
    it('sends POST /children with validated input and returns created child', async () => {
      const today = new Date();
      // 24 months old child
      const validBirthDate = new Date(today.getFullYear() - 2, today.getMonth(), today.getDate())
        .toISOString()
        .slice(0, 10);

      const input = {
        firstName: 'Lucía',
        lastName: 'Ramírez',
        birthDate: validBirthDate,
        sex: 'FEMALE' as const,
        relationship: 'Madre',
        isLegalRepresentative: true,
        consentTextVersion: 'v1',
      };

      const mockResponse = {
        id: '99999999-9999-4999-8999-999999999999',
        firstName: input.firstName,
        lastName: input.lastName,
        birthDate: input.birthDate,
        sex: input.sex,
      };

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponse), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', mockFetch);

      const result = await createChild(input);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/children'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(input),
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('rejects client-side when input violates age constraints (e.g. older than 60 months)', async () => {
      const today = new Date();
      // 72 months old (6 years old)
      const invalidBirthDate = new Date(today.getFullYear() - 6, today.getMonth(), today.getDate())
        .toISOString()
        .slice(0, 10);

      const input = {
        firstName: 'Pedro',
        lastName: 'González',
        birthDate: invalidBirthDate,
        sex: 'MALE' as const,
        relationship: 'Padre',
        isLegalRepresentative: true,
        consentTextVersion: 'v1',
      };

      await expect(createChild(input)).rejects.toThrow();
    });

    it('throws server error when endpoint responds with 400', async () => {
      const today = new Date();
      const validBirthDate = new Date(today.getFullYear() - 2, today.getMonth(), today.getDate())
        .toISOString()
        .slice(0, 10);

      const input = {
        firstName: 'Lucía',
        lastName: 'Ramírez',
        birthDate: validBirthDate,
        sex: 'FEMALE' as const,
        relationship: 'Madre',
        isLegalRepresentative: true,
        consentTextVersion: 'v1',
      };

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'Bad Request',
            message: 'El niño debe tener entre 12 y 60 meses',
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
      vi.stubGlobal('fetch', mockFetch);

      await expect(createChild(input)).rejects.toThrow('El niño debe tener entre 12 y 60 meses');
    });
  });
});

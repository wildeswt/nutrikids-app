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

import {
  CURRENT_CONSENT_VERSION,
  fetchCaregiverChildren,
  fetchConsentForChild,
  grantConsentForChild,
  revokeConsentForChild,
} from '../lib/consent-api.js';

describe('consent-api', () => {
  const validChildId = '11111111-1111-4111-8111-111111111111';
  const mockConsentData = {
    id: '22222222-2222-4222-8222-222222222222',
    childId: validChildId,
    grantedById: '33333333-3333-4333-8333-333333333333',
    textVersion: 'v1',
    grantedAt: '2026-11-12T15:00:00.000Z',
    revokedAt: null,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchConsentForChild', () => {
    it('returns parsed consent when child has an active consent (200 OK)', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockConsentData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchConsentForChild(validChildId);
      expect(result).toEqual(mockConsentData);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/children/${validChildId}/consent`),
        expect.any(Object),
      );
    });

    it('returns null when child has no registered consent (404 Not Found)', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Not Found', message: 'No consent' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchConsentForChild(validChildId);
      expect(result).toBeNull();
    });

    it('throws error with parsed message when request fails with 500', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'Internal Error', message: 'Fallo de base de datos' }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
      vi.stubGlobal('fetch', mockFetch);

      await expect(fetchConsentForChild(validChildId)).rejects.toThrow('Fallo de base de datos');
    });
  });

  describe('grantConsentForChild', () => {
    it('dispatches POST /children/:childId/consent with textVersion and returns response', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockConsentData), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', mockFetch);

      const result = await grantConsentForChild(validChildId, CURRENT_CONSENT_VERSION);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/children/${validChildId}/consent`),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ textVersion: 'v1' }),
        }),
      );
      expect(result.textVersion).toBe('v1');
      expect(result.revokedAt).toBeNull();
    });

    it('throws error when server responds with 409 conflict', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'Conflict',
            message: 'Ya existe un consentimiento informado vigente con esta versión del texto',
          }),
          {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
      vi.stubGlobal('fetch', mockFetch);

      await expect(grantConsentForChild(validChildId, 'v1')).rejects.toThrow(
        'Ya existe un consentimiento informado vigente con esta versión del texto',
      );
    });
  });

  describe('revokeConsentForChild', () => {
    it('dispatches DELETE /children/:childId/consent and returns revoked consent', async () => {
      const revokedData = {
        ...mockConsentData,
        revokedAt: '2026-11-12T15:30:00.000Z',
      };

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(revokedData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', mockFetch);

      const result = await revokeConsentForChild(validChildId);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/children/${validChildId}/consent`),
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
      expect(result.revokedAt).toBe('2026-11-12T15:30:00.000Z');
    });
  });

  describe('fetchCaregiverChildren', () => {
    it('returns array of children linked to caregiver', async () => {
      const mockChildren = [
        {
          id: validChildId,
          firstName: 'Sofía',
          lastName: 'Morales',
          birthDate: '2024-05-10',
          sex: 'FEMALE',
        },
      ];

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockChildren), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchCaregiverChildren();
      expect(result).toHaveLength(1);
      expect(result[0]?.firstName).toBe('Sofía');
    });
  });
});

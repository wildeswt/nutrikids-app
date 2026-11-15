import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({ default: { expoConfig: {} } }));

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

import {
  ProfessionalApiError,
  linkProfessional,
  lookupProfessional,
  professionalInitials,
  unlinkProfessional,
} from '../lib/professionals-api.js';

const CHILD_ID = '11111111-1111-4111-8111-111111111111';
const PRO_ID = '22222222-2222-4222-8222-222222222222';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const assignment = {
  id: '33333333-3333-4333-8333-333333333333',
  childId: CHILD_ID,
  professionalId: PRO_ID,
  specialty: 'nutrition',
  firstName: 'Laura',
  lastName: 'Pérez',
  startDate: '2026-11-14',
  endDate: null,
};

describe('professionals-api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lookupProfessional calls GET /professionals/lookup with the encoded, trimmed license', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        professionalId: PRO_ID,
        firstName: 'Laura',
        lastName: 'Pérez',
        specialty: 'nutrition',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await lookupProfessional('  AB 12/3 ');

    expect(result.professionalId).toBe(PRO_ID);
    const url = String((fetchMock.mock.calls as unknown as [string][])[0]![0]);
    expect(url).toContain('/professionals/lookup?license=AB%2012%2F3');
  });

  it('maps 404 and 429 to errors that keep the status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'Not Found', message: 'x' }, 404)),
    );
    await expect(lookupProfessional('X')).rejects.toMatchObject({ status: 404 });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'Too Many Requests', message: 'x' }, 429)),
    );
    await expect(lookupProfessional('X')).rejects.toBeInstanceOf(ProfessionalApiError);
  });

  it('reports network failures with status 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    await expect(lookupProfessional('X')).rejects.toMatchObject({ status: 0 });
  });

  it('linkProfessional posts only the professionalId', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(assignment, 201));
    vi.stubGlobal('fetch', fetchMock);

    await linkProfessional(CHILD_ID, PRO_ID);

    const [url, init] = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0]!;
    expect(String(url)).toContain(`/children/${CHILD_ID}/professionals`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ professionalId: PRO_ID });
  });

  it('linkProfessional keeps the 403 status (consent or not legal representative)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'Forbidden', message: 'sin consentimiento' }, 403)),
    );
    await expect(linkProfessional(CHILD_ID, PRO_ID)).rejects.toMatchObject({
      status: 403,
      message: 'sin consentimiento',
    });
  });

  it('unlinkProfessional sends PATCH end with a date as endDate', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ...assignment, endDate: '2026-11-14' }));
    vi.stubGlobal('fetch', fetchMock);

    await unlinkProfessional(CHILD_ID, PRO_ID);

    const [url, init] = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0]!;
    expect(String(url)).toContain(`/children/${CHILD_ID}/professionals/${PRO_ID}/end`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body)).endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('professionalInitials uses first letters of name and last name', () => {
    expect(professionalInitials('laura', 'Pérez')).toBe('LP');
  });
});

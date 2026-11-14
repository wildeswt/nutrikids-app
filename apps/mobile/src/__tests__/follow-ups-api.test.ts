import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

import { FollowUpApiError, FollowUpOfflineError, createFollowUp } from '../lib/follow-ups-api.js';

const CHILD_ID = '11111111-1111-4111-8111-111111111111';
const input = {
  id: '33333333-3333-4333-8333-333333333333',
  type: 'recommendation' as const,
  details: 'Reforzar la variedad de alimentos.',
  nextCheckupDate: '2026-11-27',
};

const stored = {
  id: input.id,
  childId: CHILD_ID,
  alertId: null,
  professionalId: '44444444-4444-4444-8444-444444444444',
  type: 'recommendation',
  details: input.details,
  nextCheckupDate: '2026-11-27',
  reminder: {
    id: '55555555-5555-4555-8555-555555555555',
    childId: CHILD_ID,
    type: 'next_checkup',
    scheduledFor: '2026-11-27T13:00:00.000Z',
    status: 'pending',
  },
};

function stubFetch(body: unknown, status = 200) {
  const mock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('createFollowUp', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('posts the follow-up to the child and returns it with its reminder', async () => {
    const mock = stubFetch(stored, 201);

    const result = await createFollowUp(CHILD_ID, input);

    expect(mock.mock.calls[0]?.[0]).toContain(`/children/${CHILD_ID}/follow-ups`);
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(input);
    expect(result.reminder?.type).toBe('next_checkup');
  });

  it('accepts the resend of an existing follow-up (200)', async () => {
    stubFetch(stored, 200);
    await expect(createFollowUp(CHILD_ID, input)).resolves.toMatchObject({ id: input.id });
  });

  it('does not send an invalid body', async () => {
    const mock = stubFetch(stored);
    await expect(createFollowUp(CHILD_ID, { ...input, details: '' })).rejects.toThrow();
    expect(mock).not.toHaveBeenCalled();
  });

  it('throws the API message with its status when the server refuses it', async () => {
    stubFetch({ error: 'Bad Request', message: 'La fecha del próximo control es pasada' }, 400);

    const error = await createFollowUp(CHILD_ID, input).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(FollowUpApiError);
    expect(error).toMatchObject({ message: 'La fecha del próximo control es pasada', status: 400 });
  });

  it('falls back to a translated message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 502 })));
    await expect(createFollowUp(CHILD_ID, input)).rejects.toThrow(
      'No pudimos guardar el seguimiento. Intenta de nuevo.',
    );
  });

  it('reports no connection when the request never gets an answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network request failed')));
    await expect(createFollowUp(CHILD_ID, input)).rejects.toBeInstanceOf(FollowUpOfflineError);
  });
});

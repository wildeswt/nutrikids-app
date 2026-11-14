import { beforeEach, describe, expect, it, vi } from 'vitest';

const secure = vi.hoisted(() => ({ values: new Map<string, string>() }));

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async (key: string) => secure.values.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secure.values.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secure.values.delete(key);
  }),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

import {
  FOLLOW_UP_STORAGE_KEY,
  addPending,
  clearDraft,
  clearDrafts,
  draftKey,
  getDraft,
  listPending,
  removePending,
  saveDraft,
} from '../lib/follow-up-storage.js';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '99999999-9999-4999-8999-999999999999';
const CHILD = '22222222-2222-4222-8222-222222222222';
const ALERT = '33333333-3333-4333-8333-333333333333';

const form = {
  type: 'observation' as const,
  details: 'Se revisa el registro.',
  nextCheckupText: '25/11/2026',
  establish: true,
};

const pendingEntry = (id: string, userId = USER) => ({
  userId,
  childId: CHILD,
  alertId: ALERT,
  establish: true,
  input: { id, type: 'observation' as const, details: 'Detalle', alertId: ALERT },
});

describe('follow-up storage (NK-34)', () => {
  beforeEach(() => secure.values.clear());

  describe('drafts', () => {
    it('keys the draft by user and alert, or by child when there is no alert', () => {
      expect(draftKey(USER, { alertId: ALERT, childId: CHILD })).toBe(`${USER}:alert:${ALERT}`);
      expect(draftKey(USER, { childId: CHILD })).toBe(`${USER}:child:${CHILD}`);
    });

    it('saves and restores a draft, replacing the previous one', async () => {
      const key = draftKey(USER, { alertId: ALERT, childId: CHILD });
      expect(await getDraft(key)).toBeNull();

      await saveDraft(key, { userId: USER, childId: CHILD, alertId: ALERT, form });
      await saveDraft(key, {
        userId: USER,
        childId: CHILD,
        alertId: ALERT,
        form: { ...form, details: 'Otro texto' },
      });

      expect(await getDraft(key)).toMatchObject({
        userId: USER,
        alertId: ALERT,
        form: { ...form, details: 'Otro texto' },
      });
    });

    it('keeps the reason a follow-up was refused with its draft', async () => {
      const key = draftKey(USER, { childId: CHILD });
      await saveDraft(key, { userId: USER, childId: CHILD, form, lastError: 'Sin consentimiento' });
      expect((await getDraft(key))?.lastError).toBe('Sin consentimiento');
    });

    it('clears one draft or all of them', async () => {
      const a = draftKey(USER, { alertId: ALERT, childId: CHILD });
      const b = draftKey(USER, { childId: CHILD });
      await saveDraft(a, { userId: USER, childId: CHILD, alertId: ALERT, form });
      await saveDraft(b, { userId: USER, childId: CHILD, form });

      await clearDraft(a);
      expect(await getDraft(a)).toBeNull();
      expect(await getDraft(b)).not.toBeNull();

      await clearDrafts();
      expect(await getDraft(b)).toBeNull();
    });
  });

  describe('pending follow-ups', () => {
    const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    it('queues in order and lists only the ones of the user', async () => {
      await addPending(pendingEntry(A));
      await addPending(pendingEntry(B, OTHER_USER));

      expect((await listPending(USER)).map((e) => e.input.id)).toEqual([A]);
      expect((await listPending(OTHER_USER)).map((e) => e.input.id)).toEqual([B]);
    });

    it('does not repeat a follow-up queued twice with the same id', async () => {
      await addPending(pendingEntry(A));
      await addPending(pendingEntry(A));
      expect(await listPending(USER)).toHaveLength(1);
    });

    it('removes a sent follow-up', async () => {
      await addPending(pendingEntry(A));
      await addPending(pendingEntry(B));
      await removePending(A);
      expect((await listPending(USER)).map((e) => e.input.id)).toEqual([B]);
    });

    it('survives clearing the drafts (sign-out) so nothing waiting is lost', async () => {
      await addPending(pendingEntry(A));
      await saveDraft(draftKey(USER, { childId: CHILD }), { userId: USER, childId: CHILD, form });

      await clearDrafts();

      expect(await listPending(USER)).toHaveLength(1);
    });

    it('does not lose entries when several writes happen at once', async () => {
      const ids = Array.from({ length: 6 }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i}`);
      await Promise.all(ids.map((id) => addPending(pendingEntry(id))));
      expect((await listPending(USER)).map((e) => e.input.id).sort()).toEqual(ids);
    });
  });

  it('treats unreadable stored data as empty and recovers on the next write', async () => {
    secure.values.set(FOLLOW_UP_STORAGE_KEY, '{not json');
    expect(await listPending(USER)).toEqual([]);

    await addPending(pendingEntry('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
    expect(await listPending(USER)).toHaveLength(1);
  });

  it('treats data that does not match the schema as empty', async () => {
    secure.values.set(FOLLOW_UP_STORAGE_KEY, JSON.stringify({ drafts: 'x', pending: 3 }));
    expect(await listPending(USER)).toEqual([]);
  });
});

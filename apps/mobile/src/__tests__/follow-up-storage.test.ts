import { beforeEach, describe, expect, it, vi } from 'vitest';

const secure = vi.hoisted(() => ({ values: new Map<string, string>() }));

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => {
    throw new Error('SQLite unavailable');
  }),
  deleteDatabaseAsync: vi.fn(async () => {}),
}));

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
  type FollowUpPending,
} from '../lib/follow-up-storage.js';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '99999999-9999-4999-8999-999999999999';
const CHILD = '22222222-2222-4222-8222-222222222222';
const ALERT = '33333333-3333-4333-8333-333333333333';

const multiSectionForm = {
  observations: 'Se revisa el registro y percentiles.',
  intervention: 'Ajuste de porciones y meriendas.',
  referral: 'Derivación a pediatría.',
  nextCheckupText: '25/11/2026',
  establish: true,
};

const batchPendingEntry = (id: string, userId = USER): FollowUpPending => ({
  userId,
  childId: CHILD,
  alertId: ALERT,
  establish: true,
  queuedAt: '2026-11-14T19:00:00.000Z',
  input: {
    alertId: ALERT,
    items: [{ id, type: 'observation', details: 'Detalle de observación' }],
  },
});

describe('follow-up storage (NK-34, NK-75)', () => {
  beforeEach(() => secure.values.clear());

  describe('drafts', () => {
    it('keys the draft by user and alert, or by child when there is no alert', () => {
      expect(draftKey(USER, { alertId: ALERT, childId: CHILD })).toBe(`${USER}:alert:${ALERT}`);
      expect(draftKey(USER, { childId: CHILD })).toBe(`${USER}:child:${CHILD}`);
    });

    it('saves and restores a multi-section draft, replacing the previous one', async () => {
      const key = draftKey(USER, { alertId: ALERT, childId: CHILD });
      expect(await getDraft(key)).toBeNull();

      await saveDraft(key, {
        userId: USER,
        childId: CHILD,
        alertId: ALERT,
        form: multiSectionForm,
      });
      await saveDraft(key, {
        userId: USER,
        childId: CHILD,
        alertId: ALERT,
        form: { ...multiSectionForm, observations: 'Otro texto' },
      });

      expect(await getDraft(key)).toMatchObject({
        userId: USER,
        alertId: ALERT,
        form: { ...multiSectionForm, observations: 'Otro texto' },
      });
    });

    it('migrates legacy single-item drafts without losing data', async () => {
      const key = draftKey(USER, { alertId: ALERT, childId: CHILD });
      // Legacy stored draft structure from NK-34
      const legacyStorage = {
        drafts: {
          [key]: {
            userId: USER,
            childId: CHILD,
            alertId: ALERT,
            savedAt: '2026-11-14T10:00:00.000Z',
            form: {
              type: 'observation',
              details: 'Observación antigua guardada',
              nextCheckupText: '20/12/2026',
              establish: true,
            },
          },
        },
        pending: [],
      };
      secure.values.set(FOLLOW_UP_STORAGE_KEY, JSON.stringify(legacyStorage));

      const restored = await getDraft(key);
      expect(restored).not.toBeNull();
      expect(restored?.form.observations).toBe('Observación antigua guardada');
      expect(restored?.form.intervention).toBe('');
      expect(restored?.form.referral).toBe('');
      expect(restored?.form.nextCheckupText).toBe('20/12/2026');
      expect(restored?.form.establish).toBe(true);
    });

    it('migrates legacy recommendation draft to intervention section', async () => {
      const key = draftKey(USER, { alertId: ALERT, childId: CHILD });
      const legacyStorage = {
        drafts: {
          [key]: {
            userId: USER,
            childId: CHILD,
            alertId: ALERT,
            savedAt: '2026-11-14T10:00:00.000Z',
            form: {
              type: 'recommendation',
              details: 'Recomendación de hidratación',
              nextCheckupText: '',
              establish: false,
            },
          },
        },
        pending: [],
      };
      secure.values.set(FOLLOW_UP_STORAGE_KEY, JSON.stringify(legacyStorage));

      const restored = await getDraft(key);
      expect(restored?.form.intervention).toBe('Recomendación de hidratación');
      expect(restored?.form.establish).toBe(false);
    });

    it('keeps the reason a follow-up was refused with its draft', async () => {
      const key = draftKey(USER, { childId: CHILD });
      await saveDraft(key, {
        userId: USER,
        childId: CHILD,
        form: multiSectionForm,
        lastError: 'Sin consentimiento',
      });
      expect((await getDraft(key))?.lastError).toBe('Sin consentimiento');
    });

    it('clears one draft or all of them', async () => {
      const a = draftKey(USER, { alertId: ALERT, childId: CHILD });
      const b = draftKey(USER, { childId: CHILD });
      await saveDraft(a, { userId: USER, childId: CHILD, alertId: ALERT, form: multiSectionForm });
      await saveDraft(b, { userId: USER, childId: CHILD, form: multiSectionForm });

      await clearDraft(a);
      expect(await getDraft(a)).toBeNull();
      expect(await getDraft(b)).not.toBeNull();

      await clearDrafts();
      expect(await getDraft(b)).toBeNull();
    });
  });

  describe('pending follow-ups (NK-75 batch queue and migration)', () => {
    const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    it('queues batch items in order and lists only the ones of the user', async () => {
      await addPending(batchPendingEntry(A));
      await addPending(batchPendingEntry(B, OTHER_USER));

      const userPending = await listPending(USER);
      expect(userPending).toHaveLength(1);
      expect(userPending[0].input.items[0].id).toBe(A);

      const otherPending = await listPending(OTHER_USER);
      expect(otherPending).toHaveLength(1);
      expect(otherPending[0].input.items[0].id).toBe(B);
    });

    it('migrates legacy single-item pending queue entries without data loss', async () => {
      // Legacy storage entry with single item input
      const legacyStorage = {
        drafts: {},
        pending: [
          {
            userId: USER,
            childId: CHILD,
            alertId: ALERT,
            establish: true,
            queuedAt: '2026-11-14T08:00:00.000Z',
            input: {
              id: A,
              type: 'observation',
              details: 'Detalle pendiente sin conexión antiguo',
              alertId: ALERT,
              nextCheckupDate: '2026-11-28',
            },
          },
        ],
      };
      secure.values.set(FOLLOW_UP_STORAGE_KEY, JSON.stringify(legacyStorage));

      const pending = await listPending(USER);
      expect(pending).toHaveLength(1);
      expect(pending[0].input.items).toEqual([
        { id: A, type: 'observation', details: 'Detalle pendiente sin conexión antiguo' },
      ]);
      expect(pending[0].input.nextCheckupDate).toBe('2026-11-28');
      expect(pending[0].input.alertId).toBe(ALERT);
    });

    it('does not repeat a follow-up batch queued twice with the same id', async () => {
      await addPending(batchPendingEntry(A));
      await addPending(batchPendingEntry(A));
      expect(await listPending(USER)).toHaveLength(1);
    });

    it('removes a sent follow-up batch by item id', async () => {
      await addPending(batchPendingEntry(A));
      await addPending(batchPendingEntry(B));
      await removePending(A);
      const remaining = await listPending(USER);
      expect(remaining.map((e) => e.input.items[0].id)).toEqual([B]);
    });

    it('survives clearing the drafts (sign-out) so nothing waiting is lost', async () => {
      await addPending(batchPendingEntry(A));
      await saveDraft(draftKey(USER, { childId: CHILD }), {
        userId: USER,
        childId: CHILD,
        form: multiSectionForm,
      });

      await clearDrafts();

      expect(await listPending(USER)).toHaveLength(1);
    });

    it('does not lose entries when several writes happen at once', async () => {
      const ids = Array.from({ length: 6 }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i}`);
      await Promise.all(ids.map((id) => addPending(batchPendingEntry(id))));
      const list = await listPending(USER);
      expect(list.map((e) => e.input.items[0].id).sort()).toEqual(ids);
    });
  });

  it('treats unreadable stored data as empty and recovers on the next write', async () => {
    secure.values.set(FOLLOW_UP_STORAGE_KEY, '{not json');
    expect(await listPending(USER)).toEqual([]);

    await addPending(batchPendingEntry('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
    expect(await listPending(USER)).toHaveLength(1);
  });

  it('treats data that does not match the schema as empty', async () => {
    secure.values.set(FOLLOW_UP_STORAGE_KEY, JSON.stringify({ drafts: 'x', pending: 3 }));
    expect(await listPending(USER)).toEqual([]);
  });
});

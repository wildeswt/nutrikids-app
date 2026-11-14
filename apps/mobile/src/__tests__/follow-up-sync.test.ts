import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDetail } from './alerts-fixtures.js';

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

import type { CreateFollowUpBatchInput, FollowUpResponse } from '@nutrikids/shared';
import * as alertsApi from '../lib/alerts-api.js';
import * as followUpsApi from '../lib/follow-ups-api.js';
import { FollowUpApiError, FollowUpOfflineError } from '../lib/follow-ups-api.js';
import { draftKey, getDraft, listPending } from '../lib/follow-up-storage.js';
import { establishAlert, flushPendingFollowUps, submitFollowUp } from '../lib/follow-up-sync.js';

const USER = '11111111-1111-4111-8111-111111111111';
const CHILD = '22222222-2222-4222-8222-222222222222';
const ALERT = makeDetail().id;
const GROUP = '55555555-5555-4555-8555-555555555555';

const input: CreateFollowUpBatchInput = {
  groupId: GROUP,
  alertId: ALERT,
  nextCheckupDate: '2026-11-27',
  items: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      type: 'observation',
      details: 'Observación de percentiles de peso.',
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      type: 'intervention',
      details: 'Plan alimentario reforzado.',
    },
  ],
};

const submission = { userId: USER, childId: CHILD, alertId: ALERT, establish: true, input };

const followUps: FollowUpResponse[] = [
  {
    id: input.items[0].id,
    groupId: GROUP,
    childId: CHILD,
    alertId: ALERT,
    professionalId: '44444444-4444-4444-8444-444444444444',
    type: input.items[0].type,
    details: input.items[0].details,
    nextCheckupDate: input.nextCheckupDate ?? null,
    reminder: null,
  },
  {
    id: input.items[1].id,
    groupId: GROUP,
    childId: CHILD,
    alertId: ALERT,
    professionalId: '44444444-4444-4444-8444-444444444444',
    type: input.items[1].type,
    details: input.items[1].details,
    nextCheckupDate: null,
    reminder: null,
  },
];

describe('follow-up sync (NK-34, NK-75)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    secure.values.clear();
  });

  describe('establishAlert', () => {
    it('goes through REVIEWED when the alert still waits for review', async () => {
      vi.spyOn(alertsApi, 'fetchAlertDetail').mockResolvedValue(makeDetail());
      const update = vi
        .spyOn(alertsApi, 'updateAlertStatus')
        .mockResolvedValueOnce(makeDetail({ status: 'REVIEWED' }))
        .mockResolvedValueOnce(makeDetail({ status: 'FOLLOW_UP_ESTABLISHED' }));

      await expect(establishAlert(ALERT)).resolves.toBe('FOLLOW_UP_ESTABLISHED');

      expect(update.mock.calls.map((c) => c[1])).toEqual(['REVIEWED', 'FOLLOW_UP_ESTABLISHED']);
    });

    it('only moves the last step when it was already reviewed', async () => {
      vi.spyOn(alertsApi, 'fetchAlertDetail').mockResolvedValue(makeDetail({ status: 'REVIEWED' }));
      const update = vi
        .spyOn(alertsApi, 'updateAlertStatus')
        .mockResolvedValue(makeDetail({ status: 'FOLLOW_UP_ESTABLISHED' }));

      await establishAlert(ALERT);

      expect(update.mock.calls.map((c) => c[1])).toEqual(['FOLLOW_UP_ESTABLISHED']);
    });

    it('does nothing when the follow-up was already established', async () => {
      vi.spyOn(alertsApi, 'fetchAlertDetail').mockResolvedValue(
        makeDetail({ status: 'FOLLOW_UP_ESTABLISHED' }),
      );
      const update = vi.spyOn(alertsApi, 'updateAlertStatus');

      await expect(establishAlert(ALERT)).resolves.toBe('FOLLOW_UP_ESTABLISHED');
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('submitFollowUp (batch)', () => {
    it('sends the follow-up batch and moves the alert to «seguimiento establecido»', async () => {
      const create = vi.spyOn(followUpsApi, 'createFollowUpBatch').mockResolvedValue(followUps);
      vi.spyOn(alertsApi, 'fetchAlertDetail').mockResolvedValue(makeDetail({ status: 'REVIEWED' }));
      vi.spyOn(alertsApi, 'updateAlertStatus').mockResolvedValue(
        makeDetail({ status: 'FOLLOW_UP_ESTABLISHED' }),
      );

      const result = await submitFollowUp(submission);

      expect(create).toHaveBeenCalledWith(CHILD, input);
      expect(result).toEqual({ kind: 'sent', followUps, alertStatus: 'FOLLOW_UP_ESTABLISHED' });
      expect(await listPending(USER)).toEqual([]);
    });

    it('leaves the alert alone when establishing was not asked for', async () => {
      vi.spyOn(followUpsApi, 'createFollowUpBatch').mockResolvedValue(followUps);
      const fetchAlert = vi.spyOn(alertsApi, 'fetchAlertDetail');

      const result = await submitFollowUp({ ...submission, establish: false });

      expect(result).toEqual({ kind: 'sent', followUps, alertStatus: null });
      expect(fetchAlert).not.toHaveBeenCalled();
    });

    it('saves the follow-up batch on the phone when there is no connection', async () => {
      vi.spyOn(followUpsApi, 'createFollowUpBatch').mockRejectedValue(new FollowUpOfflineError());

      const result = await submitFollowUp(submission);

      expect(result).toEqual({ kind: 'queued' });
      const [queued] = await listPending(USER);
      expect(queued).toMatchObject({ childId: CHILD, alertId: ALERT, establish: true, input });
    });

    it('queues everything again when the connection drops while moving the alert', async () => {
      vi.spyOn(followUpsApi, 'createFollowUpBatch').mockResolvedValue(followUps);
      vi.spyOn(alertsApi, 'fetchAlertDetail').mockRejectedValue(
        new TypeError('Network request failed'),
      );

      await expect(submitFollowUp(submission)).resolves.toEqual({ kind: 'queued' });
      expect(await listPending(USER)).toHaveLength(1);
    });

    it('reports the follow-up batch as saved when only the alert could not be moved', async () => {
      vi.spyOn(followUpsApi, 'createFollowUpBatch').mockResolvedValue(followUps);
      vi.spyOn(alertsApi, 'fetchAlertDetail').mockResolvedValue(makeDetail({ status: 'REVIEWED' }));
      vi.spyOn(alertsApi, 'updateAlertStatus').mockRejectedValue(new Error('Cambio concurrente'));

      const result = await submitFollowUp(submission);

      expect(result).toEqual({
        kind: 'sent',
        followUps,
        alertStatus: null,
        alertError: 'Cambio concurrente',
      });
      expect(await listPending(USER)).toEqual([]);
    });

    it('throws when the server refuses the follow-up, without queuing it', async () => {
      vi.spyOn(followUpsApi, 'createFollowUpBatch').mockRejectedValue(
        new FollowUpApiError('Falta el consentimiento', 403),
      );

      await expect(submitFollowUp(submission)).rejects.toThrow('Falta el consentimiento');
      expect(await listPending(USER)).toEqual([]);
    });
  });

  describe('flushPendingFollowUps', () => {
    const queue = async (id: string) => {
      vi.spyOn(followUpsApi, 'createFollowUpBatch').mockRejectedValueOnce(
        new FollowUpOfflineError(),
      );
      await submitFollowUp({
        ...submission,
        input: {
          ...input,
          groupId: id,
          items: [{ id, type: 'observation', details: 'Detalle pendiente' }],
        },
      });
    };
    const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    it('sends what was waiting once there is connection', async () => {
      await queue(A);
      await queue(B);
      const create = vi.spyOn(followUpsApi, 'createFollowUpBatch').mockResolvedValue(followUps);
      create.mockClear();
      vi.spyOn(alertsApi, 'fetchAlertDetail').mockResolvedValue(
        makeDetail({ status: 'FOLLOW_UP_ESTABLISHED' }),
      );

      const result = await flushPendingFollowUps(USER);

      expect(result).toEqual({ sent: 2, remaining: 0, rejected: 0 });
      expect(create.mock.calls.map((c) => c[1].items[0].id)).toEqual([A, B]);
      expect(await listPending(USER)).toEqual([]);
    });

    it('keeps them, and stops, while there is still no connection', async () => {
      await queue(A);
      await queue(B);
      const create = vi
        .spyOn(followUpsApi, 'createFollowUpBatch')
        .mockRejectedValue(new FollowUpOfflineError());
      create.mockClear();

      const result = await flushPendingFollowUps(USER);

      expect(result).toEqual({ sent: 0, remaining: 2, rejected: 0 });
      expect(create).toHaveBeenCalledTimes(1);
      expect(await listPending(USER)).toHaveLength(2);
    });

    it('turns a follow-up batch the server refuses into a draft with the reason', async () => {
      await queue(A);
      vi.spyOn(followUpsApi, 'createFollowUpBatch').mockRejectedValue(
        new FollowUpApiError('La fecha del próximo control es pasada', 400),
      );

      const result = await flushPendingFollowUps(USER);

      expect(result).toEqual({ sent: 0, remaining: 0, rejected: 1 });
      expect(await listPending(USER)).toEqual([]);
      const draft = await getDraft(draftKey(USER, { alertId: ALERT, childId: CHILD }));
      expect(draft).toMatchObject({
        lastError: 'La fecha del próximo control es pasada',
        form: {
          observations: 'Detalle pendiente',
          intervention: '',
          referral: '',
          nextCheckupText: '27/11/2026',
        },
      });
    });

    it('keeps the follow-up on a server error that may pass (5xx)', async () => {
      await queue(A);
      vi.spyOn(followUpsApi, 'createFollowUpBatch').mockRejectedValue(
        new FollowUpApiError('Error', 503),
      );

      const result = await flushPendingFollowUps(USER);

      expect(result).toEqual({ sent: 0, remaining: 1, rejected: 0 });
    });

    it('does nothing when nothing is waiting', async () => {
      const create = vi.spyOn(followUpsApi, 'createFollowUpBatch');
      await expect(flushPendingFollowUps(USER)).resolves.toEqual({
        sent: 0,
        remaining: 0,
        rejected: 0,
      });
      expect(create).not.toHaveBeenCalled();
    });
  });
});

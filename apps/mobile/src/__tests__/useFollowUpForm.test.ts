import type * as ReactTypes from 'react';
import type * as StorageTypes from '../lib/follow-up-storage.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHILD_ID, makeDetail } from './alerts-fixtures.js';

// Minimal hook runtime so the hook can run outside a renderer and its state can be inspected
// (the repo has no react-test-renderer / DOM environment).
const runtime = vi.hoisted(() => ({
  slots: [] as unknown[],
  refs: [] as { current: unknown }[],
  index: 0,
  refIndex: 0,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactTypes>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const slot = runtime.index++;
      if (!(slot in runtime.slots)) runtime.slots[slot] = initial;
      const set = (value: unknown) => {
        runtime.slots[slot] =
          typeof value === 'function'
            ? (value as (prev: unknown) => unknown)(runtime.slots[slot])
            : value;
      };
      return [runtime.slots[slot], set];
    },
    useRef: (initial: unknown) => {
      const slot = runtime.refIndex++;
      runtime.refs[slot] ??= { current: initial };
      return runtime.refs[slot];
    },
    useCallback: (fn: unknown) => fn,
  };
});

const mocks = vi.hoisted(() => ({
  fetchAlertDetail: vi.fn(),
  fetchChild: vi.fn(),
  getDraft: vi.fn(),
  saveDraft: vi.fn(async () => {}),
  clearDraft: vi.fn(async () => {}),
  listPending: vi.fn(async () => [] as StorageTypes.PendingFollowUp[]),
  getLatestRejectedFollowUp: vi.fn(async () => null as StorageTypes.RejectedFollowUpEntry | null),
  clearRejectedFollowUp: vi.fn(async () => {}),
  submitFollowUp: vi.fn(),
}));

vi.mock('../context/auth-context.js', () => ({
  useAuth: () => ({ user: { id: '99999999-9999-4999-8999-999999999999' } }),
}));
vi.mock('../context/connection-context.js', () => ({
  useConnection: () => ({ status: 'online', isOnline: true }),
}));
vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));
vi.mock('../lib/alerts-api.js', () => ({ fetchAlertDetail: mocks.fetchAlertDetail }));
vi.mock('../lib/children-api.js', () => ({ fetchChild: mocks.fetchChild }));
vi.mock('../lib/follow-up-storage.js', async (importOriginal) => ({
  ...(await importOriginal<typeof StorageTypes>()),
  getDraft: mocks.getDraft,
  saveDraft: mocks.saveDraft,
  clearDraft: mocks.clearDraft,
  listPending: mocks.listPending,
  getLatestRejectedFollowUp: mocks.getLatestRejectedFollowUp,
  clearRejectedFollowUp: mocks.clearRejectedFollowUp,
}));
vi.mock('../lib/follow-up-sync.js', () => ({
  submitFollowUp: mocks.submitFollowUp,
}));

import { useFollowUpForm } from '../hooks/useFollowUpForm.js';

const USER = '99999999-9999-4999-8999-999999999999';
const ALERT = makeDetail().id;
const mateo = {
  id: CHILD_ID,
  firstName: 'Mateo',
  lastName: 'Gómez',
  birthDate: '2023-06-15',
  sex: 'MALE' as const,
};

interface Params {
  alertId?: string | undefined;
  childId?: string | undefined;
}

/** Re-runs the hook against the persisted fake state, like a re-render would. */
function render(params: Params = { alertId: ALERT, childId: CHILD_ID }) {
  runtime.index = 0;
  runtime.refIndex = 0;
  return useFollowUpForm(params);
}

/** Opens the form and fills it with a valid follow-up. */
async function openAndFill(params?: Params) {
  await render(params).load();
  render(params).setForm({ observations: 'Reforzar la variedad.' });
  return render(params);
}

describe('useFollowUpForm (NK-34, NK-75)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtime.slots.length = 0;
    runtime.refs.length = 0;
    mocks.fetchAlertDetail.mockResolvedValue(makeDetail());
    mocks.fetchChild.mockResolvedValue(mateo);
    mocks.getDraft.mockResolvedValue(null);
    mocks.listPending.mockResolvedValue([]);
    mocks.getLatestRejectedFollowUp.mockResolvedValue(null);
    mocks.clearRejectedFollowUp.mockResolvedValue(undefined);
    mocks.submitFollowUp.mockResolvedValue({ kind: 'queued' });
  });

  describe('opening', () => {
    it('starts loading, with «establecer» on when there is an alert', () => {
      const hook = render();
      expect(hook.loading).toBe(true);
      expect(hook.form).toEqual({
        observations: '',
        intervention: '',
        referral: '',
        nextCheckupText: '',
        establish: true,
      });
    });

    it('loads the child and the status of the alert', async () => {
      await render().load();
      const hook = render();

      expect(hook.loading).toBe(false);
      expect(hook.child).toEqual(mateo);
      expect(hook.alertStatus).toBe('PENDING_REVIEW');
      expect(hook.canEstablish).toBe(true);
      expect(hook.offline).toBe(false);
      expect(hook.fatalError).toBeNull();
    });

    it('takes the child from the alert when only the alert is given', async () => {
      await render({ alertId: ALERT }).load();
      expect(mocks.fetchChild).toHaveBeenCalledWith(CHILD_ID);
    });

    it('does not offer «establecer» once the follow-up was established or without an alert', async () => {
      mocks.fetchAlertDetail.mockResolvedValue(makeDetail({ status: 'FOLLOW_UP_ESTABLISHED' }));
      await render().load();
      expect(render().canEstablish).toBe(false);

      runtime.slots.length = 0;
      await render({ childId: CHILD_ID }).load();
      expect(render({ childId: CHILD_ID }).canEstablish).toBe(false);
    });

    it('fails when there is neither an alert nor a child to attach it to', async () => {
      await render({}).load();
      const hook = render({});
      expect(hook.fatalError).toBe('Abre el seguimiento desde el detalle de una alerta.');
      expect(hook.loading).toBe(false);
    });

    it('fails with the API message when the alert is refused and there is no child', async () => {
      mocks.fetchAlertDetail.mockRejectedValue(new Error('Alerta no encontrada'));
      await render({ alertId: ALERT }).load();
      expect(render({ alertId: ALERT }).fatalError).toBe('Alerta no encontrada');
    });

    it('still opens, offline, when the alert and the child cannot be reached', async () => {
      mocks.fetchAlertDetail.mockRejectedValue(new TypeError('Network request failed'));
      mocks.fetchChild.mockRejectedValue(new TypeError('Network request failed'));

      await render().load();
      const hook = render();

      expect(hook.fatalError).toBeNull();
      expect(hook.offline).toBe(true);
      expect(hook.child).toBeNull();
      expect(hook.canEstablish).toBe(true);
    });

    it('shows the offline notice while follow-ups are still waiting on the phone', async () => {
      mocks.listPending.mockResolvedValue([
        {
          userId: USER,
          childId: CHILD_ID,
          alertId: ALERT,
          establish: true,
          queuedAt: '2026-11-14T19:00:00.000Z',
          input: {
            alertId: ALERT,
            items: [
              {
                id: '44444444-4444-4444-8444-444444444444',
                type: 'observation',
                details: 'Observación pendiente',
              },
            ],
          },
        },
      ]);
      await render().load();
      expect(render().offline).toBe(true);
    });

    it('restores a rejected follow-up from the sync queue when there is no saved draft', async () => {
      mocks.getDraft.mockResolvedValue(null);
      mocks.getLatestRejectedFollowUp.mockResolvedValue({
        queueId: '55555555-5555-4555-8555-555555555555',
        userId: USER,
        childId: CHILD_ID,
        alertId: ALERT,
        savedAt: '2026-11-14T19:05:00.000Z',
        form: {
          observations: '',
          intervention: '',
          referral: 'Derivar a pediatría',
          nextCheckupText: '',
          establish: false,
        },
        lastError: 'Sin consentimiento vigente',
      });

      await render().load();
      const hook = render();

      expect(hook.form.referral).toBe('Derivar a pediatría');
      expect(hook.notice).toBe('draftRestored');
      expect(hook.rejectedReason).toBe('Sin consentimiento vigente');
    });

    it('restores the saved draft and the reason the server refused it', async () => {
      mocks.getDraft.mockResolvedValue({
        form: {
          observations: '',
          intervention: '',
          referral: 'Derivar a nutrición',
          nextCheckupText: '',
          establish: false,
        },
        lastError: 'Sin consentimiento',
      });

      await render().load();
      const hook = render();

      expect(mocks.getDraft).toHaveBeenCalledWith(`${USER}:alert:${ALERT}`);
      expect(hook.form.referral).toBe('Derivar a nutrición');
      expect(hook.notice).toBe('draftRestored');
      expect(hook.rejectedReason).toBe('Sin consentimiento');
    });
  });

  describe('saving', () => {
    it('does not send an invalid form and says what is wrong', async () => {
      await render().load();
      const outcome = await render().save();

      expect(outcome).toBeNull();
      expect(render().formError).toEqual({ code: 'atLeastOneRequired' });
      expect(mocks.submitFollowUp).not.toHaveBeenCalled();
    });

    it('sends the follow-up with the alert and asks to establish it', async () => {
      mocks.submitFollowUp.mockResolvedValue({
        kind: 'sent',
        followUps: [],
        alertStatus: 'FOLLOW_UP_ESTABLISHED',
      });
      const hook = await openAndFill();

      const outcome = await hook.save();

      expect(outcome).toBe('sent');
      expect(mocks.submitFollowUp).toHaveBeenCalledWith({
        userId: USER,
        childId: CHILD_ID,
        alertId: ALERT,
        establish: true,
        input: expect.objectContaining({
          alertId: ALERT,
          items: expect.arrayContaining([
            expect.objectContaining({
              type: 'observation',
              details: 'Reforzar la variedad.',
            }),
          ]),
        }),
      });
      expect(mocks.clearDraft).toHaveBeenCalledWith(`${USER}:alert:${ALERT}`);
      expect(render().saving).toBe(false);
    });

    it('does not ask to establish when the professional unchecks it', async () => {
      mocks.submitFollowUp.mockResolvedValue({ kind: 'sent', followUps: [], alertStatus: null });
      await openAndFill();
      render().setForm({ establish: false });

      await render().save();

      expect(mocks.submitFollowUp).toHaveBeenCalledWith(
        expect.objectContaining({ establish: false }),
      );
    });

    it('reports it as queued, with the offline notice, when there is no connection', async () => {
      const hook = await openAndFill();

      const outcome = await hook.save();

      expect(outcome).toBe('queued');
      expect(render().offline).toBe(true);
    });

    it('keeps the form and explains when the alert could not be moved', async () => {
      mocks.submitFollowUp.mockResolvedValue({
        kind: 'sent',
        followUps: [],
        alertStatus: null,
        alertError: 'Cambio concurrente',
      });
      const hook = await openAndFill();

      expect(await hook.save()).toBe('sentAlertNotMoved');
      expect(render().alertNotMoved).toBe('Cambio concurrente');
    });

    it('shows the server message when it refuses the follow-up and can be retried', async () => {
      mocks.submitFollowUp.mockRejectedValueOnce(new Error('Falta el consentimiento'));
      const hook = await openAndFill();

      expect(await hook.save()).toBeNull();
      expect(render().apiError).toBe('Falta el consentimiento');
      expect(render().saving).toBe(false);
    });

    it('keeps the same follow-up id across retries and renews it after saving', async () => {
      mocks.submitFollowUp.mockRejectedValueOnce(new Error('Falla temporal'));
      mocks.submitFollowUp.mockResolvedValueOnce({
        kind: 'sent',
        followUps: [],
        alertStatus: null,
      });
      mocks.submitFollowUp.mockResolvedValueOnce({
        kind: 'sent',
        followUps: [],
        alertStatus: null,
      });
      const hook = await openAndFill();

      await hook.save();
      await render().save();
      await render().save();

      const ids = mocks.submitFollowUp.mock.calls.map((call) => call[0].input.items[0].id);
      expect(ids[0]).toBe(ids[1]);
      expect(ids[2]).not.toBe(ids[1]);
    });
  });

  describe('draft', () => {
    it('saves the form as a draft and says so', async () => {
      const hook = await openAndFill();

      await hook.saveAsDraft();

      expect(mocks.saveDraft).toHaveBeenCalledWith(`${USER}:alert:${ALERT}`, {
        userId: USER,
        childId: CHILD_ID,
        alertId: ALERT,
        form: expect.objectContaining({ observations: 'Reforzar la variedad.' }),
      });
      expect(render().notice).toBe('draftSaved');
    });

    it('does not save an empty form as a draft', async () => {
      await render().load();
      await render().saveAsDraft();
      expect(mocks.saveDraft).not.toHaveBeenCalled();
    });

    it('drops the draft notice when the form is edited', async () => {
      const hook = await openAndFill();
      await hook.saveAsDraft();

      render().setForm({ observations: 'Otro texto' });

      expect(render().notice).toBeNull();
    });
  });
});

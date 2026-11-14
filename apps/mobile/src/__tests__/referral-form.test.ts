import { MESSAGE_BODY_MAX_LENGTH, type ProfessionalAssignmentResponse } from '@nutrikids/shared';
import * as FileSystem from 'expo-file-system';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_REFERRAL_FORM,
  PRIORITY_PREFIX,
  buildCreateReferralInput,
  clearReferralDraft,
  composeReferralBody,
  filterEligibleRecipients,
  loadReferralDraft,
  maxReasonLength,
  saveReferralDraft,
  type ReferralFormData,
} from '../lib/referral-form.js';

const ID = '11111111-1111-4111-8111-111111111111';
const CHILD_ID = '22222222-2222-4222-8222-222222222222';
const RECIPIENT_ID = '33333333-3333-4333-8333-333333333333';
const CURRENT_USER_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_USER_ID = '55555555-5555-4555-8555-555555555555';

const validForm: ReferralFormData = {
  childId: CHILD_ID,
  recipientId: RECIPIENT_ID,
  priority: 'ordinary',
  reason: '  Solicito valoración pediátrica complementaria.  ',
};

function makeAssignment(
  overrides: Partial<ProfessionalAssignmentResponse> = {},
): ProfessionalAssignmentResponse {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    childId: CHILD_ID,
    professionalId: RECIPIENT_ID,
    specialty: 'pediatrics',
    firstName: 'Carlos',
    lastName: 'Medina',
    startDate: '2026-10-01',
    endDate: null,
    ...overrides,
  };
}

describe('referral-form', () => {
  describe('composeReferralBody and maxReasonLength', () => {
    it('trims the reason and adds no prefix for ordinary priority', () => {
      expect(composeReferralBody('  Control nutricional  ', 'ordinary')).toBe(
        'Control nutricional',
      );
      expect(maxReasonLength('ordinary')).toBe(MESSAGE_BODY_MAX_LENGTH);
    });

    it('prepends [Prioritaria] when priority is priority and counts it against the 2000 limit', () => {
      expect(composeReferralBody('  Evaluación urgente  ', 'priority')).toBe(
        `${PRIORITY_PREFIX}Evaluación urgente`,
      );
      expect(maxReasonLength('priority')).toBe(MESSAGE_BODY_MAX_LENGTH - PRIORITY_PREFIX.length);
    });

    it('returns empty string when reason is blank even if priority is priority', () => {
      expect(composeReferralBody('   ', 'priority')).toBe('');
    });
  });

  describe('buildCreateReferralInput', () => {
    it('builds payload without prefix for ordinary referrals', () => {
      const result = buildCreateReferralInput(validForm, { id: ID });
      expect(result).toEqual({
        ok: true,
        input: {
          id: ID,
          childId: CHILD_ID,
          recipientId: RECIPIENT_ID,
          body: 'Solicito valoración pediátrica complementaria.',
        },
      });
    });

    it('builds payload with [Prioritaria] prefix for priority referrals', () => {
      const result = buildCreateReferralInput({ ...validForm, priority: 'priority' }, { id: ID });
      expect(result).toEqual({
        ok: true,
        input: {
          id: ID,
          childId: CHILD_ID,
          recipientId: RECIPIENT_ID,
          body: `${PRIORITY_PREFIX}Solicito valoración pediátrica complementaria.`,
        },
      });
    });

    it('allows exactly 2000 chars for ordinary and rejects 2001 chars', () => {
      const atLimit = buildCreateReferralInput(
        { ...validForm, priority: 'ordinary', reason: 'a'.repeat(MESSAGE_BODY_MAX_LENGTH) },
        { id: ID },
      );
      expect(atLimit.ok).toBe(true);

      const overLimit = buildCreateReferralInput(
        { ...validForm, priority: 'ordinary', reason: 'a'.repeat(MESSAGE_BODY_MAX_LENGTH + 1) },
        { id: ID },
      );
      expect(overLimit).toEqual({
        ok: false,
        error: { code: 'bodyTooLong', max: MESSAGE_BODY_MAX_LENGTH },
      });
    });

    it('counts the [Prioritaria] prefix inside the 2000-character limit', () => {
      const maxForPriority = maxReasonLength('priority');
      const atLimit = buildCreateReferralInput(
        { ...validForm, priority: 'priority', reason: 'a'.repeat(maxForPriority) },
        { id: ID },
      );
      expect(atLimit.ok).toBe(true);
      if (atLimit.ok) {
        expect(atLimit.input.body).toHaveLength(MESSAGE_BODY_MAX_LENGTH);
      }

      const overLimit = buildCreateReferralInput(
        { ...validForm, priority: 'priority', reason: 'a'.repeat(maxForPriority + 1) },
        { id: ID },
      );
      expect(overLimit).toEqual({
        ok: false,
        error: { code: 'bodyTooLong', max: MESSAGE_BODY_MAX_LENGTH },
      });
    });

    it.each([
      [{ childId: null }, { code: 'childRequired' }],
      [{ recipientId: null }, { code: 'recipientRequired' }],
      [{ reason: '   ' }, { code: 'bodyRequired' }],
    ] as [Partial<ReferralFormData>, unknown][])('rejects %o', (changes, error) => {
      expect(buildCreateReferralInput({ ...validForm, ...changes }, { id: ID })).toEqual({
        ok: false,
        error,
      });
    });

    it('rejects non-UUID id', () => {
      expect(buildCreateReferralInput(validForm, { id: 'not-a-uuid' })).toEqual({
        ok: false,
        error: { code: 'invalid' },
      });
    });
  });

  describe('filterEligibleRecipients', () => {
    const today = '2026-11-14';

    it('keeps only active assignments today and excludes the current user', () => {
      const list: ProfessionalAssignmentResponse[] = [
        // Current user (excluded)
        makeAssignment({ id: 'a1', professionalId: CURRENT_USER_ID }),
        // Ended yesterday (excluded)
        makeAssignment({
          id: 'a2',
          professionalId: '66666666-6666-4666-8666-666666666666',
          endDate: '2026-11-13',
        }),
        // Starts tomorrow (excluded)
        makeAssignment({
          id: 'a3',
          professionalId: '77777777-7777-4777-8777-777777777777',
          startDate: '2026-11-15',
        }),
        // Active with null endDate (included)
        makeAssignment({ id: 'a4', professionalId: RECIPIENT_ID }),
        // Duplicate of RECIPIENT_ID (deduplicated)
        makeAssignment({ id: 'a5', professionalId: RECIPIENT_ID }),
        // Ends today (included)
        makeAssignment({
          id: 'a6',
          professionalId: '88888888-8888-4888-8888-888888888888',
          startDate: '2026-11-14',
          endDate: '2026-11-14',
        }),
      ];

      const eligible = filterEligibleRecipients(list, CURRENT_USER_ID, today);

      expect(eligible.map((item) => item.id)).toEqual(['a4', 'a6']);
    });
  });

  describe('local JSON draft storage (expo-file-system)', () => {
    const files = (FileSystem as unknown as { __files: Map<string, string> }).__files;

    beforeEach(() => {
      files.clear();
    });

    it('saves, loads and clears a draft scoped per user', async () => {
      expect(await loadReferralDraft(CURRENT_USER_ID)).toBeNull();

      await saveReferralDraft(CURRENT_USER_ID, {
        ...validForm,
        priority: 'priority',
        reason: 'Valoración por bajo peso',
      });
      await saveReferralDraft(OTHER_USER_ID, {
        ...EMPTY_REFERRAL_FORM,
        reason: 'Otro usuario',
      });

      const loaded = await loadReferralDraft(CURRENT_USER_ID);
      expect(loaded).toMatchObject({
        childId: CHILD_ID,
        recipientId: RECIPIENT_ID,
        priority: 'priority',
        body: 'Valoración por bajo peso',
      });
      expect((await loadReferralDraft(OTHER_USER_ID))?.body).toBe('Otro usuario');

      await clearReferralDraft(CURRENT_USER_ID);
      expect(await loadReferralDraft(CURRENT_USER_ID)).toBeNull();
      expect((await loadReferralDraft(OTHER_USER_ID))?.body).toBe('Otro usuario');
    });

    it('returns null when the stored JSON is invalid', async () => {
      files.set(`file:///documents/referral-draft-${CURRENT_USER_ID}.json`, '{broken');
      expect(await loadReferralDraft(CURRENT_USER_ID)).toBeNull();
    });
  });
});

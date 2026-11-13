import { describe, expect, it } from 'vitest';
import {
  ALERT_TRANSITIONS,
  AlertStatusSchema,
  ListAlertsQuerySchema,
  UpdateAlertStatusInputSchema,
  canProfessionalTransition,
  canTransition,
  type AlertStatus,
} from '../index.js';

const STATUSES = AlertStatusSchema.options;

const VALID: ReadonlyArray<[AlertStatus, AlertStatus]> = [
  ['GENERATED', 'PENDING_REVIEW'],
  ['PENDING_REVIEW', 'REVIEWED'],
  ['REVIEWED', 'FOLLOW_UP_ESTABLISHED'],
];

describe('máquina de estados de alertas', () => {
  it('define transiciones para los cuatro estados', () => {
    expect(Object.keys(ALERT_TRANSITIONS).sort()).toEqual([...STATUSES].sort());
  });

  const all = STATUSES.flatMap((from) => STATUSES.map((to) => [from, to] as const));

  it.each(all)('%s → %s', (from, to) => {
    const expected = VALID.some(([f, t]) => f === from && t === to);
    expect(canTransition(from, to)).toBe(expected);
  });

  it('FOLLOW_UP_ESTABLISHED es final y ningún estado vuelve a GENERATED', () => {
    expect(ALERT_TRANSITIONS.FOLLOW_UP_ESTABLISHED).toEqual([]);
    for (const from of STATUSES) expect(canTransition(from, 'GENERATED')).toBe(false);
  });

  it('GENERATED → PENDING_REVIEW la hace el sistema; el profesional solo revisa y da seguimiento', () => {
    const manual = all.filter(([from, to]) => canProfessionalTransition(from, to));
    expect(manual).toEqual([
      ['PENDING_REVIEW', 'REVIEWED'],
      ['REVIEWED', 'FOLLOW_UP_ESTABLISHED'],
    ]);
  });
});

describe('esquemas de alertas', () => {
  it('UpdateAlertStatusInput acepta un estado válido y rechaza otros campos', () => {
    expect(UpdateAlertStatusInputSchema.safeParse({ status: 'REVIEWED' }).success).toBe(true);
    expect(UpdateAlertStatusInputSchema.safeParse({ status: 'CLOSED' }).success).toBe(false);
    expect(
      UpdateAlertStatusInputSchema.safeParse({ status: 'REVIEWED', changedById: 'x' }).success,
    ).toBe(false);
  });

  it('ListAlertsQuery acepta estados separados por coma o repetidos', () => {
    expect(ListAlertsQuerySchema.parse({ status: 'GENERATED,PENDING_REVIEW' }).status).toEqual([
      'GENERATED',
      'PENDING_REVIEW',
    ]);
    expect(ListAlertsQuerySchema.parse({ status: ['REVIEWED', 'GENERATED'] }).status).toEqual([
      'REVIEWED',
      'GENERATED',
    ]);
    expect(ListAlertsQuerySchema.parse({}).status).toBeUndefined();
    expect(ListAlertsQuerySchema.safeParse({ status: 'CLOSED' }).success).toBe(false);
    expect(ListAlertsQuerySchema.safeParse({ childId: 'no-uuid' }).success).toBe(false);
  });
});

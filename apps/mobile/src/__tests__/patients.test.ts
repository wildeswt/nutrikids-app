import type { AlertResponse, ChildResponse } from '@nutrikids/shared';
import { describe, expect, it } from 'vitest';
import {
  buildPatientList,
  compareAlertSeverity,
  filterPatients,
  groupPatientsByRisk,
  normalizeSearchText,
  paginatePatients,
  type PatientListItem,
} from '../lib/patients.js';

function makeChild(id: string, firstName: string, lastName: string): ChildResponse {
  return {
    id,
    firstName,
    lastName,
    birthDate: '2023-01-15',
    sex: 'MALE',
  };
}

function makeAlert(
  id: string,
  childId: string,
  overrides: Partial<AlertResponse> = {},
): AlertResponse {
  return {
    id,
    childId,
    checkupId: 'checkup-1',
    indicatorResultId: 'result-1',
    indicator: 'WEIGHT_FOR_AGE',
    zScore: -2.4,
    classification: 'UNDERWEIGHT',
    riskType: 'UNDERWEIGHT',
    isSevere: false,
    reason: 'Bajo peso para la edad',
    status: 'GENERATED',
    createdAt: '2026-03-01T10:00:00.000Z',
    reviewDueAt: '2026-03-04T10:00:00.000Z',
    isOverdue: false,
    checkupIsCurrent: true,
    ...overrides,
  };
}

describe('patients logic (Block 2)', () => {
  describe('normalizeSearchText', () => {
    it('normalizes accents and whitespace to lowercase', () => {
      expect(normalizeSearchText('  Ángel José  ')).toBe('angel jose');
      expect(normalizeSearchText('Sofía')).toBe('sofia');
    });
  });

  describe('compareAlertSeverity', () => {
    it('ranks isSevere above non-severe', () => {
      const severe = makeAlert('1', 'c1', { isSevere: true });
      const nonSevere = makeAlert('2', 'c1', { isSevere: false });
      expect(compareAlertSeverity(severe, nonSevere)).toBeLessThan(0);
      expect(compareAlertSeverity(nonSevere, severe)).toBeGreaterThan(0);
    });

    it('ranks isOverdue above non-overdue within same severity', () => {
      const overdue = makeAlert('1', 'c1', { isSevere: true, isOverdue: true });
      const notOverdue = makeAlert('2', 'c1', { isSevere: true, isOverdue: false });
      expect(compareAlertSeverity(overdue, notOverdue)).toBeLessThan(0);
    });

    it('ranks newer createdAt above older when severity and overdue match', () => {
      const newer = makeAlert('1', 'c1', { createdAt: '2026-03-05T00:00:00.000Z' });
      const older = makeAlert('2', 'c1', { createdAt: '2026-03-01T00:00:00.000Z' });
      expect(compareAlertSeverity(newer, older)).toBeLessThan(0);
    });
  });

  describe('buildPatientList', () => {
    const childSevere = makeChild('c-sev', 'Mateo', 'García');
    const childRisk = makeChild('c-risk', 'Lucas', 'Pérez');
    const childNoAlerts = makeChild('c-none', 'Ana', 'Álvarez');

    it('classifies children and orders SEVERE -> RISK -> NO_ALERTS', () => {
      const alerts = [
        makeAlert('a1', childRisk.id, { isSevere: false }),
        makeAlert('a2', childSevere.id, { isSevere: true }),
      ];

      const list = buildPatientList([childNoAlerts, childRisk, childSevere], alerts);

      expect(list.map((p) => p.child.id)).toEqual([childSevere.id, childRisk.id, childNoAlerts.id]);
      expect(list[0]?.riskLevel).toBe('SEVERE');
      expect(list[1]?.riskLevel).toBe('RISK');
      expect(list[2]?.riskLevel).toBe('NO_ALERTS');
      expect(list[0]?.openAlertCount).toBe(1);
      expect(list[2]?.openAlertCount).toBe(0);
      expect(list[2]?.primaryAlert).toBeNull();
    });

    it('selects the most critical open alert when a child has multiple alerts', () => {
      const alertMild = makeAlert('a-mild', 'c1', {
        isSevere: false,
        createdAt: '2026-03-01T00:00:00.000Z',
      });
      const alertSevere = makeAlert('a-sev', 'c1', {
        isSevere: true,
        createdAt: '2026-03-02T00:00:00.000Z',
      });
      const child = makeChild('c1', 'Juan', 'Pérez');

      const list = buildPatientList([child], [alertMild, alertSevere]);
      expect(list[0]?.riskLevel).toBe('SEVERE');
      expect(list[0]?.primaryAlert?.id).toBe(alertSevere.id);
      expect(list[0]?.openAlertCount).toBe(2);
    });

    it('breaks ties within same risk category alphabetically by name', () => {
      const c1 = makeChild('c1', 'Zoe', 'Zapata');
      const c2 = makeChild('c2', 'Bernardo', 'Alvarado');
      const list = buildPatientList([c1, c2], []);

      expect(list.map((p) => p.child.id)).toEqual(['c2', 'c1']);
    });
  });

  describe('filterPatients', () => {
    const pSevere: PatientListItem = {
      child: makeChild('1', 'Mateo', 'García'),
      riskLevel: 'SEVERE',
      primaryAlert: makeAlert('a1', '1', { isSevere: true }),
      openAlertCount: 1,
    };
    const pRisk: PatientListItem = {
      child: makeChild('2', 'Lucía', 'Gómez'),
      riskLevel: 'RISK',
      primaryAlert: makeAlert('a2', '2', { isSevere: false }),
      openAlertCount: 1,
    };
    const pNone: PatientListItem = {
      child: makeChild('3', 'Carlos', 'Zambrano'),
      riskLevel: 'NO_ALERTS',
      primaryAlert: null,
      openAlertCount: 0,
    };
    const items = [pSevere, pRisk, pNone];

    it('filters by risk chip', () => {
      expect(filterPatients(items, { filter: 'ALL' })).toHaveLength(3);
      expect(filterPatients(items, { filter: 'SEVERE' })).toEqual([pSevere]);
      expect(filterPatients(items, { filter: 'RISK' })).toEqual([pRisk]);
      expect(filterPatients(items, { filter: 'NO_ALERTS' })).toEqual([pNone]);
    });

    it('filters by accent-insensitive search query', () => {
      expect(filterPatients(items, { filter: 'ALL', query: 'lucia' })).toEqual([pRisk]);
      expect(filterPatients(items, { filter: 'ALL', query: 'garcia' })).toEqual([pSevere]);
      expect(filterPatients(items, { filter: 'ALL', query: 'desconocido' })).toEqual([]);
    });

    it('combines chip filter with search query', () => {
      expect(filterPatients(items, { filter: 'RISK', query: 'garcia' })).toEqual([]);
      expect(filterPatients(items, { filter: 'SEVERE', query: 'mateo' })).toEqual([pSevere]);
    });
  });

  describe('paginatePatients', () => {
    const list = Array.from({ length: 25 }, (_, i) => ({
      child: makeChild(`c-${i}`, `Child ${i}`, 'Test'),
      riskLevel: 'NO_ALERTS' as const,
      primaryAlert: null,
      openAlertCount: 0,
    }));

    it('returns requested page size and flags hasMore', () => {
      const page1 = paginatePatients(list, 20);
      expect(page1.items).toHaveLength(20);
      expect(page1.hasMore).toBe(true);
      expect(page1.total).toBe(25);

      const page2 = paginatePatients(list, 40);
      expect(page2.items).toHaveLength(25);
      expect(page2.hasMore).toBe(false);
      expect(page2.total).toBe(25);
    });
  });

  describe('groupPatientsByRisk', () => {
    it('groups patients into 3 sections with exact counts', () => {
      const p1: PatientListItem = {
        child: makeChild('c-1', 'Mateo', 'Rodríguez'),
        riskLevel: 'SEVERE',
        primaryAlert: null,
        openAlertCount: 1,
      };
      const p2: PatientListItem = {
        child: makeChild('c-2', 'Valentina', 'Gómez'),
        riskLevel: 'SEVERE',
        primaryAlert: null,
        openAlertCount: 1,
      };
      const p3: PatientListItem = {
        child: makeChild('c-3', 'Santiago', 'Pérez'),
        riskLevel: 'RISK',
        primaryAlert: null,
        openAlertCount: 1,
      };
      const p4: PatientListItem = {
        child: makeChild('c-4', 'Camila', 'Torres'),
        riskLevel: 'RISK',
        primaryAlert: null,
        openAlertCount: 1,
      };
      const p5: PatientListItem = {
        child: makeChild('c-5', 'Daniel', 'Ríos'),
        riskLevel: 'NO_ALERTS',
        primaryAlert: null,
        openAlertCount: 0,
      };
      const p6: PatientListItem = {
        child: makeChild('c-6', 'Sofía', 'Vera'),
        riskLevel: 'NO_ALERTS',
        primaryAlert: null,
        openAlertCount: 0,
      };

      const sections = groupPatientsByRisk([p1, p2, p3, p4, p5, p6]);
      expect(sections).toHaveLength(3);
      expect(sections[0]).toMatchObject({ key: 'SEVERE', count: 2 });
      expect(sections[1]).toMatchObject({ key: 'RISK', count: 2 });
      expect(sections[2]).toMatchObject({ key: 'NO_ALERTS', count: 2 });
    });
  });
});

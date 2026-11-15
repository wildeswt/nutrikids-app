import type { AlertResponse, ChildResponse } from '@nutrikids/shared';

export type PatientRiskLevel = 'SEVERE' | 'RISK' | 'NO_ALERTS';
export type PatientRiskFilter = 'ALL' | PatientRiskLevel;

export interface PatientListItem {
  child: ChildResponse;
  riskLevel: PatientRiskLevel;
  primaryAlert: AlertResponse | null;
  openAlertCount: number;
}

export interface FilterPatientsOptions {
  filter: PatientRiskFilter;
  query?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  hasMore: boolean;
  total: number;
}

/**
 * Normalizes text for accent- and case-insensitive comparison.
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Ranks alerts to pick the primary one per child:
 * 1. isSevere (true > false)
 * 2. isOverdue (true > false)
 * 3. Most recent createdAt
 */
export function compareAlertSeverity(a: AlertResponse, b: AlertResponse): number {
  if (a.isSevere !== b.isSevere) {
    return a.isSevere ? -1 : 1;
  }
  if (a.isOverdue !== b.isOverdue) {
    return a.isOverdue ? -1 : 1;
  }
  return b.createdAt.localeCompare(a.createdAt);
}

/**
 * Combines children with their open alerts, determines each child's risk category
 * and sorts them deterministically:
 * 1. SEVERE (isOverdue first, then newest alert)
 * 2. RISK (isOverdue first, then newest alert)
 * 3. NO_ALERTS
 * Ties broken by child last name, first name, and id.
 */
export function buildPatientList(
  children: readonly ChildResponse[],
  openAlerts: readonly AlertResponse[],
): PatientListItem[] {
  const alertsByChild = new Map<string, AlertResponse[]>();

  for (const alert of openAlerts) {
    const list = alertsByChild.get(alert.childId);
    if (list) {
      list.push(alert);
    } else {
      alertsByChild.set(alert.childId, [alert]);
    }
  }

  const items: PatientListItem[] = children.map((child) => {
    const childAlerts = alertsByChild.get(child.id) ?? [];
    if (childAlerts.length === 0) {
      return {
        child,
        riskLevel: 'NO_ALERTS',
        primaryAlert: null,
        openAlertCount: 0,
      };
    }

    const sortedAlerts = [...childAlerts].sort(compareAlertSeverity);
    const primaryAlert = sortedAlerts[0]!;
    const riskLevel: PatientRiskLevel = primaryAlert.isSevere ? 'SEVERE' : 'RISK';

    return {
      child,
      riskLevel,
      primaryAlert,
      openAlertCount: childAlerts.length,
    };
  });

  const levelPriority: Record<PatientRiskLevel, number> = {
    SEVERE: 0,
    RISK: 1,
    NO_ALERTS: 2,
  };

  return items.sort((a, b) => {
    const pA = levelPriority[a.riskLevel];
    const pB = levelPriority[b.riskLevel];
    if (pA !== pB) return pA - pB;

    if (a.primaryAlert && b.primaryAlert) {
      const alertComparison = compareAlertSeverity(a.primaryAlert, b.primaryAlert);
      if (alertComparison !== 0) return alertComparison;
    }

    const lastNameCmp = a.child.lastName.localeCompare(b.child.lastName, 'es', {
      sensitivity: 'base',
    });
    if (lastNameCmp !== 0) return lastNameCmp;

    const firstNameCmp = a.child.firstName.localeCompare(b.child.firstName, 'es', {
      sensitivity: 'base',
    });
    if (firstNameCmp !== 0) return firstNameCmp;

    return a.child.id.localeCompare(b.child.id);
  });
}

/**
 * Filters the patient list by risk filter chip and search query.
 */
export function filterPatients(
  patients: readonly PatientListItem[],
  options: FilterPatientsOptions,
): PatientListItem[] {
  const { filter, query } = options;
  const normalizedQuery = query ? normalizeSearchText(query) : '';

  return patients.filter((item) => {
    if (filter !== 'ALL' && item.riskLevel !== filter) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const fullName = `${item.child.firstName} ${item.child.lastName}`;
    const reverseName = `${item.child.lastName} ${item.child.firstName}`;
    return (
      normalizeSearchText(fullName).includes(normalizedQuery) ||
      normalizeSearchText(reverseName).includes(normalizedQuery)
    );
  });
}

/**
 * Slices items for incremental client-side display.
 */
export function paginatePatients(
  patients: readonly PatientListItem[],
  visibleCount: number,
): PaginatedResult<PatientListItem> {
  const count = Math.max(0, visibleCount);
  return {
    items: patients.slice(0, count),
    hasMore: count < patients.length,
    total: patients.length,
  };
}

export interface PatientRiskSection {
  key: PatientRiskLevel;
  titleKey: 'patients.sections.severe' | 'patients.sections.moderate' | 'patients.sections.inOrder';
  count: number;
  data: PatientListItem[];
}

/**
 * Groups a patient list into 3 semantic sections:
 * 1. SEVERE ("Riesgo alto")
 * 2. RISK ("Riesgo moderado")
 * 3. NO_ALERTS ("En orden")
 */
export function groupPatientsByRisk(patients: readonly PatientListItem[]): PatientRiskSection[] {
  const severe: PatientListItem[] = [];
  const risk: PatientListItem[] = [];
  const noAlerts: PatientListItem[] = [];

  for (const item of patients) {
    if (item.riskLevel === 'SEVERE') severe.push(item);
    else if (item.riskLevel === 'RISK') risk.push(item);
    else noAlerts.push(item);
  }

  return [
    {
      key: 'SEVERE',
      titleKey: 'patients.sections.severe',
      count: severe.length,
      data: severe,
    },
    {
      key: 'RISK',
      titleKey: 'patients.sections.moderate',
      count: risk.length,
      data: risk,
    },
    {
      key: 'NO_ALERTS',
      titleKey: 'patients.sections.inOrder',
      count: noAlerts.length,
      data: noAlerts,
    },
  ];
}

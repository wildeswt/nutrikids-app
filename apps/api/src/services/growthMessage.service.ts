import type { GrowthConcern, GrowthMessageResponse } from '@nutrikids/shared';
import type { AuthContext } from '../lib/permissions.js';
import { withUser } from '../lib/prisma.js';

/**
 * Mensaje de crecimiento para el cuidador (NK-35, RF-14). Se toma la última alerta de los
 * controles vigentes del niño: mientras esté sin revisar (`GENERATED`, `PENDING_REVIEW`) la
 * respuesta es `ok` y no revela que existe; cuando el profesional la revisó (`REVIEWED`,
 * `FOLLOW_UP_ESTABLISHED`) se devuelve la dirección general, la recomendación del profesional
 * para la familia y la fecha del próximo control. Nunca incluye puntajes z, percentiles,
 * clasificaciones, el tipo de riesgo ni el indicador.
 */

const REVIEWED_STATUSES = new Set(['REVIEWED', 'FOLLOW_UP_ESTABLISHED']);

const CONCERN_BY_RISK: Readonly<Record<string, GrowthConcern>> = {
  UNDERWEIGHT: 'below',
  STUNTING: 'below',
  WASTING: 'below',
  OVERWEIGHT: 'above',
  OBESITY: 'above',
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getGrowthMessage(
  auth: AuthContext,
  childId: string,
): Promise<GrowthMessageResponse> {
  const alert = await withUser(auth.userId, (tx) =>
    tx.alert.findFirst({
      where: { indicatorResult: { checkup: { childId, corrections: { none: {} } } } },
      orderBy: { createdAt: 'desc' },
      include: {
        history: { orderBy: { changedAt: 'desc' }, take: 1 },
        followUps: { where: { childId } },
      },
    }),
  );

  if (!alert || !REVIEWED_STATUSES.has(alert.status)) {
    return {
      childId,
      status: 'ok',
      concern: null,
      recommendation: null,
      nextCheckupDate: null,
      reviewedAt: null,
    };
  }

  const dates = alert.followUps
    .map((f) => f.nextCheckupDate)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime());
  const recommendation = alert.followUps.find((f) => f.type === 'recommendation')?.details ?? null;

  return {
    childId,
    status: 'reviewed',
    concern: CONCERN_BY_RISK[alert.riskType] ?? null,
    recommendation,
    nextCheckupDate: dates[0] ? toIsoDate(dates[0]) : null,
    reviewedAt: alert.history[0]?.changedAt.toISOString() ?? null,
  };
}

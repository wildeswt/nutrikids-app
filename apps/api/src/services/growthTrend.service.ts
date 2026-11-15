import {
  GrowthTrendResponseSchema,
  type GrowthTrendItem,
  type GrowthTrendResponse,
} from '@nutrikids/shared';
import type { AuthContext } from '../lib/permissions.js';
import { withUser } from '../lib/prisma.js';

/**
 * Tolerancia en desviaciones estándar (puntaje z) para determinar si la tendencia
 * de crecimiento se mantiene favorable respecto al control vigente anterior.
 *
 * Regla: Si |z_último| <= |z_anterior| + TREND_Z_TOLERANCE, la tendencia es FAVORABLE.
 *
 * NOTA CLÍNICA: Esta regla es conservadora y preliminar. El equipo de salud debe
 * validarla y calibrarla clínicamente antes de su publicación definitiva en producción.
 */
export const TREND_Z_TOLERANCE = 0.5;

/** Clasificación antropométrica normal en el sistema de patrones OMS. */
const NORMAL_CLASSIFICATION = 'NORMAL';

/**
 * Calcula la etiqueta de tendencia de crecimiento por indicador para un niño (NK-74).
 *
 * Reglas para el cuidador (RF-14):
 * - Se leen los dos últimos controles vigentes (isCurrent) con sus resultados en el contexto RLS.
 * - Un niño sin controles vigentes devuelve [].
 * - Para cada indicador:
 *   - 'FAVORABLE' solo si el último control vigente tiene clasificación 'NORMAL' en ese indicador
 *     y, si existe un control vigente anterior, |z_último| <= |z_anterior| + TREND_Z_TOLERANCE (0.5).
 *   - En cualquier otro caso 'NONE'.
 * - Nunca se devuelven los puntajes z, percentiles ni clasificaciones técnicas.
 */
export async function getGrowthTrend(
  auth: AuthContext,
  childId: string,
): Promise<GrowthTrendResponse> {
  return withUser(auth.userId, async (tx) => {
    const rows = await tx.checkup.findMany({
      where: { childId },
      include: {
        results: {
          orderBy: { indicator: 'asc' },
        },
      },
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
    });

    const superseded = new Set(
      rows.map((r) => r.correctedCheckupId).filter((id): id is string => id !== null),
    );

    const currentCheckups = rows.filter((r) => !superseded.has(r.id));

    if (currentCheckups.length === 0) {
      return [];
    }

    const latest = currentCheckups[0]!;
    const previous = currentCheckups.length > 1 ? currentCheckups[1] : undefined;

    const items: GrowthTrendItem[] = latest.results.map((result) => {
      const isNormal = result.classification === NORMAL_CLASSIFICATION;
      if (!isNormal) {
        return {
          indicator: result.indicator,
          trend: 'NONE',
          basedOnCheckupId: latest.id,
        };
      }

      if (!previous) {
        return {
          indicator: result.indicator,
          trend: 'FAVORABLE',
          basedOnCheckupId: latest.id,
        };
      }

      const prevResult = previous.results.find((r) => r.indicator === result.indicator);
      if (!prevResult) {
        return {
          indicator: result.indicator,
          trend: 'FAVORABLE',
          basedOnCheckupId: latest.id,
        };
      }

      const latestZ = Number(result.zScore);
      const prevZ = Number(prevResult.zScore);
      // Margen de 1e-9 para prevenir imprecisiones de punto flotante en la frontera de 0.5
      const favorable = Math.abs(latestZ) <= Math.abs(prevZ) + TREND_Z_TOLERANCE + 1e-9;

      return {
        indicator: result.indicator,
        trend: favorable ? 'FAVORABLE' : 'NONE',
        basedOnCheckupId: latest.id,
      };
    });

    return GrowthTrendResponseSchema.parse(items);
  });
}

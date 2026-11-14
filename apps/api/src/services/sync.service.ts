import {
  SyncCheckupItemSchema,
  UuidSchema,
  type ClientComputedResult,
  type Indicator,
  type SyncCheckupResult,
  type SyncCheckupsResponse,
  type SyncDiscrepancy,
  type SyncDiscrepancyField,
} from '@nutrikids/shared';
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import type { AuthContext } from '../lib/permissions.js';
import { withUser } from '../lib/prisma.js';
import { resolveChildLink } from '../middlewares/access.js';
import { logAuditEvent, type AuditParams } from './audit.service.js';
import { insertCheckup } from './checkups.service.js';

/**
 * Sincronización por lotes de controles registrados sin conexión (RT-02).
 *
 * - Cada control se procesa en su propia transacción: si uno falla, el resto del lote se conserva.
 * - Inserción idempotente por `id` del cliente (`ON CONFLICT (id) DO NOTHING` en `insertCheckup`).
 * - El servidor siempre recalcula los indicadores (RF-07). Si el celular envió su propio cálculo y
 *   difiere, el servidor conserva el suyo y registra la discrepancia en `audit_logs`.
 */

/** Tolerancia para comparar z-score y percentil (ambos se almacenan con 2 decimales). */
const NUMERIC_TOLERANCE = 0.01;

interface ServerResult {
  id: string;
  indicator: string;
  zScore: unknown;
  percentile: unknown;
  classification: string;
}

interface IndicatorDiscrepancy extends SyncDiscrepancy {
  resultId: string;
  client: Pick<ClientComputedResult, 'zScore' | 'percentile' | 'classification'>;
  server: { zScore: number; percentile: number; classification: string };
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

const differs = (client: number | undefined, server: number): boolean =>
  client !== undefined && Math.abs(round2(client) - server) > NUMERIC_TOLERANCE + 1e-9;

/**
 * Compara los resultados calculados por el celular con los del servidor, indicador por indicador.
 * Solo se comparan los campos que el celular envió.
 */
export function findDiscrepancies(
  clientResults: readonly ClientComputedResult[],
  serverResults: readonly ServerResult[],
): IndicatorDiscrepancy[] {
  const discrepancies: IndicatorDiscrepancy[] = [];
  for (const client of clientResults) {
    const server = serverResults.find((r) => r.indicator === client.indicator);
    if (!server) continue;

    const serverValues = {
      zScore: Number(server.zScore),
      percentile: Number(server.percentile),
      classification: server.classification,
    };
    const fields: SyncDiscrepancyField[] = [];
    if (differs(client.zScore, serverValues.zScore)) fields.push('zScore');
    if (differs(client.percentile, serverValues.percentile)) fields.push('percentile');
    if (
      client.classification !== undefined &&
      client.classification !== serverValues.classification
    ) {
      fields.push('classification');
    }
    if (fields.length === 0) continue;

    discrepancies.push({
      indicator: client.indicator as Indicator,
      fields,
      resultId: server.id,
      client: {
        zScore: client.zScore,
        percentile: client.percentile,
        classification: client.classification,
      },
      server: serverValues,
    });
  }
  return discrepancies;
}

function extractItemId(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const parsed = UuidSchema.safeParse((raw as { id?: unknown }).id);
  return parsed.success ? parsed.data : null;
}

function errorResult(id: string | null, err: unknown): SyncCheckupResult {
  if (err instanceof HttpError) {
    return { id, status: 'ERROR', error: { status: err.statusCode, message: err.message } };
  }
  if (err instanceof z.ZodError) {
    const message = err.issues[0]?.message ?? 'Datos inválidos';
    return { id, status: 'ERROR', error: { status: 400, message } };
  }
  console.error('[sync] Error al sincronizar control', id, err);
  return {
    id,
    status: 'ERROR',
    error: { status: 500, message: 'No se pudo registrar el control' },
  };
}

function logAuditEvents(events: AuditParams[]): void {
  for (const event of events) {
    logAuditEvent(event).catch((err) => {
      // La falla de auditoría no interrumpe la sincronización
      console.error('[sync] Error al registrar evento de auditoría:', err);
    });
  }
}

async function syncOne(auth: AuthContext, raw: unknown): Promise<SyncCheckupResult> {
  const id = extractItemId(raw);
  try {
    const item = SyncCheckupItemSchema.parse(raw);
    const { childId, ...input } = item;

    const viewer = await resolveChildLink(auth, childId);
    if (!viewer) {
      throw HttpError.forbidden('No tienes acceso a este niño');
    }

    const { checkup, created, results } = await withUser(auth.userId, (tx) =>
      insertCheckup(tx, { auth, viewer, childId, input, correctedCheckupId: null }),
    );

    // Solo se compara al crear: un reenvío no vuelve a registrar la misma discrepancia.
    const discrepancies = created && input.results ? findDiscrepancies(input.results, results) : [];

    const events: AuditParams[] = [];
    if (created) {
      events.push({
        userId: auth.userId,
        action: 'CREATE',
        entityType: 'checkups',
        entityId: checkup.id,
      });
    }
    for (const d of discrepancies) {
      events.push({
        userId: auth.userId,
        action: 'DISCREPANCY',
        entityType: 'indicator_results',
        entityId: d.resultId,
        details: {
          checkupId: checkup.id,
          indicator: d.indicator,
          fields: d.fields,
          client: d.client,
          server: d.server,
        },
      });
    }
    logAuditEvents(events);

    return {
      id: checkup.id,
      status: created ? 'CREATED' : 'DUPLICATE',
      checkup,
      ...(discrepancies.length > 0
        ? {
            discrepancies: discrepancies.map(({ indicator, fields }) => ({ indicator, fields })),
          }
        : {}),
    };
  } catch (err) {
    return errorResult(id, err);
  }
}

/**
 * Sincroniza un lote de controles. Devuelve un resultado por ítem, en el mismo orden del lote.
 * Los ítems se procesan en secuencia para respetar el orden en que se registraron en el celular.
 */
export async function syncCheckups(
  auth: AuthContext,
  items: readonly unknown[],
): Promise<SyncCheckupsResponse> {
  const results: SyncCheckupResult[] = [];
  for (const raw of items) {
    results.push(await syncOne(auth, raw));
  }
  return { results };
}

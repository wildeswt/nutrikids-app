import { sendFollowUpBatchAndAlert } from '../follow-up-alert.js';
import { normalizeFollowUpQueuePayload } from '../follow-up-storage.js';
import {
  processSequentialQueue,
  type FlushQueueSummary,
  type SyncQueueProcessorContext,
} from './queue-processor.js';

/**
 * Procesador de sincronización para elementos `kind = 'follow-up'`.
 *
 * Envía los lotes uno a uno mediante `POST /children/:childId/follow-ups/batch` y, si aplica,
 * mueve la alerta asociada. Un fallo 4xx definitivo marca el elemento en `'ERROR'` sin reintento
 * automático; errores transitorios aplican espera creciente y detienen la tanda actual.
 */
export async function processFollowUpQueue(
  context: SyncQueueProcessorContext,
): Promise<FlushQueueSummary> {
  const sendFollowUp = context.sendFollowUp ?? sendFollowUpBatchAndAlert;

  return processSequentialQueue(context, {
    kind: 'follow-up',
    normalize: normalizeFollowUpQueuePayload,
    send: async (normalized) => {
      await sendFollowUp({
        childId: normalized.childId,
        ...(normalized.alertId ? { alertId: normalized.alertId } : {}),
        establish: normalized.establish,
        input: normalized.batch,
      });
    },
  });
}

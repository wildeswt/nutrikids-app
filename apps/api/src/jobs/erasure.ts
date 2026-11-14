import { runErasureRequests } from '../services/dataRights.service.js';

const PASS_INTERVAL_MS = 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

/** Una pasada: anonimiza a los niños con solicitud de eliminación vencida (NK-41). */
export async function runErasureJob(): Promise<{ processed: number } | null> {
  try {
    const result = await runErasureRequests();
    if (result.processed > 0) {
      console.log(`Job de eliminación: ${result.processed} solicitudes ejecutadas`);
    }
    return result;
  } catch (err) {
    console.error('Error al ejecutar job de eliminación de datos:', err);
    return null;
  }
}

/** Corre cada hora (el plazo legal es de días), con la primera pasada 60 s después del arranque. */
export function startErasureJob(): void {
  if (timer) return;
  const first = setTimeout(() => void runErasureJob(), 60 * 1000);
  first.unref();
  timer = setInterval(() => void runErasureJob(), PASS_INTERVAL_MS);
  timer.unref();
}

export function stopErasureJob(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

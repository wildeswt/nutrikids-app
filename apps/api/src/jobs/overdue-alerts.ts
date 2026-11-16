import { env } from '../config/env.js';
import { processOverdueAlerts } from '../services/notifications.service.js';
import { dispatchDueReminders } from '../services/reminders.service.js';

let isRunning = false;
let initialJobTimer: NodeJS.Timeout | null = null;
let overdueAlertsTimer: NodeJS.Timeout | null = null;

/**
 * Ejecuta una pasada del job de alertas vencidas.
 * Cuenta con guarda anti-solapamiento para evitar ejecuciones concurrentes.
 */
export async function runOverdueAlertsJob(): Promise<{ processed: number } | null> {
  if (isRunning) {
    console.warn('Job de alertas vencidas omitido: ejecucion previa aun en curso');
    return null;
  }

  isRunning = true;
  try {
    const result = await processOverdueAlerts();
    if (result.processed > 0) {
      console.log(`Job de alertas vencidas: ${result.processed} notificaciones generadas`);
    }
    return result;
  } catch (err) {
    console.error('Error al ejecutar job de alertas vencidas:', err);
    return null;
  } finally {
    isRunning = false;
  }
}

/**
 * Ejecuta una pasada del despacho de recordatorios (NK-37). La función SQL es atómica, así que
 * dos pasadas simultáneas no duplican avisos.
 */
export async function runRemindersJob(): Promise<{ processed: number } | null> {
  try {
    const result = await dispatchDueReminders();
    if (result.processed > 0) {
      console.log(`Job de recordatorios: ${result.processed} notificaciones generadas`);
    }
    return result;
  } catch (err) {
    console.error('Error al ejecutar job de recordatorios:', err);
    return null;
  }
}

/**
 * Inicia las tareas en segundo plano del servidor (alertas vencidas NK-36, recordatorios NK-37).
 * Programa una pasada inicial diferida (30s tras arranque) y ejecuciones periodicas con .unref().
 */
export function startBackgroundJobs(): void {
  if (overdueAlertsTimer) return;

  const intervalMs = env.OVERDUE_ALERTS_INTERVAL_MINUTES * 60 * 1000;

  initialJobTimer = setTimeout(() => {
    initialJobTimer = null;
    void runOverdueAlertsJob();
    void runRemindersJob();
  }, 30 * 1000);
  initialJobTimer.unref();

  overdueAlertsTimer = setInterval(() => {
    void runOverdueAlertsJob();
    void runRemindersJob();
  }, intervalMs);

  overdueAlertsTimer.unref();

  console.log(
    `Trabajos en segundo plano iniciados (intervalo de alertas vencidas: ${env.OVERDUE_ALERTS_INTERVAL_MINUTES}m)`,
  );
}

/**
 * Detiene las tareas en segundo plano del servidor durante el apagado ordenado (shutdown).
 */
export function stopBackgroundJobs(): void {
  if (initialJobTimer) {
    clearTimeout(initialJobTimer);
    initialJobTimer = null;
  }
  if (overdueAlertsTimer) {
    clearInterval(overdueAlertsTimer);
    overdueAlertsTimer = null;
    console.log('Trabajos en segundo plano detenidos');
  }
}

/**
 * Retorna si el job esta en ejecucion (para monitoreo y pruebas).
 */
export function isOverdueAlertsJobRunning(): boolean {
  return isRunning;
}

/**
 * Retorna si el temporizador periodico esta activo (para pruebas).
 */
export function isBackgroundJobsActive(): boolean {
  return overdueAlertsTimer !== null;
}

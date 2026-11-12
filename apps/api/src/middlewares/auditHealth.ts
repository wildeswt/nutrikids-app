import type { AuditAction, AuditEntityType } from '@nutrikids/shared';
import type { Request, RequestHandler, Response } from 'express';
import { logAuditEvent } from '../services/audit.service.js';

export interface AuditConfig {
  /** Acción a registrar: 'CREATE' | 'READ' | 'REVIEW' | 'REVOKE'. */
  action: AuditAction;
  /** Tipo de entidad de salud auditada. */
  entityType: AuditEntityType;
  /**
   * Extractor personalizado del id de la entidad.
   * Si no se provee, intenta resolverlo desde `res.locals.auditEntityId`,
   * `req.params.checkupId`, `req.params.childId` o `req.params.id`.
   */
  getEntityId?: (req: Request, res: Response) => string | null | undefined;
}

/**
 * Middleware que registra lecturas y escrituras de datos de salud en `audit_logs` (NK-21).
 * Debe posicionarse después de `authenticate`.
 * Se ejecuta de manera asíncrona al terminar la respuesta (`res.on('finish')`) para
 * operaciones exitosas (código 2xx), evitando alterar la latencia de las respuestas.
 */
export function auditHealth(config: AuditConfig): RequestHandler {
  return (req, res, next) => {
    res.on('finish', () => {
      // Registrar solo accesos o modificaciones efectivos (código de estado 2xx)
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return;
      }

      const userId = req.auth?.userId;
      if (!userId) {
        return;
      }

      const entityId = config.getEntityId
        ? (config.getEntityId(req, res) ?? null)
        : ((res.locals.auditEntityId as string | undefined) ??
          (req.params.checkupId as string | undefined) ??
          (req.params.childId as string | undefined) ??
          (req.params.id as string | undefined) ??
          null);

      logAuditEvent({
        userId,
        action: config.action,
        entityType: config.entityType,
        entityId,
      }).catch((err) => {
        // La falla de auditoría no interrumpe la respuesta al cliente
        console.error('[auditHealth] Error al registrar evento de auditoría:', err);
      });
    });

    next();
  };
}

import type {
  AuditAction,
  AuditDetails,
  AuditEntityType,
  AuditListResponse,
  AuditLogResponse,
  AuditQuery,
} from '@nutrikids/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthContext } from '../lib/permissions.js';
import { prisma } from '../lib/prisma.js';

export interface AuditParams {
  userId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  /** Contexto estructurado opcional (p. ej. valores en discrepancia al sincronizar, RT-02). */
  details?: AuditDetails | null;
}

export function formatAuditLogResponse(row: {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details?: unknown;
  occurredAt: Date;
}): AuditLogResponse {
  return {
    id: row.id,
    userId: row.userId,
    action: row.action as AuditAction,
    entityType: row.entityType as AuditEntityType,
    entityId: row.entityId,
    details: (row.details as AuditDetails | null | undefined) ?? null,
    occurredAt: row.occurredAt.toISOString(),
  };
}

/**
 * Registra un evento en la tabla inmutable `audit_logs`.
 * Inserción directa (append-only) que no bloquea la respuesta HTTP.
 */
export async function logAuditEvent(params: AuditParams): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      ...(params.details ? { details: params.details as Prisma.InputJsonObject } : {}),
    },
  });
}

/**
 * Lista los registros de auditoría aplicando filtros opcionales y paginación.
 * Solo ejecutable por profesionales autorizados (permiso audit:read).
 */
export async function listAuditLogs(
  _auth: AuthContext,
  query: AuditQuery,
): Promise<AuditListResponse> {
  const { userId, entityType, entityId, from, to, page, limit } = query;

  const where: Prisma.AuditLogWhereInput = {
    ...(userId ? { userId } : {}),
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(from || to
      ? {
          occurredAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    data: rows.map(formatAuditLogResponse),
    total,
    page,
    limit,
  };
}

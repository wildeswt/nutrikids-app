import { z } from 'zod';
import { IsoDateTimeSchema, UuidSchema } from './common.js';

/**
 * Acciones registradas en la auditoría de accesos y modificaciones (NK-21).
 * `DISCREPANCY`: el resultado calculado por el celular difiere del recalculado por el servidor (RT-02).
 */
export const AuditActionSchema = z.enum([
  'CREATE',
  'READ',
  'REVIEW',
  'REVOKE',
  'DISCREPANCY',
  'UPDATE',
  'EXPORT',
  'ERASE',
]);

/** Detalle estructurado opcional de un evento de auditoría (JSON). */
export const AuditDetailsSchema = z.record(z.string(), z.unknown());

/** Tipos de entidad de salud auditadas. */
export const AuditEntityTypeSchema = z.enum([
  'children',
  'checkups',
  'indicator_results',
  'feeding_logs',
  'follow_ups',
  'alerts',
  'consents',
  'messages',
  'erasure_requests',
  'users',
]);

/** Parámetros internos para registrar auditoría. */
export const CreateAuditLogInputSchema = z.object({
  userId: UuidSchema,
  action: AuditActionSchema,
  entityType: AuditEntityTypeSchema,
  entityId: UuidSchema.nullable().optional(),
  details: AuditDetailsSchema.nullable().optional(),
});

/** Parámetros de consulta para GET /audit. */
export const AuditQuerySchema = z.object({
  userId: UuidSchema.optional(),
  entityType: AuditEntityTypeSchema.optional(),
  entityId: UuidSchema.optional(),
  from: IsoDateTimeSchema.optional(),
  to: IsoDateTimeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Formato de respuesta de un registro de auditoría. */
export const AuditLogResponseSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  action: AuditActionSchema,
  entityType: AuditEntityTypeSchema,
  entityId: UuidSchema.nullable(),
  details: AuditDetailsSchema.nullable().optional(),
  occurredAt: IsoDateTimeSchema,
});

/** Respuesta paginada de auditoría. */
export const AuditListResponseSchema = z.object({
  data: z.array(AuditLogResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
});

export type AuditAction = z.infer<typeof AuditActionSchema>;
export type AuditEntityType = z.infer<typeof AuditEntityTypeSchema>;
export type AuditDetails = z.infer<typeof AuditDetailsSchema>;
export type CreateAuditLogInput = z.infer<typeof CreateAuditLogInputSchema>;
export type AuditQuery = z.infer<typeof AuditQuerySchema>;
export type AuditLogResponse = z.infer<typeof AuditLogResponseSchema>;
export type AuditListResponse = z.infer<typeof AuditListResponseSchema>;

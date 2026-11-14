import { describe, expect, it } from 'vitest';
import {
  AuditActionSchema,
  AuditEntityTypeSchema,
  AuditLogResponseSchema,
  AuditQuerySchema,
} from '../index.js';

describe('Audit Schemas (NK-21)', () => {
  it('valida acciones de auditoría permitidas', () => {
    expect(AuditActionSchema.safeParse('CREATE').success).toBe(true);
    expect(AuditActionSchema.safeParse('READ').success).toBe(true);
    expect(AuditActionSchema.safeParse('REVIEW').success).toBe(true);
    expect(AuditActionSchema.safeParse('REVOKE').success).toBe(true);
    expect(AuditActionSchema.safeParse('DELETE').success).toBe(false);
  });

  it('valida entidades de salud auditadas', () => {
    expect(AuditEntityTypeSchema.safeParse('children').success).toBe(true);
    expect(AuditEntityTypeSchema.safeParse('checkups').success).toBe(true);
    expect(AuditEntityTypeSchema.safeParse('indicator_results').success).toBe(true);
    expect(AuditEntityTypeSchema.safeParse('feeding_logs').success).toBe(true);
    expect(AuditEntityTypeSchema.safeParse('follow_ups').success).toBe(true);
    expect(AuditEntityTypeSchema.safeParse('alerts').success).toBe(true);
    expect(AuditEntityTypeSchema.safeParse('consents').success).toBe(true);
    expect(AuditEntityTypeSchema.safeParse('users').success).toBe(true);
    expect(AuditEntityTypeSchema.safeParse('messages').success).toBe(false);
  });

  it('valida query parameters para consulta de auditoría con defaults', () => {
    const parsed = AuditQuerySchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.page).toBe(1);
      expect(parsed.data.limit).toBe(50);
    }
  });

  it('valida query parameters con filtros', () => {
    const valid = AuditQuerySchema.safeParse({
      userId: '3f2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c',
      entityType: 'checkups',
      entityId: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
      from: '2026-11-10T00:00:00.000Z',
      to: '2026-11-12T23:59:59.000Z',
      page: '2',
      limit: '20',
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.page).toBe(2);
      expect(valid.data.limit).toBe(20);
    }
  });

  it('rechaza límites inválidos en query parameters', () => {
    expect(AuditQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(AuditQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(AuditQuerySchema.safeParse({ userId: 'not-a-uuid' }).success).toBe(false);
  });

  it('valida AuditLogResponseSchema', () => {
    const valid = AuditLogResponseSchema.safeParse({
      id: '3f2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c',
      userId: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
      action: 'CREATE',
      entityType: 'checkups',
      entityId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
      occurredAt: '2026-11-12T15:30:00.000Z',
    });
    expect(valid.success).toBe(true);
  });
});

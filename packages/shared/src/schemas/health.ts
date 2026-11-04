import { z } from 'zod';

export const ServiceStatusSchema = z.enum(['ok', 'degraded', 'error']);

export const HealthResponseSchema = z.object({
  status: ServiceStatusSchema,
  service: z.string(),
  timestamp: z.string(),
  uptime: z.number().nonnegative(),
  db: z.enum(['ok', 'disconnected', 'not_configured']).optional(),
});

export type ServiceStatus = z.infer<typeof ServiceStatusSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

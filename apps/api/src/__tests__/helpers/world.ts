import crypto from 'node:crypto';
import pg from 'pg';
import { env } from '../../config/env.js';
import { signAccessToken } from '../../services/token.service.js';

/**
 * Datos sintéticos para las pruebas de sistema y de seguridad (NK-46). Todo se crea con el
 * cliente administrador (DIRECT_URL) y UUID aleatorios; los correos usan el dominio
 * `nutrikids.local` (nunca datos reales de niños ni de personas). Los controles y la auditoría
 * son inmutables, por lo que estas pruebas no limpian lo que crean.
 */

export const adminConnectionString = env.DIRECT_URL ?? env.DATABASE_URL;

export const SYNTHETIC_EMAIL_DOMAINS = ['nutrikids.local', 'example.test'] as const;

export async function connectAdmin(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: adminConnectionString });
  await client.connect();
  return client;
}

export interface TestUser {
  userId: string;
  email: string;
  auth: string;
  roles: ('CAREGIVER' | 'PROFESSIONAL')[];
}

export type Specialty = 'nursing' | 'nutrition' | 'pediatrics';

export async function createUser(
  admin: pg.Client,
  role: 'CAREGIVER' | 'PROFESSIONAL',
  specialty: Specialty = 'pediatrics',
): Promise<TestUser> {
  const userId = crypto.randomUUID();
  const email = `sys-${userId}@nutrikids.local`;
  await admin.query(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, status, updated_at)
     VALUES ($1, $2, 'hash', 'Prueba', $3, 'active', now())`,
    [userId, email, role === 'CAREGIVER' ? 'Cuidadora' : 'Profesional'],
  );
  if (role === 'CAREGIVER') {
    await admin.query(`INSERT INTO caregivers (user_id, phone) VALUES ($1, '+593990000')`, [
      userId,
    ]);
  } else {
    await admin.query(
      `INSERT INTO professionals (user_id, specialty, license_number) VALUES ($1, $2, $3)`,
      [userId, specialty, `LIC-${userId.slice(0, 8)}`],
    );
  }
  const { accessToken } = await signAccessToken({
    sub: userId,
    roles: [role],
    specialty: role === 'PROFESSIONAL' ? specialty : null,
  });
  return { userId, email, auth: `Bearer ${accessToken}`, roles: [role] };
}

export interface SeedChildOptions {
  consent?: boolean;
  legalRepresentative?: boolean;
}

/** Niño sintético de ~3 años (dentro del rango de 12 a 60 meses) vinculado al cuidador. */
export async function seedChild(
  admin: pg.Client,
  caregiverId: string,
  options: SeedChildOptions = {},
): Promise<string> {
  const { consent = true, legalRepresentative = true } = options;
  const childId = crypto.randomUUID();
  await admin.query(
    `INSERT INTO children (id, first_name, last_name, birth_date, sex)
     VALUES ($1, 'Mateo', 'Sintetico', CURRENT_DATE - 1095, 'MALE')`,
    [childId],
  );
  await admin.query(
    `INSERT INTO caregiver_children (caregiver_id, child_id, relationship, is_legal_representative)
     VALUES ($1, $2, 'Madre', $3)`,
    [caregiverId, childId, legalRepresentative],
  );
  if (consent) {
    await admin.query(
      `INSERT INTO consents (id, child_id, caregiver_id, text_version) VALUES ($1, $2, $3, 'v1')`,
      [crypto.randomUUID(), childId, caregiverId],
    );
  }
  return childId;
}

export async function linkProfessional(
  admin: pg.Client,
  childId: string,
  professionalId: string,
  state: 'active' | 'expired' = 'active',
): Promise<void> {
  await admin.query(
    `INSERT INTO professional_children (id, child_id, professional_id, start_date, end_date)
     VALUES ($1, $2, $3, CURRENT_DATE - 30, CASE WHEN $4 = 'expired' THEN CURRENT_DATE - 1 END)`,
    [crypto.randomUUID(), childId, professionalId, state],
  );
}

export function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

/** Espera (hasta ~2 s) a que aparezca una fila de auditoría escrita después de responder. */
export async function waitForAudit(
  admin: pg.Client,
  where: { userId: string; action: string; entityType: string; entityId?: string },
): Promise<boolean> {
  for (let i = 0; i < 40; i += 1) {
    const { rows } = await admin.query(
      `SELECT 1 FROM audit_logs
        WHERE user_id = $1 AND action = $2 AND entity_type = $3
          AND ($4::uuid IS NULL OR entity_id = $4::uuid)`,
      [where.userId, where.action, where.entityType, where.entityId ?? null],
    );
    if (rows.length > 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

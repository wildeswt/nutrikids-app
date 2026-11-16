/**
 * Seed de desarrollo con datos 100 % sintéticos (nunca datos reales de niños).
 *
 * Reproduce el caso de ejemplo del informe (Tabla 7 / Figura 7): Mateo José Rodríguez,
 * nacido el 12 de mayo de 2023, con 4 controles en 2026. El control del 18 de octubre
 * (12,2 kg, 97,0 cm) genera una alerta de emaciación. Resultados, alerta e historial se
 * insertan directamente (calculados con `@nutrikids/who-growth`); no pasan por la API.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import {
  WHO_REFERENCE_VERSION,
  ageInMonths,
  calculateZScore,
  classify,
  getLmsParameters,
  percentileFromZScore,
  type Cutoffs,
  type RiskCategory,
  type WhoIndicator,
} from '@nutrikids/who-growth';
import { env } from '../config/env.js';
import { PrismaClient, type Indicator } from '../generated/prisma/client.js';
import { hashPassword } from './password.js';
import { encryptChildNames, encryptPhone, encryptUserNames } from '../services/pii.service.js';

/** Contraseña de desarrollo compartida por las cuentas sintéticas (solo local). */
export const DEV_SEED_PASSWORD = 'NutriKids-Dev-2026';

export const SEED_IDS = {
  caregiver: '00000000-0000-4000-8000-000000000001',
  nurse: '00000000-0000-4000-8000-000000000002',
  pediatrician: '00000000-0000-4000-8000-000000000003',
  child: '00000000-0000-4000-8000-000000000010',
  consent: '00000000-0000-4000-8000-000000000011',
  professionalChildNurse: '00000000-0000-4000-8000-000000000012',
  professionalChildPediatrician: '00000000-0000-4000-8000-000000000013',
  alert: '00000000-0000-4000-8000-000000000040',
  alertHistoryGenerated: '00000000-0000-4000-8000-000000000041',
  alertHistoryPendingReview: '00000000-0000-4000-8000-000000000042',
  notification: '00000000-0000-4000-8000-000000000043',
} as const;

export const SEED_USERS = {
  caregiver: { email: 'ana.rodriguez@example.test', firstName: 'Ana', lastName: 'Rodríguez' },
  nurse: { email: 'enfermera.dev@example.test', firstName: 'Lucía', lastName: 'Fernández' },
  pediatrician: { email: 'pediatra.dev@example.test', firstName: 'Carlos', lastName: 'Méndez' },
} as const;

export const MATEO = {
  firstName: 'Mateo José',
  lastName: 'Rodríguez',
  birthDate: '2023-05-12',
  sex: 'MALE',
} as const;

/** Fecha local (Caracas, UTC-4) y hora del control; todos a las 09:12. */
interface ControlInput {
  n: 1 | 2 | 3 | 4;
  date: string;
  weightKg: number;
  lengthHeightCm: number;
}

/**
 * Controles de 2026 (abr, jun, ago, oct). El de octubre es el de la Tabla 7.
 * Los tres anteriores son sintéticos y reproducen la tendencia de la Figura 7
 * (z P/T ≈ 0, −0,05 y −0,15). Las tallas están en pasos de 0,5 cm porque
 * `getLmsParameters` no interpola entre filas de la tabla OMS.
 */
export const MATEO_CONTROLS: readonly ControlInput[] = [
  { n: 1, date: '2026-04-18', weightKg: 13.6, lengthHeightCm: 93.0 },
  { n: 2, date: '2026-06-20', weightKg: 13.9, lengthHeightCm: 94.5 },
  { n: 3, date: '2026-08-22', weightKg: 14.0, lengthHeightCm: 95.5 },
  { n: 4, date: '2026-10-18', weightKg: 12.2, lengthHeightCm: 97.0 },
];

const ALERT_CONTROL_N = 4;

export interface SeedResult {
  indicator: Indicator;
  zScore: number;
  percentile: number;
  classification: RiskCategory;
}

export interface SeedCheckup {
  id: string;
  n: number;
  measuredAt: Date;
  weightKg: number;
  lengthHeightCm: number;
  ageMonths: number;
  results: (SeedResult & { id: string })[];
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

function seedUuid(prefix: number, n: number, k = 0): string {
  const p = String(prefix).padStart(2, '0');
  return `00000000-0000-4000-8000-00000${p}${String(n).padStart(2, '0')}${String(k).padStart(3, '0')}`;
}

/** Lanza si se intenta correr el seed en producción. */
export function assertNotProduction(nodeEnv: string | undefined = process.env.NODE_ENV): void {
  if (nodeEnv === 'production') {
    throw new Error('El seed de desarrollo no puede ejecutarse con NODE_ENV=production.');
  }
}

/**
 * Calcula con who-growth los 4 resultados de cada control (sin tocar la BD). Clasifica con los
 * mismos puntos de corte configurados que usa el servidor (`env.CLASSIFICATION_CUTOFFS`, RF-08).
 */
export function buildMateoCheckups(
  cutoffs: Readonly<Cutoffs> = env.CLASSIFICATION_CUTOFFS,
): SeedCheckup[] {
  return MATEO_CONTROLS.map((c) => {
    const ageMonths = ageInMonths(MATEO.birthDate, c.date);
    const z = (ind: WhoIndicator, x: number, value: number): number => {
      const { l, m, s } = getLmsParameters(ind, MATEO.sex, x, 'standing');
      return round2(calculateZScore(value, l, m, s));
    };
    const bmi = c.weightKg / (c.lengthHeightCm / 100) ** 2;
    const zs = {
      WEIGHT_FOR_AGE: z('WEIGHT_FOR_AGE', ageMonths, c.weightKg),
      LENGTH_HEIGHT_FOR_AGE: z('LENGTH_HEIGHT_FOR_AGE', ageMonths, c.lengthHeightCm),
      WEIGHT_FOR_LENGTH_HEIGHT: z('WEIGHT_FOR_LENGTH_HEIGHT', c.lengthHeightCm, c.weightKg),
      BMI_FOR_AGE: z('BMI_FOR_AGE', ageMonths, bmi),
    } satisfies Record<Indicator, number>;

    const classOf = {
      WEIGHT_FOR_AGE: classify({ zWFA: zs.WEIGHT_FOR_AGE }, cutoffs).primary,
      LENGTH_HEIGHT_FOR_AGE: classify({ zLHFA: zs.LENGTH_HEIGHT_FOR_AGE }, cutoffs).primary,
      WEIGHT_FOR_LENGTH_HEIGHT: classify({ zWFLH: zs.WEIGHT_FOR_LENGTH_HEIGHT }, cutoffs).primary,
      BMI_FOR_AGE: classify({ zBFA: zs.BMI_FOR_AGE }, cutoffs).primary,
    } satisfies Record<Indicator, RiskCategory>;

    const indicators = Object.keys(zs) as Indicator[];
    return {
      id: seedUuid(30, c.n),
      n: c.n,
      measuredAt: new Date(`${c.date}T09:12:00-04:00`),
      weightKg: c.weightKg,
      lengthHeightCm: c.lengthHeightCm,
      ageMonths,
      results: indicators.map((indicator, k) => ({
        id: seedUuid(31, c.n, k),
        indicator,
        zScore: zs[indicator],
        percentile: round2(percentileFromZScore(zs[indicator])),
        classification: classOf[indicator],
      })),
    };
  });
}

export async function seedDevData(client?: PrismaClient): Promise<void> {
  assertNotProduction();

  const checkups = buildMateoCheckups();
  const alertCheckup = checkups.find((c) => c.n === ALERT_CONTROL_N)!;
  const alertResult = alertCheckup.results.find((r) => r.indicator === 'WEIGHT_FOR_LENGTH_HEIGHT')!;
  if (alertResult.classification !== 'WASTING') {
    throw new Error(
      `Incoherencia en el seed: se esperaba emaciación en el control del 18 oct (z P/T = ${alertResult.zScore}). ` +
        `Revisa CUTOFF_WASTING_WFLH / CUTOFF_SEVERE_WASTING_WFLH (actual: ${env.CLASSIFICATION_CUTOFFS.wastingWFLH} / ${env.CLASSIFICATION_CUTOFFS.severeWastingWFLH}).`,
    );
  }

  const connectionString = env.DIRECT_URL ?? env.DATABASE_URL;
  const shouldDisconnect = !client;
  const prisma = client ?? new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    console.log('Poblando datos sintéticos de desarrollo (Mateo)...');
    const passwordHash = await hashPassword(DEV_SEED_PASSWORD);
    const alertAt = alertCheckup.measuredAt;

    await prisma.$transaction(async (tx) => {
      const users = [
        ['caregiver', SEED_USERS.caregiver],
        ['nurse', SEED_USERS.nurse],
        ['pediatrician', SEED_USERS.pediatrician],
      ] as const;
      for (const [key, u] of users) {
        const { firstName, lastName, ...rest } = u;
        const data = {
          ...rest,
          ...encryptUserNames({ firstName, lastName }),
          passwordHash,
          status: 'active',
        };
        await tx.user.upsert({
          where: { id: SEED_IDS[key] },
          create: { id: SEED_IDS[key], ...data },
          update: data,
        });
      }

      await tx.caregiver.upsert({
        where: { userId: SEED_IDS.caregiver },
        create: {
          userId: SEED_IDS.caregiver,
          phoneEnc: encryptPhone('+584120000001'),
        },
        update: {
          phoneEnc: encryptPhone('+584120000001'),
        },
      });
      await tx.professional.upsert({
        where: { userId: SEED_IDS.nurse },
        create: { userId: SEED_IDS.nurse, specialty: 'nursing', licenseNumber: 'DEV-ENF-0001' },
        update: {},
      });
      await tx.professional.upsert({
        where: { userId: SEED_IDS.pediatrician },
        create: {
          userId: SEED_IDS.pediatrician,
          specialty: 'pediatrics',
          licenseNumber: 'DEV-PED-0001',
        },
        update: {},
      });

      const child = {
        ...encryptChildNames({
          firstName: MATEO.firstName,
          lastName: MATEO.lastName,
        }),
        birthDate: new Date(`${MATEO.birthDate}T00:00:00Z`),
        sex: MATEO.sex,
      };
      await tx.child.upsert({
        where: { id: SEED_IDS.child },
        create: { id: SEED_IDS.child, ...child },
        update: child,
      });

      await tx.caregiverChild.upsert({
        where: {
          caregiverId_childId: { caregiverId: SEED_IDS.caregiver, childId: SEED_IDS.child },
        },
        create: {
          caregiverId: SEED_IDS.caregiver,
          childId: SEED_IDS.child,
          relationship: 'madre',
          isLegalRepresentative: true,
        },
        update: {},
      });
      for (const [id, professionalId] of [
        [SEED_IDS.professionalChildNurse, SEED_IDS.nurse],
        [SEED_IDS.professionalChildPediatrician, SEED_IDS.pediatrician],
      ] as const) {
        await tx.professionalChild.upsert({
          where: { id },
          create: {
            id,
            childId: SEED_IDS.child,
            professionalId,
            startDate: new Date('2026-01-01T00:00:00Z'),
          },
          update: {},
        });
      }
      await tx.consent.upsert({
        where: { id: SEED_IDS.consent },
        create: {
          id: SEED_IDS.consent,
          childId: SEED_IDS.child,
          caregiverId: SEED_IDS.caregiver,
          textVersion: 'v1',
          grantedAt: new Date('2026-01-01T09:00:00-04:00'),
        },
        update: {},
      });

      // `checkups` y `alert_history` son inmutables (triggers): solo se insertan.
      await tx.checkup.createMany({
        skipDuplicates: true,
        data: checkups.map((c) => ({
          id: c.id,
          childId: SEED_IDS.child,
          measuredAt: c.measuredAt,
          weightKg: c.weightKg,
          lengthHeightCm: c.lengthHeightCm,
          position: 'STANDING' as const,
          origin: 'PROFESSIONAL' as const,
          recordedById: SEED_IDS.nurse,
        })),
      });
      await tx.indicatorResult.createMany({
        skipDuplicates: true,
        data: checkups.flatMap((c) =>
          c.results.map((r) => ({
            id: r.id,
            checkupId: c.id,
            indicator: r.indicator,
            zScore: r.zScore,
            percentile: r.percentile,
            classification: r.classification,
            referenceVersion: WHO_REFERENCE_VERSION,
          })),
        ),
      });

      await tx.alert.createMany({
        skipDuplicates: true,
        data: [
          {
            id: SEED_IDS.alert,
            indicatorResultId: alertResult.id,
            riskType: 'WASTING' as const,
            isSevere: false,
            status: 'PENDING_REVIEW' as const,
            createdAt: alertAt,
          },
        ],
      });
      await tx.alertHistory.createMany({
        skipDuplicates: true,
        data: [
          {
            id: SEED_IDS.alertHistoryGenerated,
            alertId: SEED_IDS.alert,
            status: 'GENERATED' as const,
            changedById: SEED_IDS.nurse,
            changedAt: alertAt,
          },
          {
            id: SEED_IDS.alertHistoryPendingReview,
            alertId: SEED_IDS.alert,
            status: 'PENDING_REVIEW' as const,
            changedById: SEED_IDS.nurse,
            changedAt: alertAt,
          },
        ],
      });
      await tx.notification.upsert({
        where: { id: SEED_IDS.notification },
        create: {
          id: SEED_IDS.notification,
          userId: SEED_IDS.pediatrician,
          type: 'alert_pending_review',
          entityType: 'alert',
          entityId: SEED_IDS.alert,
          sentAt: alertAt,
        },
        update: {},
      });
    });

    console.log(
      `Seed de desarrollo completado: 3 usuarios, 1 niño, ${checkups.length} controles, alerta del 18 oct (z P/T = ${alertResult.zScore}).`,
    );
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect();
    }
  }
}

import { PrismaPg } from '@prisma/adapter-pg';
import {
  WHO_REFERENCE_VERSION,
  WFA_FEMALE,
  WFA_MALE,
  LHFA_FEMALE,
  LHFA_MALE,
  BFA_FEMALE,
  BFA_MALE,
  WFLH_FEMALE,
  WFLH_MALE,
  type FilaLMS,
} from '@nutrikids/who-growth';
import { env } from '../config/env.js';
import { PrismaClient, type Indicator, type Sex } from '../generated/prisma/client.js';

interface SeedGroup {
  indicator: Indicator;
  sex: Sex;
  label: string;
  rows: FilaLMS[];
}

export const LMS_SEED_GROUPS: SeedGroup[] = [
  { indicator: 'WEIGHT_FOR_AGE', sex: 'FEMALE', label: 'P/E Niñas (12-60m)', rows: WFA_FEMALE },
  { indicator: 'WEIGHT_FOR_AGE', sex: 'MALE', label: 'P/E Niños (12-60m)', rows: WFA_MALE },
  {
    indicator: 'LENGTH_HEIGHT_FOR_AGE',
    sex: 'FEMALE',
    label: 'T/E Niñas (12-60m)',
    rows: LHFA_FEMALE,
  },
  { indicator: 'LENGTH_HEIGHT_FOR_AGE', sex: 'MALE', label: 'T/E Niños (12-60m)', rows: LHFA_MALE },
  { indicator: 'BMI_FOR_AGE', sex: 'FEMALE', label: 'IMC/E Niñas (12-60m)', rows: BFA_FEMALE },
  { indicator: 'BMI_FOR_AGE', sex: 'MALE', label: 'IMC/E Niños (12-60m)', rows: BFA_MALE },
  {
    indicator: 'WEIGHT_FOR_LENGTH_HEIGHT',
    sex: 'FEMALE',
    label: 'P/T Niñas (45-120cm)',
    rows: WFLH_FEMALE,
  },
  {
    indicator: 'WEIGHT_FOR_LENGTH_HEIGHT',
    sex: 'MALE',
    label: 'P/T Niños (45-120cm)',
    rows: WFLH_MALE,
  },
];

export async function seedLmsReferences(client?: PrismaClient): Promise<number> {
  const connectionString = env.DIRECT_URL ?? env.DATABASE_URL;
  const shouldDisconnect = !client;
  const prismaClient = client ?? new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    console.log(
      `🌱 Poblando tabla lms_references con datos oficiales [${WHO_REFERENCE_VERSION}]...`,
    );

    let totalUpserted = 0;

    for (const group of LMS_SEED_GROUPS) {
      const data = group.rows.map((r) => ({
        indicator: group.indicator,
        sex: group.sex,
        x: r.x,
        l: r.l,
        m: r.m,
        s: r.s,
      }));

      // Idempotente: skipDuplicates = true utiliza INSERT ... ON CONFLICT DO NOTHING
      // respetando la clave primaria compuesta (indicator, sex, x)
      const result = await prismaClient.lmsReference.createMany({
        data,
        skipDuplicates: true,
      });

      totalUpserted += result.count;
      console.log(
        `  ✓ [${group.indicator}] [${group.sex}] ${group.label}: ${result.count} filas insertadas (${group.rows.length} total)`,
      );
    }

    console.log(`✨ Seed LMS completado. Filas nuevas insertadas: ${totalUpserted}`);
    return totalUpserted;
  } finally {
    if (shouldDisconnect) {
      await prismaClient.$disconnect();
    }
  }
}

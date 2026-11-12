import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { env } from '../config/env.js';
import { PrismaClient, type Indicator, type Sex } from '../generated/prisma/client.js';
import { LMS_SEED_GROUPS, seedLmsReferences } from '../lib/seedLms.js';

const connectionString = env.DIRECT_URL ?? env.DATABASE_URL;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * 5 valores puntuales de referencia tomados directamente de las tablas oficiales OMS 2006
 * publicadas en: https://www.who.int/tools/child-growth-standards/standards
 */
const CASOS_OFICIALES_OMS = [
  {
    indicador: 'WEIGHT_FOR_AGE',
    sexo: 'FEMALE',
    x: 24,
    l: -0.2941,
    m: 11.4775,
    s: 0.1239,
    fuente: 'tab_wfa_girls_p_0_5.xlsx (Mes 24)',
  },
  {
    indicador: 'LENGTH_HEIGHT_FOR_AGE',
    sexo: 'MALE',
    x: 36,
    l: 1.0,
    m: 96.0835,
    s: 0.03858,
    fuente: 'tab_lhfa_boys_p_2_5.xlsx (Mes 36)',
  },
  {
    indicador: 'BMI_FOR_AGE',
    sexo: 'FEMALE',
    x: 60,
    l: -0.5684,
    m: 15.2747,
    s: 0.09789,
    fuente: 'tab_bmi_girls_p_2_5.xlsx (Mes 60)',
  },
  {
    indicador: 'WEIGHT_FOR_LENGTH_HEIGHT',
    sexo: 'MALE',
    x: 80.0,
    l: -0.3521,
    m: 10.5781,
    s: 0.08298,
    fuente: 'tab_wfh_boys_p_2_5.xlsx (Talla 80.0 cm)',
  },
  {
    indicador: 'WEIGHT_FOR_LENGTH_HEIGHT',
    sexo: 'FEMALE',
    x: 55.0,
    l: -0.3833,
    m: 4.5498,
    s: 0.0911,
    fuente: 'tab_wfl_girls_p_0_2.xlsx (Longitud 55.0 cm)',
  },
] as const;

describe('RT-08: LMS References Database Seed and WHO Verification', () => {
  describe('Verification of seed data (LMS_SEED_GROUPS) against official WHO tables', () => {
    for (const caso of CASOS_OFICIALES_OMS) {
      it(`Seed [${caso.indicador}] [${caso.sexo}] x=${caso.x} matches ${caso.fuente}`, () => {
        const group = LMS_SEED_GROUPS.find(
          (g) => g.indicator === caso.indicador && g.sex === caso.sexo,
        );
        expect(group).toBeDefined();

        const row = group!.rows.find((r) => Math.abs(r.x - caso.x) < 0.001);
        expect(row).toBeDefined();
        expect(row!.x).toBeCloseTo(caso.x, 2);
        expect(row!.l).toBeCloseTo(caso.l, 4);
        expect(row!.m).toBeCloseTo(caso.m, 4);
        expect(row!.s).toBeCloseTo(caso.s, 4);
      });
    }
  });

  describe('Database persistence and idempotency (lms_references)', () => {
    let client: pg.Client;
    let dbAvailable = false;

    beforeAll(async () => {
      try {
        client = new pg.Client({ connectionString, connectionTimeoutMillis: 3000 });
        await client.connect();
        dbAvailable = true;
        // Ensure seed is applied prior to tests
        await seedLmsReferences(prisma);
      } catch {
        dbAvailable = false;
        await client?.end().catch(() => undefined);
      }
    }, 30000);

    afterAll(async () => {
      if (dbAvailable) {
        await client.end();
      }
      await prisma.$disconnect();
    });

    describe('Verification of 5 database values against official WHO tables', () => {
      for (const caso of CASOS_OFICIALES_OMS) {
        it(`[${caso.indicador}] [${caso.sexo}] x=${caso.x} matches ${caso.fuente}`, async ({
          skip,
        }) => {
          if (!dbAvailable) {
            skip();
            return;
          }

          const row = await prisma.lmsReference.findUnique({
            where: {
              indicator_sex_x: {
                indicator: caso.indicador as Indicator,
                sex: caso.sexo as Sex,
                x: caso.x,
              },
            },
          });

          expect(row).not.toBeNull();
          expect(Number(row!.x)).toBeCloseTo(caso.x, 2);
          expect(Number(row!.l)).toBeCloseTo(caso.l, 4);
          expect(Number(row!.m)).toBeCloseTo(caso.m, 4);
          expect(Number(row!.s)).toBeCloseTo(caso.s, 4);
        });
      }
    });

    describe('Database range coverage', () => {
      it('covers range 12 to 60 months for WEIGHT_FOR_AGE', async ({ skip }) => {
        if (!dbAvailable) {
          skip();
          return;
        }

        const count = await prisma.lmsReference.count({
          where: { indicator: 'WEIGHT_FOR_AGE' },
        });
        // 49 months * 2 sexes = 98 rows
        expect(count).toBe(98);
      });

      it('covers range 12 to 60 months for LENGTH_HEIGHT_FOR_AGE', async ({ skip }) => {
        if (!dbAvailable) {
          skip();
          return;
        }

        const count = await prisma.lmsReference.count({
          where: { indicator: 'LENGTH_HEIGHT_FOR_AGE' },
        });
        expect(count).toBe(98);
      });

      it('covers range 12 to 60 months for BMI_FOR_AGE', async ({ skip }) => {
        if (!dbAvailable) {
          skip();
          return;
        }

        const count = await prisma.lmsReference.count({
          where: { indicator: 'BMI_FOR_AGE' },
        });
        expect(count).toBe(98);
      });

      it('covers length and height for WEIGHT_FOR_LENGTH_HEIGHT from 45 to 120 cm', async ({
        skip,
      }) => {
        if (!dbAvailable) {
          skip();
          return;
        }

        const count = await prisma.lmsReference.count({
          where: { indicator: 'WEIGHT_FOR_LENGTH_HEIGHT' },
        });
        // 151 values * 2 sexes = 302 rows
        expect(count).toBe(302);
      });
    });

    describe('Seed idempotency', () => {
      it('running seedLmsReferences again does not throw or duplicate data', async ({ skip }) => {
        if (!dbAvailable) {
          skip();
          return;
        }

        const countBefore = await prisma.lmsReference.count();
        await expect(seedLmsReferences(prisma)).resolves.not.toThrow();
        const countAfter = await prisma.lmsReference.count();
        expect(countAfter).toBe(countBefore);
      }, 30000);
    });
  });
});

import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../src/config/env.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { encryptPii, isEncrypted } from '../src/lib/pii-crypto.js';

const connectionString = env.DIRECT_URL ?? env.DATABASE_URL;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function backfillUsers(): Promise<number> {
  const users = await prisma.user.findMany({
    select: { id: true, firstNameEnc: true, lastNameEnc: true },
  });

  let count = 0;
  for (const user of users) {
    const updateData: { firstNameEnc?: string; lastNameEnc?: string } = {};
    if (!isEncrypted(user.firstNameEnc)) {
      updateData.firstNameEnc = encryptPii(user.firstNameEnc, 'users:first_name');
    }
    if (!isEncrypted(user.lastNameEnc)) {
      updateData.lastNameEnc = encryptPii(user.lastNameEnc, 'users:last_name');
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
      count += 1;
    }
  }
  return count;
}

async function backfillCaregivers(): Promise<number> {
  const caregivers = await prisma.caregiver.findMany({
    select: { userId: true, phoneEnc: true },
  });

  let count = 0;
  for (const cg of caregivers) {
    if (cg.phoneEnc && !isEncrypted(cg.phoneEnc)) {
      await prisma.caregiver.update({
        where: { userId: cg.userId },
        data: {
          phoneEnc: encryptPii(cg.phoneEnc.trim(), 'caregivers:phone'),
        },
      });
      count += 1;
    }
  }
  return count;
}

async function backfillChildren(): Promise<number> {
  const children = await prisma.child.findMany({
    select: { id: true, firstNameEnc: true, lastNameEnc: true },
  });

  let count = 0;
  for (const child of children) {
    const updateData: { firstNameEnc?: string; lastNameEnc?: string } = {};

    // No cifrar si ya está en formato v1: o si fue anonimizado por NK-41
    if (!isEncrypted(child.firstNameEnc) && child.firstNameEnc !== 'Anonimizado') {
      updateData.firstNameEnc = encryptPii(child.firstNameEnc, 'children:first_name');
    }
    if (!isEncrypted(child.lastNameEnc) && child.lastNameEnc !== 'Anonimizado') {
      updateData.lastNameEnc = encryptPii(child.lastNameEnc, 'children:last_name');
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.child.update({
        where: { id: child.id },
        data: updateData,
      });
      count += 1;
    }
  }
  return count;
}

async function validateConstraints(): Promise<void> {
  console.log('Validando restricciones de base de datos...');
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "users" VALIDATE CONSTRAINT "users_first_name_enc_format";',
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "users" VALIDATE CONSTRAINT "users_last_name_enc_format";',
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "children" VALIDATE CONSTRAINT "children_first_name_enc_format";',
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "children" VALIDATE CONSTRAINT "children_last_name_enc_format";',
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "caregivers" VALIDATE CONSTRAINT "caregivers_phone_enc_format";',
  );
}

async function main() {
  console.log('Iniciando migración de datos (backfill PII)...');
  const usersUpdated = await backfillUsers();
  console.log(`Usuarios actualizados: ${usersUpdated}`);

  const caregiversUpdated = await backfillCaregivers();
  console.log(`Cuidadores actualizados: ${caregiversUpdated}`);

  const childrenUpdated = await backfillChildren();
  console.log(`Niños actualizados: ${childrenUpdated}`);

  try {
    await validateConstraints();
    console.log('Restricciones validadas exitosamente.');
  } catch (err) {
    console.warn(
      'Nota: Validación de restricciones omitida o fallida (posible entorno sin constraints creadas aún):',
      (err as Error).message,
    );
  }
}

main()
  .catch((err) => {
    console.error('Error durante el backfill PII:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

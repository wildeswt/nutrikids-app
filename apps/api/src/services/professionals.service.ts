import type { ProfessionalLookupResponse, Specialty } from '@nutrikids/shared';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { logAuditEvent } from './audit.service.js';
import { decryptUserNames } from './pii.service.js';

/**
 * Busca un profesional activo por su registro profesional (coincidencia exacta).
 * Devuelve solo lo necesario para confirmar su identidad y registra cada búsqueda
 * en la auditoría (acierto o no). El registro buscado nunca se guarda en el log.
 */
export async function lookupProfessionalByLicense(
  userId: string,
  license: string,
): Promise<ProfessionalLookupResponse> {
  const professional = await prisma.professional.findUnique({
    where: { licenseNumber: license },
    select: {
      userId: true,
      specialty: true,
      user: { select: { firstNameEnc: true, lastNameEnc: true, status: true } },
    },
  });

  const found = professional !== null && professional.user.status === 'active';

  await logAuditEvent({
    userId,
    action: 'READ',
    entityType: 'professionals',
    entityId: found ? professional.userId : null,
    details: { found },
  });

  if (!found) {
    throw HttpError.notFound('No se encontró un profesional con ese registro');
  }

  const { firstName, lastName } = decryptUserNames(professional.user);

  return {
    professionalId: professional.userId,
    firstName,
    lastName,
    specialty: professional.specialty as Specialty,
  };
}

import type { ChildResponse, ProfessionalAssignmentResponse } from '@nutrikids/shared';
import { useCallback, useRef, useState } from 'react';
import { filterActiveProfessionals } from '../lib/messages-api.js';
import { listLinkedProfessionals } from '../lib/professionals-api.js';

/** Profesionales vigentes por niño (`childId` → lista). Un niño sin entrada aún no se pudo leer. */
export type ChildrenProfessionals = Record<string, ProfessionalAssignmentResponse[]>;

/**
 * Lee los profesionales vigentes de varios niños para mostrarlos en sus tarjetas. Cada niño se
 * resuelve por separado: si uno falla (sin conexión, sin acceso) no rompe a los demás y su tarjeta
 * simplemente ofrece «Vincular profesional».
 */
export function useChildrenProfessionals() {
  const [professionals, setProfessionals] = useState<ChildrenProfessionals>({});
  const latestRequest = useRef(0);

  const load = useCallback(async (children: readonly Pick<ChildResponse, 'id'>[]) => {
    const requestId = ++latestRequest.current;
    const results = await Promise.allSettled(
      children.map((child) => listLinkedProfessionals(child.id)),
    );
    if (requestId !== latestRequest.current) return;

    const next: ChildrenProfessionals = {};
    results.forEach((result, index) => {
      const child = children[index];
      if (child && result.status === 'fulfilled') {
        next[child.id] = filterActiveProfessionals(result.value);
      }
    });
    setProfessionals(next);
  }, []);

  return { professionals, load };
}

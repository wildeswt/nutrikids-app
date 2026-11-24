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
  /** Niños cuya consulta ya terminó (con éxito o con error). Los demás aún se están leyendo. */
  const [settled, setSettled] = useState<Record<string, true>>({});
  const professionalsRef = useRef(professionals);
  professionalsRef.current = professionals;
  const latestRequest = useRef(0);

  const load = useCallback(async (children: readonly Pick<ChildResponse, 'id'>[]) => {
    const requestId = ++latestRequest.current;
    // Un niño con profesional ya conocido conserva su fila mientras se actualiza; los demás
    // vuelven a «cargando» para no ofrecer «Vincular profesional» antes de saber la respuesta.
    setSettled(
      Object.fromEntries(
        children
          .filter((child) => (professionalsRef.current[child.id]?.length ?? 0) > 0)
          .map((child) => [child.id, true as const]),
      ),
    );
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
    setSettled(Object.fromEntries(children.map((child) => [child.id, true as const])));
  }, []);

  /** `true` mientras aún no se sabe si el niño tiene profesional vinculado. */
  const isLoading = useCallback((childId: string) => !settled[childId], [settled]);

  return { professionals, load, isLoading };
}

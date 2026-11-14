import {
  ChildResponseSchema,
  ConsentResponseSchema,
  GrantConsentInputSchema,
  type ChildResponse,
  type ConsentResponse,
} from '@nutrikids/shared';
import { z } from 'zod';
import { authFetch, parseApiError } from './api.js';

/** Versión actual del texto de consentimiento informado para la app. */
export const CURRENT_CONSENT_VERSION = 'v1';

/**
 * Textos de consentimiento en lenguaje claro, redactados según normativas de protección
 * de datos personales y consentimiento informado pediátrico.
 */
export const CONSENT_TEXT: Record<string, string> = {
  v1: `DECLARACIÓN DE CONSENTIMIENTO INFORMADO PARA EL REGISTRO Y SEGUIMIENTO NUTRICIONAL

1. ¿Para qué usamos los datos de tu hijo o hija?
Al utilizar NutriKids, los datos antropométricos del niño (peso, talla/longitud y fecha de nacimiento) se emplean exclusivamente para:
• Evaluar su crecimiento y estado nutricional comparándolo con los patrones de referencia oficiales de la Organización Mundial de la Salud (OMS).
• Detectar oportunamente alertas de riesgo nutricional (como bajo peso, desnutrición o sobrepeso) para orientar el cuidado oportuno.
• Facilitar el seguimiento continuo y coordinado junto a su equipo o profesional de salud tratante.

2. Confidencialidad y Seguridad
La información registrada es estrictamente confidencial. Se encuentra protegida bajo estrictos estándares de seguridad y cifrado. En ningún caso sus datos serán vendidos, comercializados ni transferidos a terceros con fines ajenos a su salud y bienestar.

3. Derecho de Revocación
Como madre, padre o representante legal, puedes revocar este consentimiento en cualquier momento directamente desde la sección "Mi Perfil" en la aplicación. 
La revocación impedirá registrar nuevos controles nutricionales, pero conservará de forma segura el historial previo registrado para fines de trazabilidad clínica y auditoría legal.

4. Aceptación
Al pulsar el botón "Aceptar consentimiento", confirmas que has leído y comprendido esta información en lenguaje claro y autorizas el tratamiento de los datos para los fines indicados.`,
};

/**
 * Consulta el consentimiento informado vigente o más reciente para un niño.
 * Retorna `null` si aún no existe consentimiento registrado (HTTP 404).
 */
export async function fetchConsentForChild(childId: string): Promise<ConsentResponse | null> {
  const response = await authFetch(`/children/${childId}/consent`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    const parsed = parseApiError(payload, 'No se pudo obtener el consentimiento informado');
    throw new Error(parsed.message);
  }

  const rawJson: unknown = await response.json();
  return ConsentResponseSchema.parse(rawJson);
}

/**
 * Otorga o renueva el consentimiento informado de un niño con una versión de texto específica.
 */
export async function grantConsentForChild(
  childId: string,
  textVersion: string = CURRENT_CONSENT_VERSION,
): Promise<ConsentResponse> {
  const validatedBody = GrantConsentInputSchema.parse({ textVersion });

  const response = await authFetch(`/children/${childId}/consent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(validatedBody),
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    const parsed = parseApiError(payload, 'No se pudo otorgar el consentimiento informado');
    throw new Error(parsed.message);
  }

  const rawJson: unknown = await response.json();
  return ConsentResponseSchema.parse(rawJson);
}

/**
 * Revoca el consentimiento informado vigente de un niño (revocación lógica con trazabilidad).
 */
export async function revokeConsentForChild(childId: string): Promise<ConsentResponse> {
  const response = await authFetch(`/children/${childId}/consent`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    const parsed = parseApiError(payload, 'No se pudo revocar el consentimiento informado');
    throw new Error(parsed.message);
  }

  const rawJson: unknown = await response.json();
  return ConsentResponseSchema.parse(rawJson);
}

/**
 * Lista los niños asociados al cuidador autenticado para gestionar consentimientos.
 */
export async function fetchCaregiverChildren(): Promise<ChildResponse[]> {
  const response = await authFetch('/children');

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    const parsed = parseApiError(payload, 'No se pudo obtener la lista de niños');
    throw new Error(parsed.message);
  }

  const rawJson: unknown = await response.json();
  return z.array(ChildResponseSchema).parse(rawJson);
}

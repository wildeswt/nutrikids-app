/**
 * Helpers de tipografia para la fuente Inter (Figma)
 */
export type FontWeight = 'regular' | 'medium' | 'semibold';

const FONT_FAMILY_BY_WEIGHT: Record<FontWeight, string> = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
};

/**
 * Devuelve el nombre de familia de fuente registrado para el peso indicado.
 */
export function font(weight: FontWeight): string {
  return FONT_FAMILY_BY_WEIGHT[weight];
}

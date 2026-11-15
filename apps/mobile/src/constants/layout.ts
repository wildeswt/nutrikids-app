import type { ViewStyle } from 'react-native';

/**
 * Medidas y sombras compartidas del sistema de diseno (Figma)
 */
export const SCREEN_MARGIN = 30;
export const RADIUS_PILL = 25;
export const FIELD_HEIGHT = 50;
export const BUTTON_WIDTH = 318;
export const BUTTON_HEIGHT = 50;

export const CARD_SHADOW: Pick<
  ViewStyle,
  'shadowColor' | 'shadowOpacity' | 'shadowRadius' | 'shadowOffset' | 'elevation'
> = {
  shadowColor: '#000000',
  shadowOpacity: 0.25,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 0 },
  elevation: 4,
};

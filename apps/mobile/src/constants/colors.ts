/**
 * Sistema de diseno NutriKids - Paleta de colores (Figma)
 *
 * Primario (botones y elementos principales): #2D5F5A
 * Secundario (acentos, divisores, insignias): #F77E4D
 * Fondo / Superficie: #FBFBFB
 * Entrada (fondo / placeholder): #F9F9F9 / #969696
 * Bordes (entrada / casilla): #E5E5E5 / #D4D4D8
 * Error: #E14100
 * Texto:
 *   - Titulos / Encabezados: #575757
 *   - Cuerpo / Resto: #4D4D4D
 */
export const PALETTE = {
  primary: '#2D5F5A',
  primaryPressed: '#244c48',
  primaryLight: '#E8F1F0',

  secondary: '#F77E4D',
  secondaryPressed: '#e06a39',
  secondaryLight: '#FEF2EC',

  background: '#FBFBFB',
  surface: '#FBFBFB',

  text: {
    title: '#575757',
    body: '#4D4D4D',
    muted: '#737373',
    light: '#FFFFFF',
  },

  border: {
    default: '#E5E7EB',
    focus: '#2D5F5A',
    subtle: '#F3F4F6',
    input: '#E5E5E5',
    checkbox: '#D4D4D8',
  },

  input: {
    background: '#F9F9F9',
    placeholder: '#969696',
  },

  feedback: {
    error: '#E14100',
    errorBg: '#FEE2E2',
    errorBorder: '#FCA5A5',
    success: '#16A34A',
    successBg: '#DCFCE7',
    warning: '#D97706',
    warningBg: '#FEF3C7',
  },
} as const;

export type Palette = typeof PALETTE;

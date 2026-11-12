/**
 * NutriKids Design System - Color Palette
 *
 * Primary (buttons, main elements): #2D5F5A
 * Secondary (accents, dividers, badges): #F77E4D
 * Background: #FDFDFD
 * Text:
 *   - Titles / Headings: #575757
 *   - Body / Rest: #4D4D4D
 */
export const PALETTE = {
  primary: '#2D5F5A',
  primaryPressed: '#244c48',
  primaryLight: '#E8F1F0',

  secondary: '#F77E4D',
  secondaryPressed: '#e06a39',
  secondaryLight: '#FEF2EC',

  background: '#FDFDFD',
  surface: '#FFFFFF',

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
  },

  input: {
    background: '#F9FAFB',
    placeholder: '#9CA3AF',
  },

  feedback: {
    error: '#DC2626',
    errorBg: '#FEE2E2',
    errorBorder: '#FCA5A5',
    success: '#16A34A',
    successBg: '#DCFCE7',
    warning: '#D97706',
    warningBg: '#FEF3C7',
  },
} as const;

export type Palette = typeof PALETTE;

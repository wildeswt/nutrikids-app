import type { Specialty } from '@nutrikids/shared';

/**
 * Demo data shown while the caregiver screens are not yet connected to the API.
 *
 * This file holds DATA only (proper names, numbers, ISO dates and sample messages that in
 * production are written by users). Every interface label that surrounds this data lives in
 * the translation files under `src/i18n/locales`.
 */

export interface DemoChild {
  id: string;
  firstName: string;
  fullName: string;
  /** ISO date `YYYY-MM-DD`. */
  birthDate: string;
  ageMonths: number;
}

export const DEMO_ACTIVE_CHILD: DemoChild = {
  id: 'mateo-1',
  firstName: 'Mateo',
  fullName: 'Mateo José Rodríguez',
  birthDate: '2023-05-12',
  ageMonths: 41,
};

export const DEMO_HOME_MESSAGE = {
  content: 'Sigamos ofreciendo agua durante el día',
  authorName: 'Dra. Carolina Díaz',
  daysAgo: 2,
};

export const DEMO_NEXT_CHECKUP = {
  date: '2026-11-24',
  place: 'Centro de Salud La Esperanza',
  time: '09:30',
};

export const DEMO_CHAT = {
  professionalName: 'Dra. Laura Pérez',
  specialty: 'nutrition' as Specialty,
  date: '2026-10-18',
  messages: [
    {
      id: 'msg-1',
      isMe: false,
      content: 'Hola, Andrea. ¿Cómo ha estado la alimentación de Mateo esta semana?',
      time: '09:32',
    },
    {
      id: 'msg-2',
      isMe: true,
      content: 'Hoy registré sus comidas. Ha comido mejor y tomó agua durante el día.',
      time: '09:35',
      status: 'read' as const,
    },
    {
      id: 'msg-3',
      isMe: false,
      content: 'Gracias. Revisaremos el registro en el control del 25 de octubre.',
      time: '09:40',
    },
  ],
};

export type DemoThreadTime =
  { kind: 'time'; value: string } | { kind: 'yesterday' } | { kind: 'date'; value: string };

export type DemoThreadSource =
  | { kind: 'childTeam'; childName: string; specialty: Specialty; professionalName: string }
  | { kind: 'healthCenter' };

export interface DemoThread {
  id: string;
  source: DemoThreadSource;
  preview: string;
  time: DemoThreadTime;
  unreadCount: number;
}

export const DEMO_THREADS: DemoThread[] = [
  {
    id: 'thread-1',
    source: {
      kind: 'childTeam',
      childName: 'Mateo',
      specialty: 'nutrition',
      professionalName: 'Dra. Laura Pérez',
    },
    preview: 'Gracias, Andrea. Revisaremos el registro.',
    time: { kind: 'time', value: '09:40' },
    unreadCount: 1,
  },
  {
    id: 'thread-2',
    source: {
      kind: 'childTeam',
      childName: 'Valentina',
      specialty: 'nursing',
      professionalName: 'Lic. Ana Torres',
    },
    preview: 'Te esperamos en el próximo control.',
    time: { kind: 'yesterday' },
    unreadCount: 1,
  },
  {
    id: 'thread-3',
    source: { kind: 'healthCenter' },
    preview: 'Tu cita está confirmada para el 25 oct.',
    time: { kind: 'date', value: '2026-10-16' },
    unreadCount: 0,
  },
];

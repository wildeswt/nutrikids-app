import type { ConversationResponse } from '@nutrikids/shared';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseConversationsResult } from '../hooks/useConversations.js';
import type { UseMessageThreadResult } from '../hooks/useMessageThread.js';

const CHILD_ID = '11111111-1111-4111-8111-111111111111';
const CAREGIVER_ID = '22222222-2222-4222-8222-222222222222';
const PROF_ID = '33333333-3333-4333-8333-333333333333';
const PROF_2_ID = '33333333-3333-4333-8333-333333333334';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => true),
  focusEffects: [] as (() => void)[],
  localParams: {} as Record<string, string>,
  activeUserId: '22222222-2222-4222-8222-222222222222',
  conversationsHook: {} as UseConversationsResult,
  threadHook: {} as UseMessageThreadResult,
  childrenHook: {
    status: 'ready' as const,
    children: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        firstName: 'Mateo',
        lastName: 'Gómez',
        birthDate: '2023-06-15',
        sex: 'MALE' as const,
      },
    ],
    error: null,
    load: vi.fn(async () => []),
    create: vi.fn(),
  },
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    back: mocks.back,
    canGoBack: mocks.canGoBack,
  }),
  useFocusEffect: (cb: () => void) => mocks.focusEffects.push(cb),
  useLocalSearchParams: () => mocks.localParams,
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: { children: React.ReactNode }) =>
    React.createElement('mock-safe-area', null, props.children),
}));

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

vi.mock('../context/auth-context.js', () => ({
  useAuth: () => ({
    user: {
      id: mocks.activeUserId,
      email: 'user@example.com',
      firstName: 'Andrea',
      lastName: 'Gómez',
      roles: ['CAREGIVER', 'PROFESSIONAL'],
      specialty: null,
    },
    activeRole: 'CAREGIVER',
    status: 'authenticated',
  }),
}));

vi.mock('../hooks/useChildren.js', () => ({
  useChildren: () => mocks.childrenHook,
}));

vi.mock('../hooks/useConversations.js', () => ({
  useConversations: () => mocks.conversationsHook,
}));

vi.mock('../hooks/useMessageThread.js', () => ({
  useMessageThread: () => mocks.threadHook,
}));

import CaregiverChatDetailScreen from '../app/(caregiver)/chat-detail.js';
import CaregiverMessagesScreen from '../app/(caregiver)/messages.js';
import ProfessionalChatDetailScreen from '../app/(professional)/chat-detail.js';
import ProfessionalMessagesScreen from '../app/(professional)/messages.js';
import { ConversationList } from '../components/ConversationList.js';
import { APP_ROUTES } from '../constants/routes.js';
import i18n from '../i18n/index.js';

interface TreeNode {
  type?: unknown;
  props?: Record<string, unknown>;
}

function findNode(node: unknown, predicate: (n: TreeNode) => boolean): TreeNode | null {
  if (!node || typeof node !== 'object') return null;
  const el = node as TreeNode;
  if (predicate(el)) return el;
  const children = el.props?.['children'];
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

function makeConversation(overrides: Partial<ConversationResponse> = {}): ConversationResponse {
  return {
    childId: CHILD_ID,
    participant: {
      userId: PROF_ID,
      firstName: 'Laura',
      lastName: 'Pérez',
      role: 'PROFESSIONAL',
      specialty: 'nutrition',
    },
    lastMessage: {
      id: '44444444-4444-4444-8444-444444444441',
      childId: CHILD_ID,
      senderId: PROF_ID,
      recipientId: CAREGIVER_ID,
      kind: 'message',
      body: 'Revisaremos el registro.',
      sentAt: '2026-10-16T09:40:00.000Z',
      readAt: null,
    },
    unreadCount: 2,
    ...overrides,
  };
}

function setConversations(overrides: Partial<UseConversationsResult> = {}) {
  mocks.conversationsHook = {
    conversations: [],
    loading: false,
    refreshing: false,
    error: null,
    unreadTotal: 0,
    reload: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    ...overrides,
  };
}

function setThread(overrides: Partial<UseMessageThreadResult> = {}) {
  mocks.threadHook = {
    messages: [],
    loading: false,
    loadingMore: false,
    refreshing: false,
    sending: false,
    hasMore: false,
    error: null,
    sendError: null,
    clearSendError: vi.fn(),
    reload: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    refreshSilent: vi.fn(async () => {}),
    loadOlder: vi.fn(async () => {}),
    send: vi.fn(async () => true),
    retryMessage: vi.fn(async () => true),
    ...overrides,
  };
}

describe('Messages & Chat Screens (NK-50)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.focusEffects.length = 0;
    mocks.localParams = {};
    mocks.activeUserId = CAREGIVER_ID;
    setConversations();
    setThread();
  });

  describe('Caregiver ConversationList & MessagesScreen', () => {
    it('muestra conversaciones con contador total de no leidos, especialidad y aviso de urgencias', () => {
      const unreadConv = makeConversation({ unreadCount: 2 });
      const readConv = makeConversation({
        participant: {
          userId: PROF_2_ID,
          firstName: 'Ana',
          lastName: 'Torres',
          role: 'PROFESSIONAL',
          specialty: 'nursing',
        },
        lastMessage: {
          id: '44444444-4444-4444-8444-444444444442',
          childId: CHILD_ID,
          senderId: PROF_2_ID,
          recipientId: CAREGIVER_ID,
          kind: 'message',
          body: 'Todo bien en control.',
          sentAt: '2026-10-15T10:00:00.000Z',
          readAt: '2026-10-15T10:05:00.000Z',
        },
        unreadCount: 0,
      });

      setConversations({
        conversations: [unreadConv, readConv],
        unreadTotal: 2,
      });

      const html = renderToString(React.createElement(CaregiverMessagesScreen));

      expect(html).toContain('Equipo de Mateo');
      expect(html).toContain('Nutrición · Laura Pérez');
      expect(html).toContain('Enfermería · Ana Torres');
      expect(html).toContain('Sin leer (2)');
      expect(html).toContain(i18n.t('caregiver:messages.emergencyNotice'));
      expect(html).toContain('Nuevo mensaje');
      expect(html).toContain(`conversation-unread-${CHILD_ID}-${PROF_ID}`);
      expect(html).not.toContain(`conversation-unread-${CHILD_ID}-${PROF_2_ID}`);
    });

    it('muestra estados de carga, vacio y error con reintento', () => {
      setConversations({ loading: true });
      expect(renderToString(React.createElement(CaregiverMessagesScreen))).toContain(
        'conversations-loading',
      );

      setConversations({ loading: false, conversations: [] });
      const emptyHtml = renderToString(React.createElement(CaregiverMessagesScreen));
      expect(emptyHtml).toContain('conversations-empty');
      expect(emptyHtml).toContain('Aún no tienes conversaciones');

      const reload = vi.fn(async () => {});
      setConversations({ error: 'No hay conexión.', reload });
      let captured: unknown = null;
      function Capture() {
        captured = ConversationList({
          mode: 'caregiver',
          onSelectConversation: vi.fn(),
        });
        return captured as React.ReactElement;
      }
      const errHtml = renderToString(React.createElement(Capture));
      expect(errHtml).toContain('No hay conexión.');

      const retryBtn = findNode(captured, (n) => n.props?.['testID'] === 'conversations-retry');
      (retryBtn?.props?.['onPress'] as () => void)();
      expect(reload).toHaveBeenCalled();
    });

    it('al pulsar una conversacion navega al chat con childId y withUserId', () => {
      const conv = makeConversation();
      setConversations({ conversations: [conv], unreadTotal: 2 });

      let captured: unknown = null;
      function Capture() {
        captured = CaregiverMessagesScreen();
        return null;
      }
      renderToString(React.createElement(Capture));

      // Evaluamos el ConversationList interno pasando por su props
      const convListEl = findNode(
        captured,
        (n) => typeof n.props?.['onSelectConversation'] === 'function',
      );
      (convListEl?.props?.['onSelectConversation'] as (c: ConversationResponse) => void)(conv);

      expect(mocks.push).toHaveBeenCalledWith({
        pathname: APP_ROUTES.CAREGIVER.CHAT_DETAIL,
        params: {
          childId: CHILD_ID,
          withUserId: PROF_ID,
          participantName: 'Laura Pérez',
          participantRole: 'PROFESSIONAL',
          participantSpecialty: 'nutrition',
          childFirstName: 'Mateo',
          childFullName: 'Mateo Gómez',
        },
      });
    });

    it('no muestra botón Volver y usa banner de contexto en pestaña Mensajes', () => {
      setConversations({ conversations: [makeConversation()], unreadTotal: 1 });
      const html = renderToString(React.createElement(CaregiverMessagesScreen));

      expect(html).not.toContain('conversations-header-back');
      expect(html).not.toContain('conversations-back-button');
      expect(html).toContain('conversations-banner');
    });
  });

  describe('Professional MessagesScreen & ChatDetailScreen', () => {
    it('muestra subtítulo profesional, niño y cuidador, interconsulta con especialidad y botón Nuevo mensaje', () => {
      const caregiverConv = makeConversation({
        participant: {
          userId: CAREGIVER_ID,
          firstName: 'Andrea',
          lastName: 'Gómez',
          role: 'CAREGIVER',
          specialty: null,
        },
        unreadCount: 1,
      });
      const colleagueConv = makeConversation({
        participant: {
          userId: PROF_2_ID,
          firstName: 'Carlos',
          lastName: 'Ruiz',
          role: 'PROFESSIONAL',
          specialty: 'pediatrics',
        },
        unreadCount: 0,
      });

      setConversations({
        conversations: [caregiverConv, colleagueConv],
        unreadTotal: 1,
      });

      const html = renderToString(React.createElement(ProfessionalMessagesScreen));

      expect(html).toContain('Conversa con cuidadores y otros profesionales.');
      expect(html).not.toContain('conversations-banner');
      expect(html).toContain('Mateo Gómez');
      expect(html).toContain('Cuidador · Andrea Gómez');
      expect(html).toContain('Interconsulta · Mateo Gómez');
      expect(html).toContain('Pediatría · Carlos Ruiz');
      expect(html).not.toContain('Equipo de');
      expect(html).toContain('Nuevo mensaje');
      expect(html).toContain('Este canal no atiende urgencias');
    });

    it('al abrir conversacion del profesional navega a /(professional)/chat-detail', () => {
      const conv = makeConversation({
        participant: {
          userId: CAREGIVER_ID,
          firstName: 'Andrea',
          lastName: 'Gómez',
          role: 'CAREGIVER',
          specialty: null,
        },
      });
      setConversations({ conversations: [conv], unreadTotal: 1 });

      let captured: unknown = null;
      function Capture() {
        captured = ProfessionalMessagesScreen();
        return null;
      }
      renderToString(React.createElement(Capture));

      const convListEl = findNode(
        captured,
        (n) => typeof n.props?.['onSelectConversation'] === 'function',
      );
      (convListEl?.props?.['onSelectConversation'] as (c: ConversationResponse) => void)(conv);

      expect(mocks.push).toHaveBeenCalledWith({
        pathname: APP_ROUTES.PROFESSIONAL.CHAT_DETAIL,
        params: {
          childId: CHILD_ID,
          withUserId: CAREGIVER_ID,
          participantName: 'Andrea Gómez',
          participantRole: 'CAREGIVER',
        },
      });
    });

    it('renderiza ProfessionalChatDetailScreen con el nombre del participante y privacidad profesional', () => {
      mocks.activeUserId = PROF_ID;
      mocks.localParams = {
        childId: CHILD_ID,
        withUserId: CAREGIVER_ID,
        participantName: 'Andrea Gómez',
        participantRole: 'CAREGIVER',
      };
      setThread({
        messages: [
          {
            id: '44444444-4444-4444-8444-444444444441',
            childId: CHILD_ID,
            senderId: PROF_ID,
            recipientId: CAREGIVER_ID,
            kind: 'message',
            body: 'Buenos días Andrea.',
            sentAt: '2026-10-18T09:35:00.000Z',
            readAt: '2026-10-18T09:36:00.000Z',
          },
        ],
      });

      const html = renderToString(React.createElement(ProfessionalChatDetailScreen));

      expect(html).toContain('Andrea Gómez');
      expect(html).not.toContain('Equipo de');
      expect(html).toContain('Buenos días Andrea.');
      expect(html).toContain('Leído');
      expect(html).toContain(i18n.t('professional:messages.chatPrivacy'));
    });
  });

  describe('Caregiver ChatDetailScreen states & errors', () => {
    it('muestra mensajes, separador de fecha, marca Leido, boton cargar anteriores y error de red/403', () => {
      mocks.localParams = {
        childId: CHILD_ID,
        withUserId: PROF_ID,
        participantName: 'Laura Pérez',
        participantRole: 'PROFESSIONAL',
        participantSpecialty: 'nutrition',
        childFirstName: 'Mateo',
        childFullName: 'Mateo Gómez',
      };

      setThread({
        hasMore: true,
        sendError: 'No hay conexión. Verifica tu internet e intenta de nuevo.',
        messages: [
          {
            id: '44444444-4444-4444-8444-444444444441',
            childId: CHILD_ID,
            senderId: PROF_ID,
            recipientId: CAREGIVER_ID,
            kind: 'message',
            body: 'Hola Andrea',
            sentAt: '2026-10-18T09:32:00.000Z',
            readAt: null,
          },
          {
            id: '44444444-4444-4444-8444-444444444442',
            childId: CHILD_ID,
            senderId: CAREGIVER_ID,
            recipientId: PROF_ID,
            kind: 'message',
            body: 'Gracias doctora',
            sentAt: '2026-10-18T09:35:00.000Z',
            readAt: '2026-10-18T09:36:00.000Z',
          },
        ],
      });

      const html = renderToString(React.createElement(CaregiverChatDetailScreen));

      expect(html).toContain('Equipo de Mateo');
      expect(html).toContain('Laura Pérez · Nutrición');
      expect(html).toContain('Sobre Mateo Gómez');
      expect(html).toContain('18 de octubre de 2026');
      expect(html).toContain('Hola Andrea');
      expect(html).toContain('Gracias doctora');
      expect(html).toContain('Leído');
      expect(html).toContain('Cargar mensajes anteriores');
      expect(html).toContain('No hay conexión');
    });

    it('muestra error 403 claro cuando no hay vinculo o consentimiento activo', () => {
      mocks.localParams = {
        childId: CHILD_ID,
        withUserId: PROF_ID,
      };
      setThread({
        error: 'No tienes acceso a este niño',
        messages: [],
      });

      const html = renderToString(React.createElement(CaregiverChatDetailScreen));
      expect(html).toContain('chat-error');
      expect(html).toContain('No tienes acceso a este niño');
    });

    it('conserva chat-back-button y usa banner de contexto', () => {
      mocks.localParams = {
        childId: CHILD_ID,
        withUserId: PROF_ID,
        participantName: 'Laura Pérez',
        participantRole: 'PROFESSIONAL',
        participantSpecialty: 'nutrition',
        childFirstName: 'Mateo',
        childFullName: 'Mateo Gómez',
      };
      setThread({ messages: [] });

      const html = renderToString(React.createElement(CaregiverChatDetailScreen));
      expect(html).toContain('chat-back-button');
      expect(html).toContain('chat-context-banner');
    });
  });
});

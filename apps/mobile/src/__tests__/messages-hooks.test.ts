import type * as ReactTypes from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  slots: [] as unknown[],
  refs: [] as { current: unknown }[],
  index: 0,
  refIndex: 0,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactTypes>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const slot = runtime.index++;
      if (!(slot in runtime.slots)) runtime.slots[slot] = initial;
      const set = (value: unknown) => {
        runtime.slots[slot] =
          typeof value === 'function'
            ? (value as (prev: unknown) => unknown)(runtime.slots[slot])
            : value;
      };
      return [runtime.slots[slot], set];
    },
    useRef: (initial: unknown) => {
      const slot = runtime.refIndex++;
      runtime.refs[slot] ??= { current: initial };
      return runtime.refs[slot];
    },
    useCallback: (fn: unknown) => fn,
  };
});

vi.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

import { useConversations } from '../hooks/useConversations.js';
import { useMessageThread } from '../hooks/useMessageThread.js';
import * as messagesApi from '../lib/messages-api.js';
import { MessageApiError, MessageNetworkError } from '../lib/messages-api.js';
import * as uuidLib from '../lib/uuid.js';

const CHILD_ID = '11111111-1111-4111-8111-111111111111';
const CAREGIVER_ID = '22222222-2222-4222-8222-222222222222';
const PROF_ID = '33333333-3333-4333-8333-333333333333';

function renderHook<T>(fn: () => T): T {
  runtime.index = 0;
  runtime.refIndex = 0;
  return fn();
}

describe('useConversations (NK-50)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    runtime.slots.length = 0;
    runtime.refs.length = 0;
  });

  it('inicia cargando y calcula el total de mensajes no leidos', async () => {
    const conversations = [
      {
        childId: CHILD_ID,
        participant: {
          userId: PROF_ID,
          firstName: 'Laura',
          lastName: 'Pérez',
          role: 'PROFESSIONAL' as const,
          specialty: 'nutrition',
        },
        lastMessage: {
          id: '44444444-4444-4444-8444-444444444441',
          childId: CHILD_ID,
          senderId: PROF_ID,
          recipientId: CAREGIVER_ID,
          kind: 'message' as const,
          body: 'Hola',
          sentAt: '2026-11-14T09:40:00.000Z',
          readAt: null,
        },
        unreadCount: 2,
      },
      {
        childId: '11111111-1111-4111-8111-111111111112',
        participant: {
          userId: '33333333-3333-4333-8333-333333333334',
          firstName: 'Ana',
          lastName: 'Torres',
          role: 'PROFESSIONAL' as const,
          specialty: 'nursing',
        },
        lastMessage: {
          id: '44444444-4444-4444-8444-444444444442',
          childId: '11111111-1111-4111-8111-111111111112',
          senderId: '33333333-3333-4333-8333-333333333334',
          recipientId: CAREGIVER_ID,
          kind: 'message' as const,
          body: 'Nos vemos',
          sentAt: '2026-11-13T10:00:00.000Z',
          readAt: null,
        },
        unreadCount: 1,
      },
    ];

    expect(renderHook(() => useConversations()).loading).toBe(true);
    vi.spyOn(messagesApi, 'fetchConversations').mockResolvedValue(conversations);

    await renderHook(() => useConversations()).reload();
    const state = renderHook(() => useConversations());

    expect(state.loading).toBe(false);
    expect(state.conversations).toHaveLength(2);
    expect(state.unreadTotal).toBe(3);
    expect(state.error).toBeNull();
  });

  it('expone error cuando falla la carga y mantiene refreshing en false', async () => {
    vi.spyOn(messagesApi, 'fetchConversations').mockRejectedValue(new MessageNetworkError());

    await renderHook(() => useConversations()).reload();
    const state = renderHook(() => useConversations());

    expect(state.loading).toBe(false);
    expect(state.refreshing).toBe(false);
    expect(state.error).toContain('No hay conexión');
  });
});

describe('useMessageThread (NK-50)', () => {
  const params = {
    childId: CHILD_ID,
    withUserId: PROF_ID,
    currentUserId: CAREGIVER_ID,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    runtime.slots.length = 0;
    runtime.refs.length = 0;
  });

  it('ordena el hilo cronologicamente ascendente y marca como leido al abrir', async () => {
    const newest = {
      id: '44444444-4444-4444-8444-444444444442',
      childId: CHILD_ID,
      senderId: PROF_ID,
      recipientId: CAREGIVER_ID,
      kind: 'message' as const,
      body: 'Segundo mensaje',
      sentAt: '2026-11-14T09:40:00.000Z',
      readAt: null,
    };
    const oldest = {
      id: '44444444-4444-4444-8444-444444444441',
      childId: CHILD_ID,
      senderId: CAREGIVER_ID,
      recipientId: PROF_ID,
      kind: 'message' as const,
      body: 'Primer mensaje',
      sentAt: '2026-11-14T09:30:00.000Z',
      readAt: '2026-11-14T09:35:00.000Z',
    };

    vi.spyOn(messagesApi, 'fetchMessages').mockResolvedValue({
      items: [newest, oldest],
      nextCursor: 'cursor-1',
    });
    const markSpy = vi.spyOn(messagesApi, 'markThreadReadApi').mockResolvedValue({ updated: 1 });

    await renderHook(() => useMessageThread(params)).reload();
    const state = renderHook(() => useMessageThread(params));

    expect(state.messages.map((m) => m.id)).toEqual([oldest.id, newest.id]);
    expect(state.hasMore).toBe(true);
    expect(markSpy).toHaveBeenCalledWith({ childId: CHILD_ID, withUserId: PROF_ID });
  });

  it('carga paginas anteriores con loadOlder sin duplicar mensajes', async () => {
    const m2 = {
      id: '44444444-4444-4444-8444-444444444442',
      childId: CHILD_ID,
      senderId: PROF_ID,
      recipientId: CAREGIVER_ID,
      kind: 'message' as const,
      body: 'Reciente',
      sentAt: '2026-11-14T09:40:00.000Z',
      readAt: null,
    };
    const m1 = {
      id: '44444444-4444-4444-8444-444444444441',
      childId: CHILD_ID,
      senderId: CAREGIVER_ID,
      recipientId: PROF_ID,
      kind: 'message' as const,
      body: 'Anterior',
      sentAt: '2026-11-14T08:00:00.000Z',
      readAt: null,
    };

    const fetchSpy = vi
      .spyOn(messagesApi, 'fetchMessages')
      .mockResolvedValueOnce({ items: [m2], nextCursor: m2.id })
      .mockResolvedValueOnce({ items: [m1], nextCursor: null });
    vi.spyOn(messagesApi, 'markThreadReadApi').mockResolvedValue({ updated: 0 });

    await renderHook(() => useMessageThread(params)).reload();
    await renderHook(() => useMessageThread(params)).loadOlder();
    const state = renderHook(() => useMessageThread(params));

    expect(fetchSpy).toHaveBeenNthCalledWith(2, {
      childId: CHILD_ID,
      withUserId: PROF_ID,
      cursor: m2.id,
      limit: 30,
    });
    expect(state.messages.map((m) => m.id)).toEqual([m1.id, m2.id]);
    expect(state.hasMore).toBe(false);
  });

  it('envia de forma optimista y reutiliza el mismo id al reintentar tras error de red', async () => {
    vi.spyOn(messagesApi, 'fetchMessages').mockResolvedValue({ items: [], nextCursor: null });
    vi.spyOn(messagesApi, 'markThreadReadApi').mockResolvedValue({ updated: 0 });
    const generatedId = '99999999-9999-4999-8999-999999999999';
    const uuidSpy = vi.spyOn(uuidLib, 'generateUuid').mockReturnValue(generatedId);

    const saved = {
      id: generatedId,
      childId: CHILD_ID,
      senderId: CAREGIVER_ID,
      recipientId: PROF_ID,
      kind: 'message' as const,
      body: 'Hola doctora',
      sentAt: '2026-11-14T10:00:00.000Z',
      readAt: null,
    };

    const sendSpy = vi
      .spyOn(messagesApi, 'sendMessageApi')
      .mockRejectedValueOnce(new MessageNetworkError())
      .mockResolvedValueOnce(saved);

    await renderHook(() => useMessageThread(params)).reload();

    const firstOk = await renderHook(() => useMessageThread(params)).send('  Hola doctora  ');
    expect(firstOk).toBe(false);

    const afterFail = renderHook(() => useMessageThread(params));
    expect(afterFail.sendError).toContain('No hay conexión');
    expect(afterFail.messages).toHaveLength(1);
    expect(afterFail.messages[0]?.id).toBe(generatedId);
    expect(afterFail.messages[0]?.sendStatus).toBe('failed');

    const retryOk = await renderHook(() => useMessageThread(params)).retryMessage(generatedId);
    expect(retryOk).toBe(true);

    const afterSuccess = renderHook(() => useMessageThread(params));
    expect(afterSuccess.sendError).toBeNull();
    expect(afterSuccess.messages).toHaveLength(1);
    expect(afterSuccess.messages[0]?.sendStatus).toBeUndefined();
    expect(uuidSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenNthCalledWith(1, {
      id: generatedId,
      childId: CHILD_ID,
      recipientId: PROF_ID,
      body: 'Hola doctora',
    });
    expect(sendSpy).toHaveBeenNthCalledWith(2, {
      id: generatedId,
      childId: CHILD_ID,
      recipientId: PROF_ID,
      body: 'Hola doctora',
    });
  });

  it('reutiliza el mismo id si se vuelve a llamar send con el mismo texto fallido', async () => {
    vi.spyOn(messagesApi, 'fetchMessages').mockResolvedValue({ items: [], nextCursor: null });
    vi.spyOn(messagesApi, 'markThreadReadApi').mockResolvedValue({ updated: 0 });
    const generatedId = '99999999-9999-4999-8999-999999999991';
    vi.spyOn(uuidLib, 'generateUuid').mockReturnValue(generatedId);

    const sendSpy = vi
      .spyOn(messagesApi, 'sendMessageApi')
      .mockRejectedValueOnce(new MessageNetworkError())
      .mockResolvedValueOnce({
        id: generatedId,
        childId: CHILD_ID,
        senderId: CAREGIVER_ID,
        recipientId: PROF_ID,
        kind: 'message',
        body: 'Consulta',
        sentAt: '2026-11-14T10:00:00.000Z',
        readAt: null,
      });

    await renderHook(() => useMessageThread(params)).reload();
    await renderHook(() => useMessageThread(params)).send('Consulta');
    await renderHook(() => useMessageThread(params)).send('Consulta');

    expect(sendSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: generatedId }));
    expect(sendSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: generatedId }));
    expect(renderHook(() => useMessageThread(params)).messages).toHaveLength(1);
  });

  it('expone mensaje claro en 403 al enviar y no envia vacios', async () => {
    vi.spyOn(messagesApi, 'fetchMessages').mockResolvedValue({ items: [], nextCursor: null });
    vi.spyOn(messagesApi, 'markThreadReadApi').mockResolvedValue({ updated: 0 });
    const sendSpy = vi
      .spyOn(messagesApi, 'sendMessageApi')
      .mockRejectedValue(new MessageApiError('Sin consentimiento vigente', 403));

    await renderHook(() => useMessageThread(params)).reload();

    expect(await renderHook(() => useMessageThread(params)).send('   ')).toBe(false);
    expect(sendSpy).not.toHaveBeenCalled();

    const ok = await renderHook(() => useMessageThread(params)).send('Hola');
    expect(ok).toBe(false);
    expect(renderHook(() => useMessageThread(params)).sendError).toBe('Sin consentimiento vigente');
  });

  it('refresca silenciosamente y marca como leido si llegan mensajes nuevos del otro', async () => {
    const incoming = {
      id: '44444444-4444-4444-8444-444444444449',
      childId: CHILD_ID,
      senderId: PROF_ID,
      recipientId: CAREGIVER_ID,
      kind: 'message' as const,
      body: 'Nuevo mensaje del profesional',
      sentAt: '2026-11-14T11:00:00.000Z',
      readAt: null,
    };

    vi.spyOn(messagesApi, 'fetchMessages')
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValueOnce({ items: [incoming], nextCursor: null });
    const markSpy = vi.spyOn(messagesApi, 'markThreadReadApi').mockResolvedValue({ updated: 1 });

    await renderHook(() => useMessageThread(params)).reload();
    await renderHook(() => useMessageThread(params)).refreshSilent();

    expect(markSpy).toHaveBeenCalledTimes(2);
    expect(renderHook(() => useMessageThread(params)).messages).toHaveLength(1);
  });
});

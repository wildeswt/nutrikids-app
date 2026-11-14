import { CreateFollowUpInputSchema, FollowUpTypeSchema, UuidSchema } from '@nutrikids/shared';
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';
import type { FollowUpFormData } from './follow-up-form.js';

/**
 * Follow-ups kept on the phone (NK-34): drafts the professional saved, and follow-ups saved
 * without connection that wait to be sent. Everything is clinical text, so it goes to SecureStore
 * (encrypted by the device), scoped by user.
 *
 * ponytail: one JSON value with both lists, read-modify-write through a queue. NK-27 (SQLite and
 * the general sync queue) replaces this when it lands; the callers only use the functions below.
 */
export const FOLLOW_UP_STORAGE_KEY = 'nutrikids.followups';

const DraftSchema = z.object({
  userId: UuidSchema,
  childId: UuidSchema,
  alertId: UuidSchema.optional(),
  form: z.object({
    type: FollowUpTypeSchema.nullable(),
    details: z.string(),
    nextCheckupText: z.string(),
    establish: z.boolean(),
  }),
  savedAt: z.string(),
  /** Why the server refused this follow-up when it was sent from the queue. */
  lastError: z.string().optional(),
});

const PendingSchema = z.object({
  userId: UuidSchema,
  childId: UuidSchema,
  alertId: UuidSchema.optional(),
  /** Move the alert to «seguimiento establecido» after the follow-up is saved. */
  establish: z.boolean(),
  input: CreateFollowUpInputSchema,
  queuedAt: z.string(),
});

const StoreSchema = z.object({
  drafts: z.record(z.string(), DraftSchema),
  pending: z.array(PendingSchema),
});

export type FollowUpDraft = z.infer<typeof DraftSchema>;
export type PendingFollowUp = z.infer<typeof PendingSchema>;
type Store = z.infer<typeof StoreSchema>;

const memoryStorage = new Map<string, string>();

async function hasSecureStore(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

async function readRaw(): Promise<string | null> {
  if (await hasSecureStore()) {
    return SecureStore.getItemAsync(FOLLOW_UP_STORAGE_KEY, SECURE_STORE_OPTIONS);
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem(FOLLOW_UP_STORAGE_KEY);
  }
  return memoryStorage.get(FOLLOW_UP_STORAGE_KEY) ?? null;
}

async function writeRaw(value: string): Promise<void> {
  if (await hasSecureStore()) {
    await SecureStore.setItemAsync(FOLLOW_UP_STORAGE_KEY, value, SECURE_STORE_OPTIONS);
  } else if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(FOLLOW_UP_STORAGE_KEY, value);
  } else {
    memoryStorage.set(FOLLOW_UP_STORAGE_KEY, value);
  }
}

async function readStore(): Promise<Store> {
  try {
    const raw = await readRaw();
    if (!raw) return { drafts: {}, pending: [] };
    const parsed = StoreSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : { drafts: {}, pending: [] };
  } catch {
    // Unreadable data is treated as empty; it is replaced on the next write.
    return { drafts: {}, pending: [] };
  }
}

/** Operations run one after another so two read-modify-writes never overwrite each other. */
let queue: Promise<unknown> = Promise.resolve();

function update<T>(change: (store: Store) => T): Promise<T> {
  const run = async (): Promise<T> => {
    const store = await readStore();
    const result = change(store);
    await writeRaw(JSON.stringify(store));
    return result;
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

/** Where a follow-up draft lives: the alert it answers, or the child when there is no alert. */
export function draftKey(
  userId: string,
  target: { alertId?: string | undefined; childId: string },
): string {
  return `${userId}:${target.alertId ? `alert:${target.alertId}` : `child:${target.childId}`}`;
}

export async function getDraft(key: string): Promise<FollowUpDraft | null> {
  const store = await readStore();
  return store.drafts[key] ?? null;
}

export function saveDraft(
  key: string,
  draft: {
    userId: string;
    childId: string;
    alertId?: string | undefined;
    form: FollowUpFormData;
    lastError?: string | undefined;
  },
  now: Date = new Date(),
): Promise<void> {
  return update((store) => {
    const { alertId, lastError, ...rest } = draft;
    store.drafts[key] = {
      ...rest,
      ...(alertId ? { alertId } : {}),
      ...(lastError ? { lastError } : {}),
      savedAt: now.toISOString(),
    };
  });
}

export function clearDraft(key: string): Promise<void> {
  return update((store) => {
    delete store.drafts[key];
  });
}

/** Removes every draft (the sign-out cleanup); queued follow-ups are kept so they are not lost. */
export function clearDrafts(): Promise<void> {
  return update((store) => {
    store.drafts = {};
  });
}

export async function listPending(userId: string): Promise<PendingFollowUp[]> {
  const store = await readStore();
  return store.pending.filter((entry) => entry.userId === userId);
}

/** Queues a follow-up; queuing the same follow-up `id` again replaces it instead of repeating it. */
export function addPending(entry: Omit<PendingFollowUp, 'queuedAt'>, now = new Date()) {
  return update((store) => {
    store.pending = store.pending.filter((item) => item.input.id !== entry.input.id);
    store.pending.push({ ...entry, queuedAt: now.toISOString() });
  });
}

export function removePending(followUpId: string): Promise<void> {
  return update((store) => {
    store.pending = store.pending.filter((item) => item.input.id !== followUpId);
  });
}

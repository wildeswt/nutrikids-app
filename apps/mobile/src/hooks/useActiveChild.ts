import { useSyncExternalStore } from 'react';

let activeChildId: string | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): string | null {
  return activeChildId;
}

/**
 * Updates the caregiver's currently selected active child across Home and My Children screens.
 */
export function setActiveChildId(childId: string | null): void {
  if (activeChildId === childId) return;
  activeChildId = childId;
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Subscribes to the caregiver's currently selected active child ID.
 */
export function useActiveChildId(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

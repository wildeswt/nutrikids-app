import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSyncStatus, type UseSyncStatusResult } from '../hooks/useSyncStatus.js';
import { syncEngine } from '../lib/sync/index.js';

describe('useSyncStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('expone el estado actual del motor y delega syncNow al motor compartido', async () => {
    vi.spyOn(syncEngine, 'getSyncState').mockReturnValue({
      pending: 3,
      sending: 1,
      error: 2,
      lastSyncedAt: '2026-11-14T15:00:00.000Z',
    });
    const syncNowSpy = vi.spyOn(syncEngine, 'syncNow').mockResolvedValue();

    let captured!: UseSyncStatusResult;
    function Consumer() {
      captured = useSyncStatus();
      return null;
    }

    renderToString(React.createElement(Consumer));

    expect(captured.pending).toBe(3);
    expect(captured.sending).toBe(1);
    expect(captured.error).toBe(2);
    expect(captured.lastSyncedAt).toBe('2026-11-14T15:00:00.000Z');

    await captured.syncNow();
    expect(syncNowSpy).toHaveBeenCalledTimes(1);
  });
});

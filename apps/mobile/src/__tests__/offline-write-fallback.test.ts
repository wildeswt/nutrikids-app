import { describe, expect, it, vi } from 'vitest';
import { executeOfflineWriteFallback } from '../lib/offline-read.js';

describe('executeOfflineWriteFallback when flagged offline', () => {
  it('queues locally when the local queue works', async () => {
    const sendRemote = vi.fn();
    const result = await executeOfflineWriteFallback({
      isOnline: false,
      sendRemote,
      persistLocally: async () => 'local',
    });
    expect(result).toBe('local');
    expect(sendRemote).not.toHaveBeenCalled();
  });

  it('tries the server when there is no local queue (web)', async () => {
    const result = await executeOfflineWriteFallback({
      isOnline: false,
      sendRemote: async () => 'remote',
      persistLocally: async () => {
        throw new Error('no local db');
      },
    });
    expect(result).toBe('remote');
  });

  it('reports the local error when the server is unreachable too', async () => {
    await expect(
      executeOfflineWriteFallback({
        isOnline: false,
        sendRemote: async () => {
          throw new Error('fetch failed');
        },
        persistLocally: async () => {
          throw new Error('no local db');
        },
      }),
    ).rejects.toThrow('no local db');
  });
});

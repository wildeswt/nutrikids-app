import NetInfo, { NetInfoStateType, type NetInfoState } from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getConnectivity,
  resolveConnectivityStatus,
  subscribeToConnectivity,
  type ConnectivityStatus,
} from '../lib/connectivity.js';

function makeNetInfoState(
  overrides: Partial<Pick<NetInfoState, 'type' | 'isConnected' | 'isInternetReachable'>>,
): NetInfoState {
  return {
    type: overrides.type ?? NetInfoStateType.wifi,
    isConnected: overrides.isConnected ?? true,
    isInternetReachable:
      overrides.isInternetReachable === undefined ? true : overrides.isInternetReachable,
    details: { isConnectionExpensive: false },
  } as NetInfoState;
}

describe('connectivity', () => {
  const originalOs = Platform.OS;
  beforeEach(() => {
    vi.clearAllMocks();
    Platform.OS = 'android';
  });
  afterEach(() => {
    Platform.OS = originalOs;
  });

  it('on web ignores a failed internet-reachability ping (only isConnected counts)', () => {
    Platform.OS = 'web';
    expect(resolveConnectivityStatus({ isConnected: true, isInternetReachable: false })).toBe(
      'online',
    );
    expect(resolveConnectivityStatus({ isConnected: false, isInternetReachable: true })).toBe(
      'offline',
    );
  });

  describe('resolveConnectivityStatus', () => {
    it('returns online when isConnected is true and isInternetReachable is true', () => {
      expect(resolveConnectivityStatus({ isConnected: true, isInternetReachable: true })).toBe(
        'online',
      );
    });

    it('returns online when isConnected is true and isInternetReachable is null', () => {
      expect(resolveConnectivityStatus({ isConnected: true, isInternetReachable: null })).toBe(
        'online',
      );
    });

    it('returns offline when isConnected is true but isInternetReachable is false', () => {
      expect(resolveConnectivityStatus({ isConnected: true, isInternetReachable: false })).toBe(
        'offline',
      );
    });

    it('returns offline when isConnected is false or null', () => {
      expect(resolveConnectivityStatus({ isConnected: false, isInternetReachable: false })).toBe(
        'offline',
      );
      expect(resolveConnectivityStatus({ isConnected: false, isInternetReachable: null })).toBe(
        'offline',
      );
      expect(resolveConnectivityStatus({ isConnected: null, isInternetReachable: null })).toBe(
        'offline',
      );
    });
  });

  describe('getConnectivity', () => {
    it('returns online when NetInfo.fetch reports an active reachable connection', async () => {
      vi.mocked(NetInfo.fetch).mockResolvedValueOnce(
        makeNetInfoState({ isConnected: true, isInternetReachable: true }),
      );

      await expect(getConnectivity()).resolves.toBe('online');
    });

    it('returns offline when NetInfo.fetch reports no internet reachability', async () => {
      vi.mocked(NetInfo.fetch).mockResolvedValueOnce(
        makeNetInfoState({ isConnected: true, isInternetReachable: false }),
      );

      await expect(getConnectivity()).resolves.toBe('offline');
    });
  });

  describe('subscribeToConnectivity', () => {
    it('emits online/offline transitions from NetInfo and unsubscribes cleanly', () => {
      const received: ConnectivityStatus[] = [];
      const unsubscribe = subscribeToConnectivity((status) => {
        received.push(status);
      });

      expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);
      const registeredHandler = vi.mocked(NetInfo.addEventListener).mock.calls[0]?.[0];
      expect(registeredHandler).toBeDefined();

      registeredHandler!(makeNetInfoState({ isConnected: true, isInternetReachable: null }));
      registeredHandler!(
        makeNetInfoState({
          type: NetInfoStateType.none,
          isConnected: false,
          isInternetReachable: false,
        }),
      );
      registeredHandler!(makeNetInfoState({ isConnected: true, isInternetReachable: true }));

      expect(received).toEqual(['online', 'offline', 'online']);

      unsubscribe();
    });
  });
});

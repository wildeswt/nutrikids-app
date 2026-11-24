import type * as ReactTypes from 'react';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Platform } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hookStore = vi.hoisted(() => ({
  enabled: false,
  states: [] as unknown[],
  cursor: 0,
  reset() {
    this.enabled = false;
    this.states = [];
    this.cursor = 0;
  },
  rewind() {
    this.cursor = 0;
  },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactTypes>();
  return {
    ...actual,
    useState<T>(initial: T | (() => T)) {
      if (!hookStore.enabled) {
        return actual.useState(initial);
      }
      const idx = hookStore.cursor++;
      if (!(idx in hookStore.states)) {
        hookStore.states[idx] = typeof initial === 'function' ? (initial as () => T)() : initial;
      }
      const setState = (updater: T | ((prev: T) => T)) => {
        const prev = hookStore.states[idx] as T;
        hookStore.states[idx] =
          typeof updater === 'function' ? (updater as (prev: T) => T)(prev) : updater;
      };
      return [hookStore.states[idx] as T, setState] as const;
    },
  };
});

import WebDatePicker, { isIsoDateInBounds } from '../components/ui/DatePicker.web.js';
import { RecoveryCodesList } from '../components/RecoveryCodesList.js';
import {
  clearReferralDraft,
  loadReferralDraft,
  saveReferralDraft,
  EMPTY_REFERRAL_FORM,
} from '../lib/referral-form.js';
import {
  deleteDatabaseKey,
  getDatabaseKey,
  openEncryptedDatabase,
} from '../lib/local-db/encrypted-db.web.js';
import { wipeLocalData } from '../lib/local-db/wipe.web.js';
import {
  purgeSensitiveWebStorage,
  readSensitiveWebItem,
  removeSensitiveWebItem,
  writeSensitiveWebItem,
} from '../lib/web-storage.js';

interface TreeNode {
  type?: unknown;
  props?: {
    testID?: string;
    disabled?: boolean;
    onPress?: () => unknown;
    onChange?: (event: { target: { value: string } }) => void;
    children?: unknown;
    [key: string]: unknown;
  };
}

function findNode(node: unknown, predicate: (n: TreeNode) => boolean): TreeNode | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
    return null;
  }
  const el = node as TreeNode;
  if (predicate(el)) return el;
  return findNode(el.props?.children, predicate);
}

function renderTree(renderFn: () => unknown): unknown {
  hookStore.rewind();
  let tree: unknown = null;
  function Wrapper() {
    tree = renderFn();
    return null;
  }
  renderToString(React.createElement(Wrapper));
  return tree;
}

function createMemoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
  };
}

describe('web export compatibility', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    hookStore.reset();
  });

  afterEach(() => {
    Platform.OS = originalOS;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('DatePicker.web', () => {
    it('renders HTML date input with bounds and emits set/dismissed events', () => {
      hookStore.enabled = true;
      const onChange = vi.fn();
      const value = new Date(2025, 4, 15);
      const min = new Date(2021, 0, 1);
      const max = new Date(2026, 11, 31);

      const props = {
        value,
        minimumDate: min,
        maximumDate: max,
        onChange,
        testID: 'web-picker',
      };

      let tree = renderTree(() => WebDatePicker(props));
      const input = findNode(tree, (n) => n.props?.['data-testid'] === 'web-picker-input');
      expect(input).not.toBeNull();
      expect(input?.props?.['type']).toBe('date');
      expect(input?.props?.['value']).toBe('2025-05-15');
      expect(input?.props?.['min']).toBe('2021-01-01');
      expect(input?.props?.['max']).toBe('2026-12-31');

      input?.props?.onChange?.({ target: { value: '2024-03-08' } });
      tree = renderTree(() => WebDatePicker(props));

      const confirm = findNode(tree, (n) => n.props?.testID === 'web-picker-confirm');
      expect(confirm?.props?.disabled).toBe(false);
      confirm?.props?.onPress?.();

      expect(onChange).toHaveBeenCalledTimes(1);
      const [evt, picked] = onChange.mock.calls[0] as [{ type: string }, Date];
      expect(evt.type).toBe('set');
      expect(picked.getFullYear()).toBe(2024);
      expect(picked.getMonth()).toBe(2);
      expect(picked.getDate()).toBe(8);

      const cancel = findNode(tree, (n) => n.props?.testID === 'web-picker-cancel');
      cancel?.props?.onPress?.();
      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'dismissed' }));
    });

    it('disables confirmation when date is outside min/max bounds', () => {
      hookStore.enabled = true;
      const onChange = vi.fn();
      const props = {
        value: new Date(2025, 4, 15),
        minimumDate: new Date(2024, 0, 1),
        maximumDate: new Date(2026, 0, 1),
        onChange,
        testID: 'bounds-picker',
      };

      let tree = renderTree(() => WebDatePicker(props));
      const input = findNode(tree, (n) => n.props?.['data-testid'] === 'bounds-picker-input');
      input?.props?.onChange?.({ target: { value: '2020-05-01' } });
      tree = renderTree(() => WebDatePicker(props));

      const confirm = findNode(tree, (n) => n.props?.testID === 'bounds-picker-confirm');
      expect(confirm?.props?.disabled).toBe(true);
      expect(isIsoDateInBounds('2020-05-01', '2024-01-01', '2026-01-01')).toBe(false);
    });
  });

  describe('web-storage & referral-form on web', () => {
    it('stores sensitive items in sessionStorage, cleans localStorage, and preserves non-PII keys on purge', async () => {
      const sessionStorage = createMemoryStorage();
      const localStorage = createMemoryStorage({
        'nutrikids.language': 'qu',
        'nutrikids.education.es': '{"articles":[]}',
        'nutrikids.localDb.pendingWipe': '1',
        'nutrikids.auth.session': 'legacy',
      });
      vi.stubGlobal('sessionStorage', sessionStorage);
      vi.stubGlobal('localStorage', localStorage);

      expect(writeSensitiveWebItem('nutrikids.auth.session', 'token-json')).toBe(true);
      expect(readSensitiveWebItem('nutrikids.auth.session')).toBe('token-json');
      expect(localStorage.getItem('nutrikids.auth.session')).toBeNull();

      writeSensitiveWebItem('nutrikids.followups', '{"drafts":{}}');
      purgeSensitiveWebStorage();

      expect(sessionStorage.getItem('nutrikids.auth.session')).toBeNull();
      expect(sessionStorage.getItem('nutrikids.followups')).toBeNull();
      expect(localStorage.getItem('nutrikids.language')).toBe('qu');
      expect(localStorage.getItem('nutrikids.education.es')).toBe('{"articles":[]}');
      expect(localStorage.getItem('nutrikids.localDb.pendingWipe')).toBe('1');

      removeSensitiveWebItem('nutrikids.localDb.pendingWipe');
      expect(localStorage.getItem('nutrikids.localDb.pendingWipe')).toBeNull();
    });

    it('stores referral drafts in sessionStorage on web without calling expo-file-system', async () => {
      Platform.OS = 'web';
      const sessionStorage = createMemoryStorage();
      const localStorage = createMemoryStorage();
      vi.stubGlobal('sessionStorage', sessionStorage);
      vi.stubGlobal('localStorage', localStorage);

      const userId = '44444444-4444-4444-8444-444444444444';
      await saveReferralDraft(userId, { ...EMPTY_REFERRAL_FORM, reason: 'Derivación web' });

      expect(sessionStorage.getItem(`nutrikids.referral-draft.${userId}`)).toContain(
        'Derivación web',
      );
      expect(localStorage.getItem(`nutrikids.referral-draft.${userId}`)).toBeNull();
      expect((await loadReferralDraft(userId))?.body).toBe('Derivación web');

      await clearReferralDraft(userId);
      expect(await loadReferralDraft(userId)).toBeNull();
    });
  });

  describe('RecoveryCodesList web fallback', () => {
    it('falls back to clipboard when navigator.share is unavailable on web', async () => {
      Platform.OS = 'web';
      hookStore.enabled = true;
      const writeText = vi.fn(async (_text: string) => {});
      vi.stubGlobal('navigator', { clipboard: { writeText } });

      let tree = renderTree(() => RecoveryCodesList({ codes: ['ABCD-EFGH', 'JKMN-PQRS'] }));
      const shareBtn = findNode(tree, (n) => n.props?.testID === 'share-recovery-codes');
      await shareBtn?.props?.onPress?.();

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('ABCD-EFGH\nJKMN-PQRS'));

      tree = renderTree(() => RecoveryCodesList({ codes: ['ABCD-EFGH', 'JKMN-PQRS'] }));
      const feedback = findNode(tree, (n) => n.props?.testID === 'recovery-codes-feedback');
      expect(feedback).not.toBeNull();
    });
  });

  describe('local-db web stubs', () => {
    it('throws clear error for SQLCipher operations and wipes cleanly without expo-sqlite', async () => {
      await expect(getDatabaseKey()).rejects.toThrow(/no está disponible en web/i);
      await expect(openEncryptedDatabase('nutrikids.db')).rejects.toThrow(
        /no está disponible en web/i,
      );
      await expect(deleteDatabaseKey()).resolves.toBeUndefined();
      await expect(wipeLocalData()).resolves.toBeUndefined();
    });
  });
});

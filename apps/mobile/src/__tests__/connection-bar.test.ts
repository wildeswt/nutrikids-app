import { describe, expect, it } from 'vitest';
import { deriveConnectionBarState } from '../lib/connection-bar.js';

describe('deriveConnectionBarState (NK-29)', () => {
  it('prioriza offline por encima de error, sending, pending y justSynced', () => {
    expect(
      deriveConnectionBarState({
        isOnline: false,
        pending: 2,
        sending: 1,
        error: 3,
        justSynced: true,
      }),
    ).toEqual({ kind: 'offline', count: 6 });

    expect(
      deriveConnectionBarState({
        isOnline: false,
        pending: 1,
        sending: 0,
        error: 0,
        justSynced: false,
      }),
    ).toEqual({ kind: 'offline', count: 1 });

    expect(
      deriveConnectionBarState({
        isOnline: false,
        pending: 0,
        sending: 0,
        error: 0,
        justSynced: true,
      }),
    ).toEqual({ kind: 'offline', count: 0 });
  });

  it('prioriza error sobre sending, pending y justSynced cuando hay conexión', () => {
    expect(
      deriveConnectionBarState({
        isOnline: true,
        pending: 3,
        sending: 2,
        error: 1,
        justSynced: true,
      }),
    ).toEqual({ kind: 'error', count: 1 });

    expect(
      deriveConnectionBarState({
        isOnline: true,
        pending: 0,
        sending: 0,
        error: 4,
        justSynced: false,
      }),
    ).toEqual({ kind: 'error', count: 4 });
  });

  it('muestra sending cuando hay conexión, sin errores, y sending > 0 o pending > 0', () => {
    expect(
      deriveConnectionBarState({
        isOnline: true,
        pending: 0,
        sending: 1,
        error: 0,
        justSynced: true,
      }),
    ).toEqual({ kind: 'sending', count: 1 });

    expect(
      deriveConnectionBarState({
        isOnline: true,
        pending: 2,
        sending: 0,
        error: 0,
        justSynced: false,
      }),
    ).toEqual({ kind: 'sending', count: 2 });

    expect(
      deriveConnectionBarState({
        isOnline: true,
        pending: 2,
        sending: 3,
        error: 0,
        justSynced: false,
      }),
    ).toEqual({ kind: 'sending', count: 5 });
  });

  it('muestra synced cuando hay conexión, sin pendientes ni errores y justSynced es true', () => {
    expect(
      deriveConnectionBarState({
        isOnline: true,
        pending: 0,
        sending: 0,
        error: 0,
        justSynced: true,
      }),
    ).toEqual({ kind: 'synced', count: 0 });
  });

  it('oculta la barra cuando hay conexión, sin pendientes, sin errores y sin justSynced', () => {
    expect(
      deriveConnectionBarState({
        isOnline: true,
        pending: 0,
        sending: 0,
        error: 0,
        justSynced: false,
      }),
    ).toEqual({ kind: 'hidden', count: 0 });
  });

  it('normaliza conteos negativos o no finitos como cero', () => {
    expect(
      deriveConnectionBarState({
        isOnline: true,
        pending: -2,
        sending: Number.NaN,
        error: -1,
        justSynced: false,
      }),
    ).toEqual({ kind: 'hidden', count: 0 });
  });
});

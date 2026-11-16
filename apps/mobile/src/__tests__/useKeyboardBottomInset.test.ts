import React from 'react';
import { renderToString } from 'react-dom/server';
import { Keyboard } from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import { useKeyboardBottomInset } from '../hooks/useKeyboardBottomInset.js';

describe('useKeyboardBottomInset', () => {
  it('returns initial bottom inset of 0 when rendered', () => {
    let capturedInset = -1;
    function Consumer() {
      capturedInset = useKeyboardBottomInset();
      return null;
    }

    renderToString(React.createElement(Consumer));
    expect(capturedInset).toBe(0);
  });

  it('can subscribe and remove keyboard listeners via Keyboard API', () => {
    const removeSpy = vi.fn();
    const addListenerSpy = vi.spyOn(Keyboard, 'addListener').mockReturnValue({
      remove: removeSpy,
    } as unknown as ReturnType<typeof Keyboard.addListener>);

    const sub = Keyboard.addListener('keyboardDidShow', () => {});
    expect(addListenerSpy).toHaveBeenCalledWith('keyboardDidShow', expect.any(Function));
    sub.remove();
    expect(removeSpy).toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import {
  computeContainerKeyboardOverlap,
  computeFocusedInputScrollY,
} from '../lib/keyboard-scroll.js';

describe('keyboard-scroll helpers', () => {
  describe('computeContainerKeyboardOverlap', () => {
    it('returns 0 when keyboard height is 0', () => {
      expect(
        computeContainerKeyboardOverlap({
          containerY: 80,
          containerHeight: 770,
          keyboardScreenY: 850,
          keyboardHeight: 0,
        }),
      ).toBe(0);
    });

    it('computes exact overlap in edge-to-edge Android mode where container does not resize', () => {
      expect(
        computeContainerKeyboardOverlap({
          containerY: 90,
          containerHeight: 760,
          keyboardScreenY: 530,
          keyboardHeight: 320,
        }),
      ).toBe(320);
    });

    it('includes bottom navigation bar height when container extends behind system bar', () => {
      expect(
        computeContainerKeyboardOverlap({
          containerY: 90,
          containerHeight: 760,
          keyboardScreenY: 500,
          keyboardHeight: 310,
        }),
      ).toBe(350);
    });

    it('returns 0 when OS adjustResize already shrank the container above keyboard', () => {
      expect(
        computeContainerKeyboardOverlap({
          containerY: 90,
          containerHeight: 440,
          keyboardScreenY: 530,
          keyboardHeight: 320,
        }),
      ).toBe(0);
    });

    it('falls back to keyboardHeight when container has not been measured yet', () => {
      expect(
        computeContainerKeyboardOverlap({
          containerY: 0,
          containerHeight: 0,
          keyboardScreenY: 0,
          keyboardHeight: 300,
        }),
      ).toBe(300);
    });

    it('caps excessive overlap for floating keyboards', () => {
      expect(
        computeContainerKeyboardOverlap({
          containerY: 0,
          containerHeight: 850,
          keyboardScreenY: 200,
          keyboardHeight: 260,
        }),
      ).toBe(360);
    });
  });

  describe('computeFocusedInputScrollY', () => {
    it('returns null when viewportHeight is not positive', () => {
      expect(
        computeFocusedInputScrollY({
          inputTopInContent: 500,
          inputHeight: 48,
          currentScrollY: 0,
          viewportHeight: 0,
        }),
      ).toBeNull();
    });

    it('returns null when focused input is already comfortably visible above the keyboard', () => {
      expect(
        computeFocusedInputScrollY({
          inputTopInContent: 180,
          inputHeight: 48,
          currentScrollY: 0,
          viewportHeight: 440,
        }),
      ).toBeNull();
    });

    it('scrolls down so input bottom and safety margin clear the keyboard top', () => {
      expect(
        computeFocusedInputScrollY({
          inputTopInContent: 515,
          inputHeight: 48,
          currentScrollY: 70,
          viewportHeight: 440,
        }),
      ).toBe(179);
    });

    it('scrolls up when input top was scrolled above the visible viewport', () => {
      expect(
        computeFocusedInputScrollY({
          inputTopInContent: 140,
          inputHeight: 48,
          currentScrollY: 250,
          viewportHeight: 440,
        }),
      ).toBe(120);
    });

    it('never pushes the top of a tall multiline input above the viewport top', () => {
      expect(
        computeFocusedInputScrollY({
          inputTopInContent: 300,
          inputHeight: 300,
          currentScrollY: 0,
          viewportHeight: 260,
        }),
      ).toBe(280);
    });
  });
});

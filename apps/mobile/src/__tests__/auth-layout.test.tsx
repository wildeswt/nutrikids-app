import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-router', () => ({
  Stack: Object.assign(
    (props: { children: React.ReactNode }) => React.createElement('mock-stack', props),
    {
      Screen: (props: { name: string; options?: Record<string, unknown> }) =>
        React.createElement('mock-stack-screen', props),
    },
  ),
}));

import AuthLayout from '../app/(auth)/_layout.js';

interface StackScreenElement {
  props: {
    name: string;
    options?: Record<string, unknown>;
  };
}

describe('AuthLayout', () => {
  it('registers all required authentication routes', () => {
    const layout = AuthLayout();
    const screens = React.Children.toArray(layout.props.children) as StackScreenElement[];
    const names = screens.map((s) => s.props.name);

    expect(names).toEqual([
      'welcome',
      'select-role',
      'login',
      'register',
      'forgot-password',
      'reset-password',
    ]);
  });
});

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ConnectionProvider,
  useConnection,
  type ConnectionContextValue,
} from '../context/connection-context.js';

describe('connection-context', () => {
  it('devuelve online por defecto cuando useConnection se usa sin ConnectionProvider', () => {
    let captured: ConnectionContextValue | null = null;

    function Consumer() {
      captured = useConnection();
      return null;
    }

    renderToString(React.createElement(Consumer));

    expect(captured).toEqual({
      status: 'online',
      isOnline: true,
    });
  });

  it('provee el estado de conectividad dentro de ConnectionProvider', () => {
    let captured: ConnectionContextValue | null = null;

    function Consumer() {
      captured = useConnection();
      return null;
    }

    renderToString(React.createElement(ConnectionProvider, null, React.createElement(Consumer)));

    expect(captured).toEqual({
      status: 'online',
      isOnline: true,
    });
  });
});

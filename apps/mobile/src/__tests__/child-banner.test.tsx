import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChildBanner } from '../components/ChildBanner.js';

describe('ChildBanner', () => {
  it('shows the child name and the subtitle', () => {
    const html = renderToString(
      React.createElement(ChildBanner, {
        name: 'Mateo José Rodríguez',
        subtitle: '3 años y 5 meses',
      }),
    );

    expect(html).toContain('Mateo José Rodríguez');
    expect(html).toContain('3 años y 5 meses');
  });

  it('renders only the name when there is no subtitle', () => {
    const html = renderToString(React.createElement(ChildBanner, { name: 'Valentina Rodríguez' }));

    expect(html).toContain('Valentina Rodríguez');
    expect(html).not.toContain('undefined');
  });

  it('does not render an avatar or initials (the app stores no photos of children)', () => {
    const html = renderToString(React.createElement(ChildBanner, { name: 'Mateo José Rodríguez' }));

    expect(html).not.toContain('>MR<');
  });
});

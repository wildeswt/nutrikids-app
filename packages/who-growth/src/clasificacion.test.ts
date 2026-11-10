import { describe, expect, it } from 'vitest';
import { RIESGOS_T, clasificar } from './clasificacion.js';

describe('límites en P/T', () => {
  it.each([
    [-3.0, 'emaciacion'],
    [-3.01, 'desnutricion_aguda_grave'],
    [-2.01, 'emaciacion'],
    [-2.0, 'normal'],
    [2.0, 'normal'],
    [2.01, 'sobrepeso'],
  ] as const)('zPT = %f → %s', (zPT, esperado) => {
    expect(clasificar({ zPT }).principal).toBe(esperado);
  });

  it('desnutrición aguda grave tiene prioridad sobre emaciación (solo emite la grave)', () => {
    const r = clasificar({ zPT: -3.5 });
    expect(r.categorias).toEqual(['desnutricion_aguda_grave']);
  });
});

describe('límites en T/E', () => {
  it.each([
    [-3.0, 'retraso_crecimiento'],
    [-3.01, 'retraso_grave'],
    [-2.01, 'retraso_crecimiento'],
    [-2.0, 'normal'],
    [2.01, 'normal'],
  ] as const)('zTE = %f → %s', (zTE, esperado) => {
    expect(clasificar({ zTE }).principal).toBe(esperado);
  });
});

describe('límites en P/E', () => {
  it.each([
    [-3.0, 'bajo_peso'],
    [-3.01, 'bajo_peso_grave'],
    [-2.01, 'bajo_peso'],
    [-2.0, 'normal'],
  ] as const)('zPE = %f → %s', (zPE, esperado) => {
    expect(clasificar({ zPE }).principal).toBe(esperado);
  });
});

describe('límites en IMC/E', () => {
  it.each([
    [1.0, ['normal']],
    [1.01, ['riesgo_sobrepeso']],
    [2.0, ['riesgo_sobrepeso']],
    [3.0, ['riesgo_sobrepeso']],
    [3.01, ['obesidad', 'riesgo_sobrepeso']],
  ] as const)('zIMCE = %f (criterio PT por defecto)', (zIMCE, esperado) => {
    expect(clasificar({ zIMCE }).categorias).toEqual(esperado);
  });
});

describe('criterio de sobrepeso configurable', () => {
  it('por defecto IMC/E > +2 NO genera sobrepeso (lo hace P/T)', () => {
    expect(clasificar({ zIMCE: 2.5 }).categorias).not.toContain('sobrepeso');
    expect(clasificar({ zPT: 2.5 }).alerta).toBe(true);
  });

  it("criterioSobrepeso 'IMCE': solo IMC/E > +2", () => {
    const pc = { criterioSobrepeso: 'IMCE' } as const;
    expect(clasificar({ zIMCE: 2.0 }, pc).categorias).not.toContain('sobrepeso');
    expect(clasificar({ zIMCE: 2.01 }, pc).categorias).toContain('sobrepeso');
    expect(clasificar({ zPT: 2.5 }, pc).categorias).toEqual(['normal']);
  });

  it("criterioSobrepeso 'ambos': cualquiera de los dos", () => {
    const pc = { criterioSobrepeso: 'ambos' } as const;
    expect(clasificar({ zPT: 2.5 }, pc).categorias).toContain('sobrepeso');
    expect(clasificar({ zIMCE: 2.5 }, pc).categorias).toContain('sobrepeso');
    expect(clasificar({ zPT: 1, zIMCE: 1 }, pc).categorias).toEqual(['normal']);
  });
});

describe('combinaciones y prioridad', () => {
  it('devuelve todas las categorías ordenadas por prioridad', () => {
    const r = clasificar({ zPT: -3.2, zTE: -2.5, zPE: -3.1 });
    expect(r.categorias).toEqual([
      'desnutricion_aguda_grave',
      'bajo_peso_grave',
      'retraso_crecimiento',
    ]);
    expect(r.principal).toBe('desnutricion_aguda_grave');
    expect(r.alerta).toBe(true);
  });

  it('sin datos o todo normal → normal sin alerta', () => {
    expect(clasificar({})).toEqual({ categorias: ['normal'], principal: 'normal', alerta: false });
    expect(clasificar({ zPE: 0, zTE: 0, zPT: 0, zIMCE: 0 }).alerta).toBe(false);
  });

  it('ignora z nulos o no finitos', () => {
    expect(clasificar({ zPT: null, zTE: NaN }).principal).toBe('normal');
  });

  it('puntos de corte personalizados', () => {
    expect(clasificar({ zPT: -1.6 }, { emaciacionPT: -1.5 }).principal).toBe('emaciacion');
    expect(clasificar({ zPT: -2.5 }, { desnutricionAgudaGravePT: -2.4 }).principal).toBe(
      'desnutricion_aguda_grave',
    );
  });

  it('RIESGOS_T cubre todos los valores', () => {
    expect(new Set(RIESGOS_T).size).toBe(10);
  });
});

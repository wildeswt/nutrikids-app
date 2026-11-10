export type FechaEntrada = Date | string;

function aPartesUTC(f: FechaEntrada): { y: number; m: number; d: number } {
  if (typeof f === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(f);
    if (!match) throw new RangeError(`Fecha inválida (se espera YYYY-MM-DD): ${f}`);
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const check = new Date(Date.UTC(y, m - 1, d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
      throw new RangeError(`Fecha inválida: ${f}`);
    }
    return { y, m: m - 1, d };
  }
  if (Number.isNaN(f.getTime())) throw new RangeError('Fecha inválida');
  return { y: f.getUTCFullYear(), m: f.getUTCMonth(), d: f.getUTCDate() };
}

/**
 * Edad en meses cumplidos entre la fecha de nacimiento y la del control.
 * Las cadenas `YYYY-MM-DD` y los `Date` se leen en UTC para no depender de la zona horaria.
 */
export function edadEnMeses(fechaNacimiento: FechaEntrada, fechaControl: FechaEntrada): number {
  const n = aPartesUTC(fechaNacimiento);
  const c = aPartesUTC(fechaControl);
  let meses = (c.y - n.y) * 12 + (c.m - n.m);
  if (c.d < n.d) meses -= 1;
  if (meses < 0) throw new RangeError('La fecha del control es anterior al nacimiento');
  return meses;
}

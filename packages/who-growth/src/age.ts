export type DateInput = Date | string;

function toUtcParts(d: DateInput): { y: number; m: number; d: number } {
  if (typeof d === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    if (!match) throw new RangeError(`Invalid date string (expected YYYY-MM-DD): ${d}`);
    const [y, m, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const check = new Date(Date.UTC(y, m - 1, day));
    if (
      check.getUTCFullYear() !== y ||
      check.getUTCMonth() !== m - 1 ||
      check.getUTCDate() !== day
    ) {
      throw new RangeError(`Invalid date: ${d}`);
    }
    return { y, m: m - 1, d: day };
  }
  if (Number.isNaN(d.getTime())) throw new RangeError('Invalid Date object');
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}

/**
 * Calculates completed age in months between birth date and checkup date.
 * Both `YYYY-MM-DD` strings and `Date` objects are parsed in UTC to stay timezone-independent.
 */
export function ageInMonths(birthDate: DateInput, checkupDate: DateInput): number {
  const b = toUtcParts(birthDate);
  const c = toUtcParts(checkupDate);
  let months = (c.y - b.y) * 12 + (c.m - b.m);
  if (c.d < b.d) months -= 1;
  if (months < 0) throw new RangeError('Checkup date precedes birth date');
  return months;
}

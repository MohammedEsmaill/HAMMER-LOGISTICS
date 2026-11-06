/** ISO 6346 letter values: A=10 … Z=38, skipping multiples of 11. */
const LETTER_VALUES: Record<string, number> = (() => {
  const values: Record<string, number> = {};
  let n = 10;
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (n % 11 === 0) n++;
    values[letter] = n++;
  }
  return values;
})();

/** "mklu 402244-7" → "MKLU4022447" */
export function normaliseContainerNumber(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, '');
}

/** Owner code (3 letters) + category (U/J/Z) + 6 digits + ISO 6346 check digit. */
export function isValidContainerNumber(value: string): boolean {
  if (!/^[A-Z]{3}[UJZ][0-9]{7}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = value[i];
    sum += (LETTER_VALUES[ch] ?? Number(ch)) * 2 ** i;
  }
  return (sum % 11) % 10 === Number(value[10]);
}

/** Arabic dates and words, with the English digits the office reads everywhere. */
export const AR = 'ar-EG-u-nu-latn';

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(AR, { dateStyle: 'medium' }).format(new Date(value));
}

export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return new Intl.NumberFormat(AR, { maximumFractionDigits: 2 }).format(Number(value));
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', 'Thousand', 'Million', 'Billion'];

function belowThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(n % 10 ? `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}` : TENS[Math.floor(n / 10)]);
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(' ');
}

/** 1860 → "One Thousand Eight Hundred Sixty" */
export function integerToWords(n: number): string {
  if (n === 0) return 'Zero';
  const groups: string[] = [];
  let scale = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk) groups.unshift(`${belowThousand(chunk)}${SCALES[scale] ? ` ${SCALES[scale]}` : ''}`);
    n = Math.floor(n / 1000);
    scale++;
  }
  return groups.join(' ');
}

/**
 * The invoices' "Total In words", as the office writes it:
 * 37365.13 EGP → "Thirty Seven Thousand Three Hundred Sixty Five EGP and Thirteen Piaster only."
 */
export function amountInWords(value: string | number, currency: 'EGP' | 'USD'): string {
  const cents = Math.round(Number(value) * 100);
  const whole = Math.floor(cents / 100);
  const fraction = cents % 100;
  const sub = currency === 'EGP' ? 'Piaster' : 'Cent';
  return `${integerToWords(whole)} ${currency}${fraction ? ` and ${integerToWords(fraction)} ${sub}${fraction > 1 && currency === 'USD' ? 's' : ''}` : ''} only.`;
}

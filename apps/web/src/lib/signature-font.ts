import '@fontsource/aref-ruqaa-ink/700.css';
import '@fontsource/aref-ruqaa/700.css';

/** The signatures on the invoices: a name written in Ruqaa with ink (the plain Ruqaa where the ink colours do not show). */
export const SIGNATURE_FONT = "'Aref Ruqaa Ink', 'Aref Ruqaa', serif";
/** A deep blue-black, like a good pen. */
export const SIGNATURE_INK = '#121c3e';

/** Smaller type for a longer name, so it stays inside its box. */
export const signatureSize = (text: string, base = 26) => Math.max(14, Math.min(base, Math.round(base * (14 / Math.max(14, text.length)))));

/**
 * The signature as a PNG (for the Excel file, which cannot carry the font): the name in
 * Ruqaa, slightly slanted, on a transparent background.
 */
export async function signatureImage(text: string): Promise<string> {
  const size = 64;
  await document.fonts.load(`700 ${size}px 'Aref Ruqaa Ink'`, text).catch(() => undefined);
  await document.fonts.load(`700 ${size}px 'Aref Ruqaa'`, text).catch(() => undefined);
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `700 ${size}px ${SIGNATURE_FONT}`;
  const width = Math.ceil(measure.measureText(text).width) + 40;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = size * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(width / 2, size);
  ctx.rotate((-4 * Math.PI) / 180);
  ctx.font = `700 ${size}px ${SIGNATURE_FONT}`;
  ctx.fillStyle = SIGNATURE_INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.fillText(text, 0, 0);
  return canvas.toDataURL('image/png');
}

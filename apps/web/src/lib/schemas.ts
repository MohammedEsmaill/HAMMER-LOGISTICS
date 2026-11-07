import { z } from 'zod';

/** Client-side copies of the API's rules, so mistakes are caught before any request. */

export const companyEmail = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'اكتب الإيميل')
  .email('الإيميل غير صحيح')
  .refine((v) => v.endsWith('@hammerline.com'), 'الإيميل لازم ينتهي بـ @hammerline.com');

export const strongPassword = z
  .string()
  .min(8, 'كلمة السر 8 حروف على الأقل')
  .max(128, 'كلمة السر طويلة جدًا')
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), 'لازم يكون فيها حروف وأرقام');

export const nationalId = z
  .string()
  .trim()
  .regex(/^[0-9]{14}$/, 'الرقم القومي لازم يكون 14 رقم');

export const egyptMobile = z
  .string()
  .trim()
  .regex(/^01[0125][0-9]{8}$/, 'رقم موبايل مصري: 11 رقم يبدأ بـ 010 أو 011 أو 012 أو 015');

export const taxNumber = z
  .string()
  .trim()
  .regex(/^[0-9]{9}$/, 'الرقم الضريبي لازم يكون 9 أرقام');

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

/** A required money amount typed in a number field (an empty field is an error, not 0). */
export const money = z.preprocess(
  emptyToUndefined,
  z.coerce
    .number({ required_error: 'اكتب المبلغ', invalid_type_error: 'اكتب رقم' })
    .min(0, 'مينفعش يبقى بالسالب')
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'رقمين عشريين بالكتير'),
);

export const requiredId = z.coerce
  .number({ invalid_type_error: 'اختار من القائمة' })
  .int()
  .min(1, 'اختار من القائمة');

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} حرف بالكتير`)
    .optional()
    .transform((v) => (v ? v : undefined));

import { z } from 'zod';

/** Same rules as the API, checked before any request is sent. */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'اكتب الإيميل')
    .email('الإيميل غير صحيح')
    .refine((v) => v.endsWith('@hammerline.com'), 'الإيميل لازم ينتهي بـ @hammerline.com'),
  password: z.string().min(1, 'اكتب كلمة السر').max(128, 'كلمة السر طويلة جدًا'),
});

export type LoginForm = z.infer<typeof loginSchema>;

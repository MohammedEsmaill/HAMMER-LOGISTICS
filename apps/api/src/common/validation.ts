import { Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

/** Trims strings; turns empty strings into undefined so optional fields stay optional. */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  });

/** A non-negative money amount with at most 2 decimals (sent as a JSON number). */
export const Money = () => {
  const number = IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: '$property لازم يكون مبلغ صحيح (رقمين عشريين بالكتير)' },
  );
  const min = Min(0, { message: '$property مينفعش يبقى بالسالب' });
  return (target: object, key: string) => {
    number(target, key);
    min(target, key);
  };
};

export function toDecimal(value: number): Prisma.Decimal;
export function toDecimal(
  value: number | undefined,
): Prisma.Decimal | undefined;
export function toDecimal(value: number | undefined) {
  return value === undefined ? undefined : new Prisma.Decimal(value.toFixed(2));
}

export const NATIONAL_ID = /^[0-9]{14}$/;
export const EGYPT_MOBILE = /^01[0125][0-9]{8}$/;
export const TAX_NUMBER = /^[0-9]{9}$/;

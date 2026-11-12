import { Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsNumber, Min, ValidateBy } from 'class-validator';

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

/** Today in Cairo, as a UTC midnight: the day the office is living. */
function cairoToday(): Date {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
  }).format(new Date());
  return new Date(`${day}T00:00:00.000Z`);
}

/**
 * A date that already happened: today at the latest (Cairo). Every recorded date
 * follows this rule; only expected dates (the ETA) may be in the future.
 */
export const NotFuture = (label = 'التاريخ') =>
  ValidateBy({
    name: 'notFuture',
    validator: {
      validate: (value: unknown) => {
        if (value === null || value === undefined) return true;
        if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
          return true; // IsDate reports a bad date
        }
        const day = Date.UTC(
          value.getUTCFullYear(),
          value.getUTCMonth(),
          value.getUTCDate(),
        );
        return day <= cairoToday().getTime();
      },
      defaultMessage: () => `${label} مينفعش يبقى بعد النهاردة`,
    },
  });

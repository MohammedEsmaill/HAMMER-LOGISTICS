import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsNumber, Min } from 'class-validator';

/** An amount above zero with at most 2 decimals (sent as a JSON number). */
export const PositiveMoney = () => {
  const number = IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'المبلغ لازم يكون رقم (رقمين عشريين بالكتير)' },
  );
  const min = Min(0.01, { message: 'المبلغ لازم يكون أكبر من صفر' });
  return (target: object, key: string) => {
    number(target, key);
    min(target, key);
  };
};

export const decimal = (value: number | string | Prisma.Decimal) =>
  new Prisma.Decimal(value).toDecimalPlaces(2);

/** 12500.5 → "12,500.50" */
export function formatAmount(value: number | string | Prisma.Decimal): string {
  const [int, frac] = new Prisma.Decimal(value).toFixed(2).split('.');
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`;
}

/** Today in Cairo, as a date-only value. */
export function todayCairo(now = new Date()): Date {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
  }).format(now);
  return new Date(`${day}T00:00:00.000Z`);
}

/** Business dates may be in the past (recorded late) but never in the future. */
export function businessDate(value: Date | undefined, label: string): Date {
  const today = todayCairo();
  if (!value) return today;
  const day = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
  if (day > today) {
    throw new BadRequestException(`${label} مينفعش يبقى في المستقبل`);
  }
  return day;
}

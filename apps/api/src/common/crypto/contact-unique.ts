import { ConflictException } from '@nestjs/common';
import { Tx } from '../../prisma/prisma.service';
import { blindIndex } from './personal-data';

/**
 * A national ID or a phone belongs to one person: across the employees and the
 * clearers (the people behind the accounts), the one being edited excepted.
 */
export async function assertContactFree(
  tx: Tx,
  input: { nationalId?: string; phone?: string },
  self: { employeeId?: number; clearerId?: number } = {},
) {
  const checks: [keyof typeof input, 'nationalIdHash' | 'phoneHash', string][] = [
    ['nationalId', 'nationalIdHash', 'الرقم القومي'],
    ['phone', 'phoneHash', 'رقم الموبايل'],
  ];
  for (const [field, hashField, label] of checks) {
    const value = input[field];
    if (value === undefined || !value.replace(/\D/g, '')) continue;
    const hash = blindIndex(value);
    const employee = await tx.employee.findFirst({
      where: { [hashField]: hash, deletedAt: null, ...(self.employeeId ? { id: { not: self.employeeId } } : {}) },
      select: { fullName: true },
    });
    if (employee) throw new ConflictException(`${label} متسجل للموظف ${employee.fullName}`);
    const clearer = await tx.clearer.findFirst({
      where: { [hashField]: hash, deletedAt: null, ...(self.clearerId ? { id: { not: self.clearerId } } : {}) },
      select: { fullName: true },
    });
    if (clearer) throw new ConflictException(`${label} متسجل للمستخلص ${clearer.fullName}`);
  }
}

/** A search that is a whole national ID (14 digits) or phone (11 digits): its hash to match. */
export function contactSearch(search: string): { nationalIdHash: string } | { phoneHash: string } | null {
  const digits = search.replace(/\s/g, '');
  if (/^\d{14}$/.test(digits)) return { nationalIdHash: blindIndex(digits) };
  if (/^0\d{10}$/.test(digits)) return { phoneHash: blindIndex(digits) };
  return null;
}

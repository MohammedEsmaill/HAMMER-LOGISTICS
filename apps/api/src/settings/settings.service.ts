import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';

export interface CompanySettings {
  name: string;
  address: string;
  taxNumber: string;
  crNumber: string;
  emails: string[];
}

const DEFAULTS: CompanySettings = {
  name: 'HAMMER LINE Shipping & Logistics',
  address: '',
  taxNumber: '',
  crNumber: '',
  emails: [],
};

/** The company data printed on invoices and statements, edited by the CEO. */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async company(): Promise<CompanySettings> {
    const row = await this.prisma.setting.findUnique({
      where: { key: 'company' },
    });
    return { ...DEFAULTS, ...((row?.value as Partial<CompanySettings>) ?? {}) };
  }

  async updateCompany(actor: AuthUser, patch: Partial<CompanySettings>) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.company();
      const after: CompanySettings = {
        ...before,
        ...Object.fromEntries(
          Object.entries(patch).filter(([, v]) => v !== undefined),
        ),
        emails:
          patch.emails?.map((e) => e.trim().toLowerCase()) ?? before.emails,
      };
      await tx.setting.upsert({
        where: { key: 'company' },
        update: { value: after as unknown as Prisma.InputJsonValue },
        create: {
          key: 'company',
          value: after as unknown as Prisma.InputJsonValue,
        },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'setting',
          entityId: 'company',
          before,
          after,
        },
        tx,
      );
      return after;
    });
  }
}

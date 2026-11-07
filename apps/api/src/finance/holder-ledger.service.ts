import { Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const ZERO = new Prisma.Decimal(0);

export interface StatementLine {
  date: Date;
  kind:
    | 'CUSTODY_ISSUE'
    | 'CUSTODY_EXTRA'
    | 'CUSTODY_ITEMS'
    | 'CUSTODY_RETURN'
    | 'FEE'
    | 'FEE_ADJUSTMENT'
    | 'FEE_PAYMENT';
  description: string;
  reference: string;
  fileNo: string;
  /** عليه: money the holder received from the office. */
  debit: Prisma.Decimal;
  /** له: what the holder accounted for, returned, or earned. */
  credit: Prisma.Decimal;
  approvalStatus: ApprovalStatus | null;
  balance?: Prisma.Decimal;
  order: number;
}

type CustodyRow = Prisma.CustodyGetPayload<{
  include: { shipment: { select: { fileNo: true } } };
}>;

/**
 * Statements of the custody holders (spec section 13), built from the documents
 * themselves so they can never disagree with them. A positive balance means the
 * holder still holds office money; a negative one means the office owes them.
 */
@Injectable()
export class HolderLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async clearer(clearerId: number) {
    const clearer = await this.prisma.clearer.findUnique({
      where: { id: clearerId },
      select: { id: true, fullName: true },
    });
    if (!clearer) throw new NotFoundException('المستخلص غير موجود');
    const [custodies, fees] = await Promise.all([
      this.custodies({ clearerId, holderType: 'CLEARER' }),
      this.prisma.clearerFee.findMany({
        where: { clearerId },
        include: {
          shipment: { select: { fileNo: true } },
          adjustments: true,
          payments: true,
          custody: { select: { custodyNo: true, approvalStatus: true } },
        },
      }),
    ]);
    const lines = this.custodyLines(custodies);
    for (const fee of fees) {
      const fromContainers = fee.adjustments
        .filter((a) => a.reason === 'CONTAINERS_CHANGED')
        .reduce((s, a) => s.plus(a.amount), ZERO);
      lines.push({
        date: fee.createdAt,
        kind: 'FEE',
        description: 'أتعاب الشحنة',
        reference: fee.custody.custodyNo,
        fileNo: fee.shipment.fileNo,
        debit: ZERO,
        credit: fee.amount.minus(fromContainers),
        approvalStatus: fee.custody.approvalStatus,
        order: 4,
      });
      for (const a of fee.adjustments) {
        lines.push({
          date: a.adjustmentDate,
          kind: 'FEE_ADJUSTMENT',
          description:
            a.reason === 'CONTAINERS_CHANGED'
              ? `تسوية: الحاويات اتغيرت من ${a.containersFrom} لـ ${a.containersTo}`
              : `تسوية: ${a.notes}`,
          reference: `تسوية #${a.id}`,
          fileNo: fee.shipment.fileNo,
          debit: a.amount.isNegative() ? a.amount.negated() : ZERO,
          credit: a.amount.isNegative() ? ZERO : a.amount,
          approvalStatus: a.approvalStatus,
          order: 5,
        });
      }
      for (const p of fee.payments) {
        lines.push({
          date: p.paymentDate,
          kind: 'FEE_PAYMENT',
          description: p.beneficiaryId
            ? 'صرف أتعاب بتحويل بنكي'
            : 'صرف أتعاب كاش',
          reference: `صرف #${p.id}`,
          fileNo: fee.shipment.fileNo,
          debit: p.amount,
          credit: ZERO,
          approvalStatus: p.approvalStatus,
          order: 6,
        });
      }
    }
    return {
      holder: { type: 'CLEARER', id: clearer.id, name: clearer.fullName },
      ...this.withBalance(lines, 'EGP'),
    };
  }

  async agent(employeeId: number) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, fullName: true },
    });
    if (!employee) throw new NotFoundException('المندوب غير موجود');
    const lines = this.custodyLines(
      await this.custodies({
        agentEmployeeId: employeeId,
        holderType: 'AGENT',
      }),
    );
    return {
      holder: { type: 'AGENT', id: employee.id, name: employee.fullName },
      ...this.withBalance(lines, 'EGP'),
    };
  }

  async wayOut() {
    const lines = this.custodyLines(
      await this.custodies({ holderType: 'WAY_OUT' }),
    );
    return {
      holder: { type: 'WAY_OUT', id: null, name: 'WAY OUT' },
      ...this.withBalance(lines, 'USD'),
    };
  }

  /** Every holder with a balance, for the statements screen. */
  async holders() {
    const [clearers, agents, wayOut] = await Promise.all([
      this.prisma.clearer.findMany({
        where: { OR: [{ custodies: { some: {} } }, { fees: { some: {} } }] },
        select: { id: true, fullName: true },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.employee.findMany({
        where: { custodies: { some: { holderType: 'AGENT' } } },
        select: { id: true, fullName: true },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.custody.count({ where: { holderType: 'WAY_OUT' } }),
    ]);
    const balance = async (
      p: Promise<{ totals: { balance: Prisma.Decimal } }>,
    ) => (await p).totals.balance;
    return {
      clearers: await Promise.all(
        clearers.map(async (c) => ({
          id: c.id,
          name: c.fullName,
          balance: await balance(this.clearer(c.id)),
        })),
      ),
      agents: await Promise.all(
        agents.map(async (a) => ({
          id: a.id,
          name: a.fullName,
          balance: await balance(this.agent(a.id)),
        })),
      ),
      wayOut: wayOut ? { balance: await balance(this.wayOut()) } : null,
    };
  }

  private custodies(where: Prisma.CustodyWhereInput): Promise<CustodyRow[]> {
    return this.prisma.custody.findMany({
      where,
      include: { shipment: { select: { fileNo: true } } },
    });
  }

  /** Issue (and overspend) put money in the holder's hands; items and the rest back take it out. */
  private custodyLines(custodies: CustodyRow[]): StatementLine[] {
    const lines: StatementLine[] = [];
    for (const c of custodies) {
      const base = {
        reference: c.custodyNo,
        fileNo: c.shipment.fileNo,
        approvalStatus: c.status === 'SETTLED' ? c.approvalStatus : null,
      };
      lines.push({
        ...base,
        date: c.issueDate,
        kind: 'CUSTODY_ISSUE',
        description: 'صرف عهدة',
        debit: c.amount,
        credit: ZERO,
        order: 0,
      });
      if (c.status !== 'SETTLED') continue;
      const at = c.settlementDate!;
      if (c.extraAmount.greaterThan(0)) {
        lines.push({
          ...base,
          date: at,
          kind: 'CUSTODY_EXTRA',
          description: 'زيادة على العهدة',
          debit: c.extraAmount,
          credit: ZERO,
          order: 1,
        });
      }
      lines.push({
        ...base,
        date: at,
        kind: 'CUSTODY_ITEMS',
        description: 'بنود التصفية',
        debit: ZERO,
        credit: c.spentAmount,
        order: 2,
      });
      if (c.returnedAmount.greaterThan(0)) {
        lines.push({
          ...base,
          date: at,
          kind: 'CUSTODY_RETURN',
          description: 'رد باقي العهدة',
          debit: ZERO,
          credit: c.returnedAmount,
          order: 3,
        });
      }
    }
    return lines;
  }

  private withBalance(lines: StatementLine[], currency: 'EGP' | 'USD') {
    const day = (d: Date) => d.toISOString().slice(0, 10);
    lines.sort(
      (a, b) => day(a.date).localeCompare(day(b.date)) || a.order - b.order,
    );
    let balance = ZERO;
    const out = lines.map(({ order, ...l }) => {
      void order;
      balance = balance.plus(l.debit).minus(l.credit);
      return { ...l, balance };
    });
    return {
      currency,
      lines: out,
      totals: {
        debit: lines.reduce((s, l) => s.plus(l.debit), ZERO),
        credit: lines.reduce((s, l) => s.plus(l.credit), ZERO),
        balance,
      },
    };
  }
}

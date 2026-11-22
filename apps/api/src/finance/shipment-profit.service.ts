import { Injectable } from '@nestjs/common';
import { Currency, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShipmentAccountService } from './shipment-account.service';

const ZERO = new Prisma.Decimal(0);
const CURRENCIES: Currency[] = ['EGP', 'USD'];
const fixed = (d: Prisma.Decimal) => d.toFixed(2);

/**
 * One shipment's profit, per currency: what the client is billed (the statement and
 * the clearance invoice, before VAT) against what it cost (the custodies' spending
 * with their bank charges, and the clearer's fee with its payments' bank charges).
 *
 * While the shipment account is open the figures are an estimate: the draft statement
 * and the client's clearance price; an open custody counts only once it is settled.
 * Once it is finished they come from the invoices.
 */
@Injectable()
export class ShipmentProfitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: ShipmentAccountService,
  ) {}

  async get(shipmentId: number) {
    const acc = await this.accounts.get(shipmentId);
    const [custodies, feePayments] = await Promise.all([
      this.prisma.custody.findMany({
        // a rejected custody was reversed: no money left the box
        where: { shipmentId, approvalStatus: { not: 'REJECTED' } },
        select: {
          custodyNo: true,
          status: true,
          currency: true,
          amount: true,
          spentAmount: true,
          bankCharges: true,
        },
        orderBy: { id: 'asc' },
      }),
      acc.clearerFee
        ? this.prisma.clearerFeePayment.findMany({
            where: {
              feeId: acc.clearerFee.id,
              approvalStatus: { not: 'REJECTED' },
            },
            select: { currency: true, bankCharges: true },
          })
        : Promise.resolve(
            [] as { currency: Currency; bankCharges: Prisma.Decimal }[],
          ),
    ]);

    const final = acc.account.status === 'FINISHED';
    const live = acc.invoices.filter((i) => !i.voidedAt);
    const sum = (xs: Prisma.Decimal[]) => xs.reduce((t, x) => t.plus(x), ZERO);

    const currencies = CURRENCIES.map((currency) => {
      const ofType = (type: 'STATEMENT' | 'CLEARANCE') =>
        live.filter((i) => i.type === type && i.currency === currency);
      const statementInvoices = ofType('STATEMENT');
      const clearanceInvoices = ofType('CLEARANCE');
      // before VAT: the tax is the government's, not ours
      const statement = statementInvoices.length
        ? sum(statementInvoices.map((i) => new Prisma.Decimal(i.subtotal)))
        : acc.draft[currency].total;
      const clearance = clearanceInvoices.length
        ? sum(clearanceInvoices.map((i) => new Prisma.Decimal(i.subtotal)))
        : currency === 'EGP'
          ? new Prisma.Decimal(acc.clearanceQuote.amount)
          : ZERO;

      const mine = custodies.filter((c) => c.currency === currency);
      const settled = mine.filter((c) => c.status === 'SETTLED');
      const open = mine.filter((c) => c.status === 'OPEN');
      const spent = sum(settled.map((c) => c.spentAmount));
      const openAmount = sum(open.map((c) => c.amount));
      const bankCharges = sum([
        ...mine.map((c) => c.bankCharges),
        ...feePayments
          .filter((p) => p.currency === currency)
          .map((p) => p.bankCharges),
      ]);
      const clearerFee =
        currency === 'EGP' && acc.clearerFee
          ? new Prisma.Decimal(acc.clearerFee.amount)
          : ZERO;

      const revenue = statement.plus(clearance);
      // an open custody is left out until it is settled: its spending is not on the
      // client's statement yet, so counting it would show a loss that is not there
      const expenses = spent.plus(bankCharges);
      const cost = expenses.plus(clearerFee);
      const net = revenue.minus(cost);
      const totals = acc.totals.find((t) => t.currency === currency)!;
      return {
        currency,
        revenue: {
          statement: fixed(statement),
          clearance: fixed(clearance),
          total: fixed(revenue),
        },
        cost: {
          spent: fixed(spent),
          openCustodies: fixed(openAmount),
          bankCharges: fixed(bankCharges),
          clearerFee: fixed(clearerFee),
          total: fixed(cost),
        },
        // where the profit comes from: the expenses billed above their cost, and the
        // clearance price above the clearer's fee
        expenseProfit: fixed(statement.minus(expenses)),
        clearanceProfit: fixed(clearance.minus(clearerFee)),
        net: fixed(net),
        margin: revenue.isZero()
          ? null
          : net.dividedBy(revenue).times(100).toDecimalPlaces(1).toNumber(),
        custodies: settled.map((c) => c.custodyNo),
        billed: fixed(new Prisma.Decimal(totals.billed)),
        collected: fixed(new Prisma.Decimal(totals.collected)),
        outstanding: fixed(new Prisma.Decimal(totals.outstanding)),
        // nothing at all in this currency: the screen leaves it out
        empty: revenue.isZero() && cost.isZero(),
      };
    });

    const notes: string[] = [];
    if (acc.openCustodies.length)
      notes.push(
        `${acc.openCustodies.join('، ')} لسه مفتوحة ومش داخلة في الحساب لحد ما تتصفى`,
      );
    if (!acc.clearerFee)
      notes.push(
        'أتعاب المستخلص لسه ما اتحسبتش (بتتحسب مع تصفية عهدة المستخلص)',
      );
    if (!final)
      notes.push(
        `فاتورة التخليص محسوبة من سعر العميل (${acc.clearanceQuote.containers} حاوية)`,
      );

    return {
      shipment: acc.shipment,
      status: final ? 'FINAL' : 'ESTIMATE',
      clearer: acc.clearerFee?.clearer.fullName ?? null,
      currencies,
      notes,
    };
  }
}

import type { ReactNode } from 'react';
import { amountInWords } from '@/lib/words';
import type { CompanySettings } from './account-api';
import { amount, containersText, lineWithVat, plain, printDate, stampOf, type PrintableInvoice } from './invoice-format';

function Field({ label, children, small }: { label: string; children?: ReactNode; small?: boolean }) {
  return (
    <div className="flex gap-2 py-[3px]">
      <span className={`shrink-0 font-bold ${small ? 'text-[11px]' : ''}`}>{label}</span>
      <span>{children}</span>
    </div>
  );
}

/**
 * The invoice exactly as the office prints it today (English, left to right): company
 * header, shipment box, the lines, totals and the three signature boxes. The company
 * data comes from the settings; DRAFT / APPROVED / VOID is stamped across it.
 */
export function InvoiceDocument({ invoice, company }: { invoice: PrintableInvoice; company: CompanySettings }) {
  const s = invoice.shipment;
  const clearance = invoice.type === 'CLEARANCE';
  const stamp = stampOf(invoice);
  const [c40, c20, lcl] = containersText(s.containers);

  return (
    <div dir="ltr" className="invoice-page relative mx-auto overflow-hidden bg-white px-8 py-8 text-[13px] leading-snug text-black" style={{ width: '210mm', minHeight: '297mm', fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center select-none"
        style={{ color: stamp.color, opacity: 0.12, fontSize: 120, fontWeight: 900, transform: 'rotate(-28deg)' }}
      >
        {stamp.text}
      </div>

      <header className="flex items-start justify-between gap-6">
        <img src="/logo-full.png" alt={company.name} className="h-28 w-auto object-contain" />
        <div className="max-w-[58%] space-y-2 text-[13px]">
          <div>{company.address}</div>
          <div>Tax Number.:{company.taxNumber}</div>
          <div>CR Number: {company.crNumber}</div>
          {company.emails.length > 0 && <div className="text-[12px]">E-mail: {company.emails.map((e) => e.toUpperCase()).join('-')}</div>}
        </div>
      </header>

      <h1 className="mt-4 text-center text-3xl underline underline-offset-4">
        {clearance ? 'INVOICE' : <>STATEMENT {invoice.invoiceNo}</>}
      </h1>
      {!clearance && <div className="mt-3 font-bold">Date {printDate(invoice.invoiceDate)}</div>}

      <section className="mt-2 grid grid-cols-2 border-2 border-black px-1 py-1">
        <div>
          {clearance ? (
            <>
              <Field label="Invoice Number:">{invoice.invoiceNo}</Field>
              <Field label="Invoice Date:">{printDate(invoice.invoiceDate)}</Field>
              <Field label="Value Date">{printDate(invoice.valueDate)}</Field>
            </>
          ) : (
            <Field label="Custmoer name :">{s.client.name}</Field>
          )}
          <Field label="Currency :">{invoice.currency}</Field>
          <Field label="HB/L NO. :">{s.hblNumber}</Field>
          <Field label="POD :">{s.pod}</Field>
          <Field label="Container Numbers :" small>
            {s.containerNumbers.join(' - ')}
          </Field>
          <Field label="Shipper :">{s.client.name}</Field>
          <Field label="Notify :" />
          <Field label="Certificate No:">{s.certificateNo}</Field>
          <Field label="RELEASE DATE :">{printDate(s.releaseDate)}</Field>
          {clearance && <Field label="Customer Ref :">{invoice.customerRef}</Field>}
        </div>
        <div>
          {clearance ? (
            <>
              <Field label="Bill To :">{s.client.name}</Field>
              <Field label="Address :" />
              <div className="py-[3px]">&nbsp;</div>
            </>
          ) : (
            <Field label="Address :" />
          )}
          <Field label="Operation :">{s.fileNo}</Field>
          <Field label="MB/L NO. :">{s.mblNumber}</Field>
          <Field label="POL :">{s.pol}</Field>
          <Field label="Vessel :">{s.vessel}</Field>
          <div className="flex gap-6 py-[3px]">
            <span className="font-bold">Containers :</span>
            <span>{c40}</span>
            <span className="border-l-2 border-black pl-1">{c20}</span>
            <span className="border-l-2 border-black pl-1">{lcl}</span>
          </div>
          <Field label="Commodity :">{s.commodity}</Field>
          <Field label="Consignee :">{s.consignee}</Field>
          <Field label="Weight :">{plain(s.weight)}</Field>
        </div>
      </section>

      {clearance ? (
        <>
          <table className="mt-3 w-full border-collapse text-center">
            <thead>
              <tr style={{ background: '#efe6a3' }}>
                {['No', 'Product Description', 'Quantity', 'Unit price', 'Total'].map((h) => (
                  <th key={h} className="border-2 border-black px-2 py-1">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l) => (
                <tr key={l.id} className="font-bold">
                  <td className="border-2 border-black px-2 py-1">{l.lineNo}</td>
                  <td className="border-2 border-black px-2 py-1">{l.description}</td>
                  <td className="border-2 border-black px-2 py-1">{plain(l.quantity)}</td>
                  <td className="border-2 border-black px-2 py-1">{plain(l.unitPrice)}</td>
                  <td className="border-2 border-black px-2 py-1">{plain(lineWithVat(invoice, l.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="mt-0 ml-auto w-[45%] border-collapse">
            <tbody>
              <TotalRow label="SubTotal" value={amount(invoice.subtotal)} />
              <TotalRow label={`VAT ${plain(invoice.vatRate)}%`} value={amount(invoice.vatAmount)} />
              <TotalRow label="W.H.T" value={amount(invoice.wht)} />
              <TotalRow label="Invoice Total (Currency)" value={`${amount(invoice.total)}      (${invoice.currency})`} />
              <TotalRow label={`Currency: ${invoice.currency}`} />
              <TotalRow label="Total In words:" value={amountInWords(invoice.total, invoice.currency)} />
              <TotalRow label="Note:" value={invoice.voidedAt ? invoice.notes : ''} />
            </tbody>
          </table>
        </>
      ) : (
        <>
          <table className="mt-3 w-full border-collapse text-center">
            <thead>
              <tr style={{ background: '#9db7d5' }}>
                <th className="border-2 border-black px-2 py-1">Description</th>
                <th className="w-[30%] border-2 border-black px-2 py-1">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l) => (
                <tr key={l.id} className="font-bold">
                  <td className="border-2 border-black px-2 py-1">{l.description}</td>
                  <td className="border-2 border-black px-2 py-1">{plain(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="ml-auto w-[38%] border-collapse">
            <tbody>
              <TotalRow label="SubTotal" value={plain(invoice.total)} />
              <tr>
                <td colSpan={2} className="border-2 border-black px-2 py-1 font-bold">
                  Total In words:
                </td>
              </tr>
              <tr>
                <td colSpan={2} className="border-2 border-black px-2 py-1 text-center">
                  {amountInWords(invoice.total, invoice.currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <table className="mt-6 w-[95%] border-collapse text-center" dir="rtl" style={{ marginInline: 'auto' }}>
        <thead>
          <tr>
            {['مراجعة', 'مدير الحسابات', 'الاعتماد'].map((h) => (
              <th key={h} className="w-1/3 border-2 border-black py-1 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="h-14 border-2 border-black" />
            <td className="h-14 border-2 border-black" />
            <td className="h-14 border-2 border-black" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <tr>
      <td className="border-2 border-black px-2 py-1 font-bold whitespace-nowrap">{label}</td>
      <td className="border-2 border-black px-2 py-1 text-center">{value}</td>
    </tr>
  );
}

import { ArrowRight, FileSpreadsheet, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Spinner } from '@/components/ui/Spinner';
import { toastError } from '@/lib/mutations';
import { useCompany, useInvoice } from './account-api';
import { InvoiceDocument } from './InvoiceDocument';
import { downloadInvoiceExcel } from './invoice-excel';

/**
 * The printable invoice on its own page: print / save as PDF from the browser, or
 * download it as Excel. What prints is exactly what shows.
 */
export default function InvoicePrintPage() {
  const id = Number(useParams().id);
  const { data: invoice, error } = useInvoice(Number.isInteger(id) ? id : null);
  const { data: company } = useCompany();
  const [exporting, setExporting] = useState(false);

  // the document is English, left to right; so is the page while it shows
  useEffect(() => {
    const html = document.documentElement;
    const before = html.dir;
    html.dir = 'ltr';
    return () => {
      html.dir = before;
    };
  }, []);

  useEffect(() => {
    if (invoice) document.title = `${invoice.type === 'CLEARANCE' ? 'INVOICE' : 'STATEMENT'} ${invoice.invoiceNo}`;
    return () => {
      document.title = 'HAMMER LINE';
    };
  }, [invoice]);

  if (error) return <div className="p-6"><ErrorBox error={error} /></div>;
  if (!invoice || !company) {
    return (
      <div className="grid min-h-screen place-items-center text-gold">
        <Spinner className="size-8" />
      </div>
    );
  }

  const excel = async () => {
    setExporting(true);
    try {
      await downloadInvoiceExcel(invoice, company);
    } catch (e) {
      toastError(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-300 pb-10 print:bg-white print:pb-0">
      <div dir="rtl" className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-3 print:hidden">
        <Link to={`/shipment-accounts/${invoice.shipmentId}`} className="flex items-center gap-1 text-sm text-muted hover:text-gold">
          <ArrowRight className="size-4" /> حساب الشحنة
        </Link>
        <div className="flex-1" />
        {invoice.voidedAt && <span className="rounded-lg bg-danger/10 px-3 py-1.5 text-sm text-danger">الفاتورة دي ملغية</span>}
        {invoice.approvalStatus !== 'APPROVED' && !invoice.voidedAt && (
          <span className="rounded-lg bg-warning/10 px-3 py-1.5 text-sm text-warning">DRAFT: متتبعتش للعميل غير بعد الاعتماد</span>
        )}
        <Button variant="ghost" icon={<FileSpreadsheet className="size-4" />} loading={exporting} onClick={excel}>
          Excel
        </Button>
        <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>
          طباعة / PDF
        </Button>
      </div>
      <div className="py-6 print:py-0">
        <div className="print-sheet mx-auto shadow-2xl" style={{ width: '210mm' }}>
          <InvoiceDocument invoice={invoice} company={company} />
        </div>
      </div>
    </div>
  );
}

import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { useCompany, useInvoice } from './account-api';
import { InvoiceDocument } from './InvoiceDocument';
import { ApprovalTrail } from './MovementDrawers';

/** An invoice for its approvers: the document as it prints, and its approval trail. */
export function InvoiceDrawer({ invoiceId, onClose }: { invoiceId: number | null; onClose: () => void }) {
  const { data: invoice, error } = useInvoice(invoiceId);
  const { data: company } = useCompany();
  return (
    <Drawer open={!!invoiceId} onClose={onClose} width="max-w-4xl" title={invoice ? `${invoice.type} ${invoice.invoiceNo}` : 'الفاتورة'}>
      {error ? <ErrorBox error={error} /> : null}
      {invoice && company && (
        <div className="space-y-4">
          <Link to={`/print/invoices/${invoice.id}`} className="inline-flex items-center gap-1 text-sm text-gold hover:underline">
            <ExternalLink className="size-4" /> فتح للطباعة / Excel
          </Link>
          <ApprovalTrail doc={invoice} />
          <div className="overflow-x-auto rounded-xl bg-neutral-300 p-3">
            <div style={{ width: '210mm', transform: 'scale(0.8)', transformOrigin: 'top right' }}>
              <InvoiceDocument invoice={invoice} company={company} />
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}

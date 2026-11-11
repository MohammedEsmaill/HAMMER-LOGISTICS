import { useDocument, type DocType, type OtherMovement, type Transfer } from './api';
import { CollectionDrawer } from './AccountActionDrawers';
import type { Collection } from './account-api';
import type { FeeAdjustment, FeePayment } from './custody-api';
import { CustodyDrawer } from './CustodyDrawers';
import { ExpenseDrawer } from './ExpensesPage';
import { InvoiceDrawer } from './InvoiceDrawer';
import { FeeAdjustmentDrawer, FeePaymentDrawer } from './LedgerDrawers';
import { OtherDrawer, TransferDrawer } from './MovementDrawers';
import type { Advance, Expense, Salary } from './office-api';
import { AdvanceDrawer, SalaryDrawer } from './PayrollDrawers';

export interface OpenDocument {
  type: DocType;
  id: number;
}

/**
 * Any financial document in its own drawer, loaded in full (with its approval trail).
 * Custodies and invoices load themselves.
 */
export function DocumentDrawers({ open, onClose }: { open: OpenDocument | null; onClose: () => void }) {
  const selfLoading = open?.type === 'CUSTODY' || open?.type === 'INVOICE';
  const doc = useDocument<unknown>(open?.type ?? 'TRANSFER', selfLoading ? null : (open?.id ?? null)).data;
  const shown = (type: DocType) => (open?.type === type && doc ? doc : null);
  return (
    <>
      <TransferDrawer transfer={shown('TRANSFER') as Transfer | null} open={!!shown('TRANSFER')} onClose={onClose} />
      <OtherDrawer movement={shown('OTHER') as OtherMovement | null} open={!!shown('OTHER')} onClose={onClose} />
      <SalaryDrawer salary={shown('SALARY') as Salary | null} open={!!shown('SALARY')} onClose={onClose} />
      <AdvanceDrawer advance={shown('ADVANCE') as Advance | null} open={!!shown('ADVANCE')} onClose={onClose} />
      <ExpenseDrawer expense={shown('EXPENSE') as Expense | null} open={!!shown('EXPENSE')} onClose={onClose} />
      <CustodyDrawer custodyId={open?.type === 'CUSTODY' ? open.id : null} onClose={onClose} />
      <FeePaymentDrawer fee={null} payment={shown('FEE_PAYMENT') as FeePayment | null} open={!!shown('FEE_PAYMENT')} onClose={onClose} />
      <CollectionDrawer collection={shown('COLLECTION') as Collection | null} open={!!shown('COLLECTION')} onClose={onClose} />
      <InvoiceDrawer invoiceId={open?.type === 'INVOICE' ? open.id : null} onClose={onClose} />
      <FeeAdjustmentDrawer adjustment={shown('FEE_ADJUSTMENT') as FeeAdjustment | null} open={!!shown('FEE_ADJUSTMENT')} onClose={onClose} />
    </>
  );
}

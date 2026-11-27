/**
 * How a document type is approved:
 * TWO_LEVELS: the general auditor reviews, the accounts manager approves (every type
 * since the roles were set in Nov 2026).
 * THREE_LEVELS / FINAL_ONLY: the earlier flows, kept for documents still on them.
 */
export type ApprovalFlow = 'TWO_LEVELS' | 'THREE_LEVELS' | 'FINAL_ONLY';

/**
 * Every financial document type and its table. A new document type registers here
 * and in financial_operations_v; the workflow itself does not change (Open/Closed).
 * restricted: salary data, seen only by payroll, the general auditor and the CEO.
 */
export const APPROVABLE = {
  TRANSFER: {
    table: 'transfers',
    label: 'تحويل',
    flow: 'TWO_LEVELS',
    restricted: false,
  },
  OTHER: {
    table: 'other_movements',
    label: 'معاملة أخرى',
    flow: 'TWO_LEVELS',
    restricted: false,
  },
  SALARY: {
    table: 'salary_payments',
    label: 'مرتب',
    flow: 'TWO_LEVELS',
    restricted: true,
  },
  ADVANCE: {
    table: 'employee_advances',
    label: 'سلفة',
    flow: 'TWO_LEVELS',
    restricted: true,
  },
  EXPENSE: {
    table: 'general_expenses',
    label: 'مصروف عمومي',
    flow: 'TWO_LEVELS',
    restricted: false,
  },
  CUSTODY: {
    table: 'custodies',
    label: 'عهدة',
    flow: 'TWO_LEVELS',
    restricted: false,
  },
  FEE_ADJUSTMENT: {
    table: 'clearer_fee_adjustments',
    label: 'تسوية أتعاب',
    flow: 'TWO_LEVELS',
    restricted: false,
  },
  FEE_PAYMENT: {
    table: 'clearer_fee_payments',
    label: 'صرف أتعاب',
    flow: 'TWO_LEVELS',
    restricted: false,
  },
  INVOICE: {
    table: 'invoices',
    label: 'فاتورة',
    flow: 'TWO_LEVELS',
    restricted: false,
  },
  COLLECTION: {
    table: 'collections',
    label: 'تحصيل',
    flow: 'TWO_LEVELS',
    restricted: false,
  },
  PARTY: {
    table: 'party_movements',
    label: 'حركة حساب داخلي',
    flow: 'TWO_LEVELS',
    restricted: false,
  },
  ASSET: {
    table: 'asset_transactions',
    label: 'أصل ثابت',
    flow: 'TWO_LEVELS',
    restricted: false,
  },
} as const satisfies Record<
  string,
  { table: string; label: string; flow: ApprovalFlow; restricted: boolean }
>;
export type ApprovableType = keyof typeof APPROVABLE;
export const APPROVABLE_TYPES = Object.keys(APPROVABLE) as ApprovableType[];
export const RESTRICTED_TYPES = APPROVABLE_TYPES.filter(
  (t) => APPROVABLE[t].restricted,
);

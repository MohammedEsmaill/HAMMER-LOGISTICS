/**
 * How a document type is approved:
 * THREE_LEVELS: accountant review → accounts manager → general auditor.
 * FINAL_ONLY: the general auditor alone (salaries and advances, which the
 * accountant and the accounts manager do not see).
 */
export type ApprovalFlow = 'THREE_LEVELS' | 'FINAL_ONLY';

/**
 * Every financial document type and its table. A new document type registers here
 * and in financial_operations_v; the workflow itself does not change (Open/Closed).
 * restricted: salary data, seen only by payroll, the general auditor and the CEO.
 */
export const APPROVABLE = {
  TRANSFER: {
    table: 'transfers',
    label: 'تحويل',
    flow: 'THREE_LEVELS',
    restricted: false,
  },
  OTHER: {
    table: 'other_movements',
    label: 'حركة تانية',
    flow: 'THREE_LEVELS',
    restricted: false,
  },
  SALARY: {
    table: 'salary_payments',
    label: 'مرتب',
    flow: 'FINAL_ONLY',
    restricted: true,
  },
  ADVANCE: {
    table: 'employee_advances',
    label: 'سلفة',
    flow: 'FINAL_ONLY',
    restricted: true,
  },
  EXPENSE: {
    table: 'general_expenses',
    label: 'مصروف عمومي',
    flow: 'THREE_LEVELS',
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

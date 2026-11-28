import { AR } from '@/lib/format';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Page } from '@/lib/mutations';
import type { Approval, ApprovalStatus, BankPaid, BankPaymentMethod, ExpenseCategory } from './api';

export type AdjustmentKind = 'BONUS' | 'OVERTIME' | 'PENALTY' | 'ABSENCE';
export const ADJUSTMENTS: Record<AdjustmentKind, { label: string; adds: boolean }> = {
  BONUS: { label: 'مكافأة', adds: true },
  OVERTIME: { label: 'أوفر تايم', adds: true },
  PENALTY: { label: 'جزاء', adds: false },
  ABSENCE: { label: 'غياب', adds: false },
};

export interface Adjustment {
  kind: AdjustmentKind;
  amount: number | string;
  reason: string;
}

interface EmployeeRef {
  id: number;
  code: string;
  fullName: string;
  department?: string;
}
interface AccountRef {
  id: number;
  name: string;
  type: 'CASH' | 'BANK';
  currency: 'EGP' | 'USD';
}

export interface Salary extends Approval {
  id: number;
  employee: EmployeeRef;
  salaryMonth: string;
  basic: string;
  adjustments: Adjustment[];
  additions: string;
  deductions: string;
  advanceDeduction: string;
  net: string;
  account: AccountRef;
  paymentMethod: 'TRANSFER' | null;
  reference: string | null;
  paymentDate: string;
  notes: string | null;
}

export interface Advance extends Approval {
  id: number;
  employee: EmployeeRef;
  amount: string;
  advanceDate: string;
  account: AccountRef;
  paymentMethod: 'TRANSFER' | null;
  reference: string | null;
  notes: string | null;
}

export interface Expense extends Approval, BankPaid {
  id: number;
  expenseType: { id: number; name: string; category: ExpenseCategory | null };
  reference?: string | null;
  payee: string;
  amount: string;
  receiptNo: string;
  expenseDate: string;
  notes: string | null;
  account?: { id: number; name: string; type?: 'CASH' | 'BANK' };
}

export interface SalaryPreview {
  employee: { id: number; fullName: string; status: string };
  basic: string;
  advanceBalance: string;
  alreadyPaid: { id: number; net: string; paymentDate: string } | null;
}

export interface AdvanceBalance {
  employee: { id: number; fullName: string; code: string };
  advances: string;
  deducted: string;
  balance: string;
}

export interface AdvanceStatement {
  employee: { id: number; code: string; fullName: string };
  lines: {
    kind: 'ADVANCE' | 'DEDUCTION';
    id: number;
    date: string;
    debit: string;
    credit: string;
    balance: string;
    description: string;
    approvalStatus: ApprovalStatus;
  }[];
  totals: { advances: string; deducted: string; balance: string };
}

export interface ExpenseReport {
  total: string;
  count: number;
  byType: { expenseType: { id: number; name: string; category: ExpenseCategory | null }; total: string; count: number }[];
  byCategory: { category: ExpenseCategory; label: string; total: string; count: number }[];
  bankCharges: string;
  byPayee: { payee: string; total: string; count: number }[];
}

export interface ExpensesQuery {
  from?: string;
  to?: string;
  expenseTypeId?: number | '';
  payee?: string;
  status?: ApprovalStatus | '';
  page: number;
  /** Rows per page (the user's choice). */
  pageSize?: number;
}

export const officeKeys = {
  salaries: (q: object) => ['finance', 'salaries', q] as const,
  preview: (employeeId: number, month: string) => ['finance', 'salary-preview', employeeId, month] as const,
  advances: (q: object) => ['finance', 'advances', q] as const,
  balances: ['finance', 'advance-balances'] as const,
  statement: (id: number) => ['finance', 'advance-statement', id] as const,
  expenses: (q: object) => ['finance', 'expenses', q] as const,
  report: (q: object) => ['finance', 'expense-report', q] as const,
  types: ['finance', 'expense-types'] as const,
};

export const useSalaries = (q: { month?: string; employeeId?: number | ''; status?: ApprovalStatus | ''; page: number; pageSize?: number }) =>
  useQuery({
    queryKey: officeKeys.salaries(q),
    queryFn: () => api.get<Page<Salary> & { totalNet: string }>('/finance/salaries', { pageSize: 50, ...q }),
    placeholderData: keepPreviousData,
  });

export const useSalaryPreview = (employeeId: number | undefined, month: string) =>
  useQuery({
    queryKey: officeKeys.preview(employeeId ?? 0, month),
    queryFn: () => api.get<SalaryPreview>('/finance/salaries/preview', { employeeId, month }),
    enabled: !!employeeId && /^\d{4}-\d{2}$/.test(month),
  });

export const useAdvances = (q: { employeeId?: number | ''; page: number; pageSize?: number }) =>
  useQuery({
    queryKey: officeKeys.advances(q),
    queryFn: () => api.get<Page<Advance>>('/finance/advances', { pageSize: 20, ...q }),
    placeholderData: keepPreviousData,
  });

export const useAdvanceBalances = () =>
  useQuery({ queryKey: officeKeys.balances, queryFn: () => api.get<AdvanceBalance[]>('/finance/advances/balances') });

export const useAdvanceStatement = (employeeId: number | null) =>
  useQuery({
    queryKey: officeKeys.statement(employeeId ?? 0),
    queryFn: () => api.get<AdvanceStatement>(`/finance/employees/${employeeId}/advances`),
    enabled: !!employeeId,
  });

export const useExpenses = (q: ExpensesQuery) =>
  useQuery({
    queryKey: officeKeys.expenses(q),
    queryFn: () => api.get<Page<Expense>>('/finance/expenses', { pageSize: 25, ...q }),
    placeholderData: keepPreviousData,
  });

export const useExpenseReport = (q: Omit<ExpensesQuery, 'page'>, enabled: boolean) =>
  useQuery({
    queryKey: officeKeys.report(q),
    queryFn: () => api.get<ExpenseReport>('/finance/expenses/report', q),
    enabled,
    placeholderData: keepPreviousData,
  });

export const useExpenseTypes = () =>
  useQuery({
    queryKey: officeKeys.types,
    queryFn: () => api.get<{ id: number; name: string; category: ExpenseCategory | null }[]>('/finance/expenses/types'),
  });

export interface SalaryInput {
  employeeId: number;
  salaryMonth: string;
  adjustments: { kind: AdjustmentKind; amount: number; reason: string }[];
  advanceDeduction: number;
  accountId: number;
  /** from a bank: by transfer, with its reference */
  paymentMethod?: 'TRANSFER' | null;
  reference?: string | null;
  paymentDate?: string;
  notes?: string | null;
}

export const officeApi = {
  createSalary: (input: SalaryInput) => api.post<Salary>('/finance/salaries', input),
  updateSalary: (id: number, input: Partial<Omit<SalaryInput, 'employeeId' | 'salaryMonth'>> & { version: number }) =>
    api.patch<Salary>(`/finance/salaries/${id}`, input),
  createAdvance: (input: { employeeId: number; amount: number; accountId: number; paymentMethod?: 'TRANSFER' | null; reference?: string | null; advanceDate?: string; notes?: string }) =>
    api.post<Advance>('/finance/advances', input),
  updateAdvance: (id: number, input: { version: number; amount?: number; accountId?: number; paymentMethod?: 'TRANSFER' | null; reference?: string | null; advanceDate?: string; notes?: string | null }) =>
    api.patch<Advance>(`/finance/advances/${id}`, input),
  createExpense: (input: {
    expenseType: string;
    category?: ExpenseCategory;
    payee?: string;
    amount: number;
    receiptNo: string;
    expenseDate?: string;
    notes?: string;
    accountId?: number;
    paymentMethod?: BankPaymentMethod;
    reference?: string;
    bankCharges?: number;
  }) =>
    api.post<Expense>('/finance/expenses', input),
  updateExpense: (
    id: number,
    input: {
      version: number;
      expenseType?: string;
      category?: ExpenseCategory;
      payee?: string;
      amount?: number;
      receiptNo?: string;
      expenseDate?: string;
      notes?: string | null;
      paymentMethod?: BankPaymentMethod;
      reference?: string;
      bankCharges?: number;
    },
  ) => api.patch<Expense>(`/finance/expenses/${id}`, input),
};

/** "2026-11-01T00:00:00Z" → "نوفمبر 2026" */
export const monthLabel = (iso: string) =>
  new Intl.DateTimeFormat(AR, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso.length === 7 ? `${iso}-01` : iso));

export const currentMonth = () => new Date().toISOString().slice(0, 7);

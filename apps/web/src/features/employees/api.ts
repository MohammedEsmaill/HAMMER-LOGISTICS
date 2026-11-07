import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Page } from '@/lib/mutations';

export type Department = 'MANAGEMENT' | 'SCAN' | 'OPERATION' | 'NAFEZA' | 'ACCOUNTS' | 'AGENTS';
export type EmployeeStatus = 'ACTIVE' | 'LEFT';

export const DEPARTMENTS: Record<Department, string> = {
  MANAGEMENT: 'الإدارة',
  SCAN: 'SCAN',
  OPERATION: 'OPERATION',
  NAFEZA: 'NAFEZA',
  ACCOUNTS: 'الحسابات',
  AGENTS: 'مندوبين التوكيلات',
};

export interface Employee {
  id: number;
  code: string;
  fullName: string;
  nationalId: string;
  phone: string;
  address: string | null;
  department: Department;
  jobTitle: string;
  hireDate: string;
  status: EmployeeStatus;
  leaveDate: string | null;
  notes: string | null;
  /** Present only for users allowed to see salaries. */
  basicSalary?: string;
}

export interface EmployeeOption {
  id: number;
  fullName: string;
  code: string;
  department: Department;
}

export interface EmployeesQuery {
  search?: string;
  department?: Department | '';
  status?: EmployeeStatus | '';
  page: number;
}

export const employeeKeys = {
  all: ['employees'] as const,
  list: (q: EmployeesQuery) => ['employees', 'list', q] as const,
  options: (department?: Department) => ['employees', 'options', department ?? 'all'] as const,
};

export const useEmployees = (q: EmployeesQuery) =>
  useQuery({
    queryKey: employeeKeys.list(q),
    queryFn: () => api.get<Page<Employee>>('/employees', { ...q, pageSize: 25 }),
    placeholderData: keepPreviousData, // the table stays while the next page loads
  });

export const useEmployeeOptions = (department?: Department, enabled = true) =>
  useQuery({
    queryKey: employeeKeys.options(department),
    queryFn: () => api.get<EmployeeOption[]>('/employees/options', { department }),
    enabled,
  });

export interface EmployeeInput {
  code: string;
  fullName: string;
  nationalId: string;
  phone: string;
  address?: string;
  department: Department;
  jobTitle: string;
  hireDate: string;
  basicSalary?: number;
  notes?: string;
  status?: EmployeeStatus;
  leaveDate?: string | null;
}

export interface Handover {
  clients: number;
  activeShipments: number;
}

export const employeesApi = {
  create: (input: EmployeeInput) => api.post<Employee>('/employees', input),
  update: (id: number, input: Partial<EmployeeInput>) =>
    api.patch<{ employee: Employee; handover: Handover | null }>(`/employees/${id}`, input),
  remove: (id: number) => api.delete(`/employees/${id}`),
};

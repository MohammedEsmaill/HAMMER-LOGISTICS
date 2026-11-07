import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export type AccountType = 'EMPLOYEE' | 'CLEARER';

export interface User {
  id: number;
  email: string;
  accountType: AccountType;
  isActive: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  createdAt: string;
  role: { id: number; name: string; isSystem: boolean };
  employee: { id: number; fullName: string; department: string } | null;
  clearer: { id: number; fullName: string } | null;
}

export interface Candidate {
  id: number;
  fullName: string;
  code?: string;
  department?: string;
}

export interface NewUser {
  accountType: AccountType;
  ownerId: number;
  email: string;
  password: string;
  roleId: number;
}

export interface UserChanges {
  email?: string;
  roleId?: number;
  isActive?: boolean;
}

export const userKeys = {
  all: ['users'] as const,
  candidates: (type: AccountType) => ['users', 'candidates', type] as const,
};

export const useUsers = () =>
  useQuery({ queryKey: userKeys.all, queryFn: () => api.get<User[]>('/users') });

export const useCandidates = (type: AccountType, enabled: boolean) =>
  useQuery({
    queryKey: userKeys.candidates(type),
    queryFn: () => api.get<Candidate[]>('/users/candidates', { type }),
    enabled,
  });

export const usersApi = {
  create: (input: NewUser) => api.post<User>('/users', input),
  update: (id: number, changes: UserChanges) => api.patch<User>(`/users/${id}`, changes),
  resetPassword: (id: number, password: string) =>
    api.post(`/users/${id}/reset-password`, { password }),
  remove: (id: number) => api.delete(`/users/${id}`),
};

export const ownerName = (u: User) => u.employee?.fullName ?? u.clearer?.fullName ?? '—';

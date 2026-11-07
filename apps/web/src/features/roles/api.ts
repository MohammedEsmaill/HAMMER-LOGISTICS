import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export interface Role {
  id: number;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  _count: { users: number };
}

export interface RoleOption {
  id: number;
  name: string;
  description: string | null;
  isSystem: boolean;
}

export interface CatalogEntry {
  key: string;
  label: string;
  ceoOnly: boolean;
}

export interface RoleInput {
  name: string;
  description?: string;
  permissions: string[];
}

export const roleKeys = {
  all: ['roles'] as const,
  options: ['roles', 'options'] as const,
  catalog: ['roles', 'catalog'] as const,
};

export const useRoles = () =>
  useQuery({ queryKey: roleKeys.all, queryFn: () => api.get<Role[]>('/roles') });

export const useRoleOptions = () =>
  useQuery({ queryKey: roleKeys.options, queryFn: () => api.get<RoleOption[]>('/roles/options') });

/** The catalog only changes with a new release: cache it like the fixed lists. */
export const usePermissionCatalog = () =>
  useQuery({
    queryKey: roleKeys.catalog,
    queryFn: () => api.get<CatalogEntry[]>('/roles/permissions'),
    staleTime: 60 * 60 * 1000,
  });

export const rolesApi = {
  create: (input: RoleInput) => api.post<Role>('/roles', input),
  update: (id: number, input: RoleInput) => api.patch<Role>(`/roles/${id}`, input),
  remove: (id: number) => api.delete(`/roles/${id}`),
};

/** Section titles for the permission checklist, by the key's first segment. */
export const PERMISSION_GROUPS: Record<string, string> = {
  roles: 'الأدوار',
  users: 'المستخدمين',
  employees: 'الموظفين',
  clearers: 'المستخلصين',
  clients: 'العملاء',
  lookups: 'القوائم الثابتة',
  shipments: 'الشحنات',
  audit: 'المراجعة',
};

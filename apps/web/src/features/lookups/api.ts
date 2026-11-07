import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { STATIC_DATA } from '@/lib/query-client';

export type TransportKind = 'SEA' | 'AIR';
export const KINDS: Record<TransportKind, string> = { SEA: 'بحري', AIR: 'جوي' };

export interface Country {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string;
}

export interface Port {
  id: number;
  name: string;
  code: string | null;
  kind: TransportKind;
  countryId: number;
  isEgyptian: boolean;
  country: { code: string; nameAr: string };
}

export interface LookupRow {
  id: number;
  name: string;
  kind?: TransportKind;
  sortOrder?: number;
  portId?: number | null;
  port?: { id: number; name: string; code: string | null } | null;
}

export type SimpleLookup = 'carriers' | 'storage-yards' | 'free-zones' | 'inspection-authorities';

export interface PortsFilter {
  kind?: TransportKind;
  egyptian?: boolean;
}

/**
 * Every list is fetched whole and filtered in the browser: they are small, rarely
 * change, and are cached for an hour (and across reloads), so forms open instantly.
 */
export const lookupKeys = {
  all: ['lookups'] as const,
  countries: ['lookups', 'countries'] as const,
  ports: ['lookups', 'ports'] as const,
  simple: (lookup: SimpleLookup) => ['lookups', lookup] as const,
};

export const useCountries = () =>
  useQuery({ queryKey: lookupKeys.countries, queryFn: () => api.get<Country[]>('/lookups/countries'), ...STATIC_DATA });

export const usePorts = (filter: PortsFilter = {}) =>
  useQuery({
    queryKey: lookupKeys.ports,
    queryFn: () => api.get<Port[]>('/lookups/ports'),
    ...STATIC_DATA,
    select: (ports) =>
      ports.filter(
        (p) =>
          (!filter.kind || p.kind === filter.kind) &&
          (filter.egyptian === undefined || p.isEgyptian === filter.egyptian),
      ),
  });

export const useLookup = (lookup: SimpleLookup, filter: { kind?: TransportKind; portId?: number } = {}) =>
  useQuery({
    queryKey: lookupKeys.simple(lookup),
    queryFn: () => api.get<LookupRow[]>(`/lookups/${lookup}`),
    ...STATIC_DATA,
    select: (rows) =>
      rows.filter((r) => (!filter.kind || r.kind === filter.kind) && (!filter.portId || r.portId === filter.portId)),
  });

export const lookupsApi = {
  createPort: (input: { name: string; kind: TransportKind; code?: string; countryId: number }) =>
    api.post<Port>('/lookups/ports', input),
  updatePort: (id: number, input: { name?: string; code?: string }) => api.patch<Port>(`/lookups/ports/${id}`, input),
  removePort: (id: number) => api.delete(`/lookups/ports/${id}`),
  create: (lookup: SimpleLookup, input: { name: string; kind?: TransportKind; sortOrder?: number; portId?: number }) =>
    api.post<LookupRow>(`/lookups/${lookup}`, input),
  update: (lookup: SimpleLookup, id: number, input: { name?: string; sortOrder?: number; portId?: number | null }) =>
    api.patch<LookupRow>(`/lookups/${lookup}/${id}`, input),
  remove: (lookup: SimpleLookup, id: number) => api.delete(`/lookups/${lookup}/${id}`),
};

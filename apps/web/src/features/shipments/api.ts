import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Page } from '@/lib/mutations';
import type { ContainerType, CustomsField, CustomsRegime, Direction, LoadType, ShipmentKind, ShipmentMode } from './rules';

interface Named {
  id: number;
  name: string;
}
interface Person {
  id: number;
  fullName: string;
}
interface PortRef {
  id: number;
  name: string;
  code: string | null;
}

export interface ShipmentListItem {
  id: number;
  fileNo: string;
  direction: Direction;
  mode: ShipmentMode;
  currentStage: string;
  stageLabel: string;
  hblDisplay: string | null;
  referenceNumber: string | null;
  commodity: string;
  containersCount: number | null;
  eta: string | null;
  notificationDate: string;
  createdAt: string;
  client: Named;
  operationEmployee: Person;
  clearer: Person;
}

export interface Container {
  id: number;
  seq: number;
  containerNo: string | null;
  type: ContainerType;
  weight: string;
}

export type DocumentSection = 'SHIPPING_AGENCY' | 'CUSTOMS' | 'TRANSPORT' | 'SCANS';

/** The sections of a shipment's files. */
export const DOCUMENT_SECTIONS: Record<DocumentSection, string> = {
  SHIPPING_AGENCY: 'توكيلات ملاحية',
  CUSTOMS: 'جمارك',
  TRANSPORT: 'نقل',
  SCANS: 'الصور الضوئية',
};

export interface ShipmentDocument {
  id: number;
  name: string;
  section: DocumentSection;
  fileName: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: { id: number; email: string };
}

export interface InspectionItem {
  id: string;
  authorityId: number;
  requestedAt: string;
  result: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  resultDate: string | null;
  notes: string | null;
}

export interface StageHistoryEntry {
  from: string | null;
  to: string;
  movement: 'FORWARD' | 'BACKWARD';
  at: string;
  recordedAt?: string;
  by: number;
  reason?: string;
}

export interface StageStep {
  stage: string;
  label: string;
  group: 'AUTO' | 'OPERATION' | 'CUSTOMS';
  done: boolean;
}

export type Shipment = Omit<ShipmentListItem, 'containersCount'> &
  Partial<Record<Exclude<CustomsField, 'storageYardId' | 'certificateNo' | 'declarantId'>, string | null>> & {
    kind: ShipmentKind;
    version: number;
    containersCount: number | null;
    factory: Named;
    country: { id: number; code: string; nameAr: string };
    foreignPartyName: string;
    consignee: string;
    customsRegime: CustomsRegime | null;
    packagesCount: number;
    totalWeight: string;
    carrier: Named | null;
    loadingPort: PortRef | null;
    dischargePort: PortRef | null;
    freeZone: Named | null;
    storageYard: Named | null;
    storageYardId: number | null;
    declarant: Named | null;
    declarantId: number | null;
    certificateNo: string | null;
    hblNumber: string | null;
    mblNumber: string | null;
    voyageNo: string | null;
    bookingNo: string | null;
    loadType: LoadType | null;
    vesselName: string | null;
    containers: Container[];
    documents: ShipmentDocument[];
    inspections: InspectionItem[];
    stageHistory: StageHistoryEntry[];
    stages: StageStep[];
    createdBy: { id: number; email: string };
    clientId: number;
    factoryId: number;
    clearerId: number;
    countryId: number;
    carrierId: number | null;
    loadingPortId: number | null;
    dischargePortId: number | null;
    freeZoneId: number | null;
  };

export interface ShipmentsQuery {
  search: string;
  kind: ShipmentKind | '';
  stage: string;
  /** The shipments of one مقدم بيان. */
  declarantId?: number | '';
  page: number;
  pageSize?: number;
}

export interface ContainerInput {
  containerNo?: string;
  type: ContainerType;
  weight: number;
}

/** The registration body; fields a type does not use must be left out. */
export interface ShipmentInput {
  direction: Direction;
  mode: ShipmentMode;
  clientId: number;
  factoryId: number;
  clearerId: number;
  foreignPartyName: string;
  countryId: number;
  consignee: string;
  commodity: string;
  customsRegime?: CustomsRegime;
  notificationDate?: string;
  packagesCount: number;
  totalWeight?: number;
  carrierId?: number;
  loadingPortId?: number;
  dischargePortId?: number;
  freeZoneId?: number;
  referenceNumber?: string;
  hblNumber?: string;
  mblNumber?: string;
  voyageNo?: string;
  bookingNo?: string;
  loadType?: LoadType;
  containers?: ContainerInput[];
  vesselName?: string;
  eta?: string;
}

export const shipmentKeys = {
  all: ['shipments'] as const,
  list: (q: ShipmentsQuery) => ['shipments', 'list', q] as const,
  one: (id: number) => ['shipments', 'one', id] as const,
};

/** The list's filters as the API reads them (the list and its report share them). */
export function shipmentFilters(q: Pick<ShipmentsQuery, 'search' | 'kind' | 'stage' | 'declarantId'>) {
  const [direction, ...mode] = q.kind ? q.kind.split('_') : [];
  return {
    search: q.search || undefined,
    stage: q.stage || undefined,
    declarantId: q.declarantId || undefined,
    direction,
    mode: mode.join('_') || undefined,
  };
}

export const useShipments = (q: ShipmentsQuery) =>
  useQuery({
    queryKey: shipmentKeys.list(q),
    queryFn: () => api.get<Page<ShipmentListItem>>('/shipments', { ...shipmentFilters(q), page: q.page, pageSize: q.pageSize ?? 25 }),
    placeholderData: keepPreviousData,
  });

export interface ReportShipment extends Omit<ShipmentListItem, 'containersCount'> {
  factory: Named;
  carrier: Named | null;
  declarant: Named | null;
  place: Named | null;
  vesselName: string | null;
  certificateNo: string | null;
  packagesCount: number;
  totalWeight: string;
  containers: ContainerType[];
}

export interface ShipmentsReport {
  items: ReportShipment[];
  summary: { count: number; containers: Partial<Record<ContainerType, number>>; packages: number; weight: string };
}

/** Every shipment the filters match (not one page), for the printed and Excel report. */
export const useShipmentsReport = (q: Pick<ShipmentsQuery, 'search' | 'kind' | 'stage' | 'declarantId'>) =>
  useQuery({
    queryKey: [...shipmentKeys.all, 'report', q],
    queryFn: () => api.get<ShipmentsReport>('/shipments/report', shipmentFilters(q)),
  });

export const useShipment = (id: number) =>
  useQuery({ queryKey: shipmentKeys.one(id), queryFn: () => api.get<Shipment>(`/shipments/${id}`) });

// pickers for the registration form; short-lived cache (they change with the admin screens)
/** With a direction, an operation employee gets only their clients for it. */
export const useClientOptions = (direction?: 'IMPORT' | 'EXPORT') =>
  useQuery({
    queryKey: ['clients', 'options', direction ?? 'all'],
    queryFn: () => api.get<Named[]>('/clients/options', { direction }),
    staleTime: 5 * 60_000,
  });

export const useFactories = (clientId: number | undefined) =>
  useQuery({
    queryKey: ['clients', 'factory-options', clientId],
    queryFn: () => api.get<(Named & { taxNumber: string })[]>(`/clients/${clientId}/factories/options`),
    enabled: !!clientId,
    staleTime: 5 * 60_000,
  });

export interface ClearerOption {
  id: number;
  fullName: string;
  /** جهة التخليص */
  portIds: number[];
  freeZoneIds: number[];
}

export const useClearerOptions = () =>
  useQuery({ queryKey: ['clearers', 'options'], queryFn: () => api.get<ClearerOption[]>('/clearers/options'), staleTime: 5 * 60_000 });

const path = (id: number, rest = '') => `/shipments/${id}${rest}`;

/** Optional numbers an edit may clear (null). */
type Clearable = 'hblNumber' | 'voyageNo' | 'bookingNo';

export const shipmentsApi = {
  create: (input: ShipmentInput) => api.post<Shipment>('/shipments', input),
  updateBasic: (
    id: number,
    input: Partial<Omit<ShipmentInput, Clearable>> & { version: number } & Partial<Record<Clearable, string | null>>,
  ) =>
    api.patch<Shipment>(path(id, '/basic'), input),
  updateOperation: (id: number, input: { version: number; vesselName?: string | null; eta?: string | null }) =>
    api.patch<Shipment>(path(id, '/operation'), input),
  reassign: (id: number, input: { version: number; operationEmployeeId: number }) =>
    api.patch<Shipment>(path(id, '/operation-employee'), input),
  updateCustoms: (id: number, input: Record<string, unknown> & { version: number }) =>
    api.patch<Shipment>(path(id, '/customs'), input),
  addInspection: (id: number, input: Omit<InspectionItem, 'id'> & { version: number }) =>
    api.post<Shipment>(path(id, '/inspections'), input),
  updateInspection: (id: number, itemId: string, input: Partial<Omit<InspectionItem, 'id' | 'authorityId'>> & { version: number }) =>
    api.patch<Shipment>(path(id, `/inspections/${itemId}`), input),
  removeInspection: (id: number, itemId: string, version: number) =>
    api.delete<Shipment>(path(id, `/inspections/${itemId}`), { version }),
  moveStage: (id: number, input: { version: number; to: string; occurredAt?: string; reason?: string }) =>
    api.post<Shipment>(path(id, '/stage'), input),
  uploadDocument: (id: number, name: string, section: DocumentSection, file: File) => {
    const form = new FormData();
    form.append('name', name);
    form.append('section', section);
    form.append('file', file);
    return api.upload<ShipmentDocument>(path(id, '/documents'), form);
  },
  moveDocument: (id: number, documentId: number, section: DocumentSection) =>
    api.patch<ShipmentDocument>(path(id, `/documents/${documentId}`), { section }),
  removeDocument: (id: number, documentId: number) => api.delete(path(id, `/documents/${documentId}`)),
};

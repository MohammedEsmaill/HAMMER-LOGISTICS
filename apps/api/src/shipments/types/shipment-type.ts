import { Direction, ShipmentMode, TransportKind } from '@prisma/client';
import { ShipmentKind } from '../stages';

export interface PortRule {
  kind: TransportKind;
  egyptian: boolean;
  label: string; // used in error messages
}

/**
 * What one shipment type needs and refuses. Adding a type = adding one of these
 * (Open/Closed): the registration service reads the rules, it does not branch on types.
 */
export interface ShipmentTypeRules {
  kind: ShipmentKind;
  direction: Direction;
  mode: ShipmentMode;
  label: string;
  /** null = the type has no ports (free zone). */
  route: { loading: PortRule; discharge: PortRule } | null;
  carrierKind: TransportKind | null;
  freeZone: boolean;
  /** ACID for import, UCR for export; null = none (free zone). */
  reference: 'ACID' | 'UCR' | null;
  /** MB/L (or MAWB): required, optional, or not used. HB/L is always optional. */
  masterBill: 'required' | 'optional' | 'none';
  voyageAndBooking: boolean;
  containers: boolean;
  customsRegime: boolean;
}

const WORLD_SEA: PortRule = {
  kind: 'SEA',
  egyptian: false,
  label: 'ميناء عالمي',
};
const EGYPT_SEA: PortRule = {
  kind: 'SEA',
  egyptian: true,
  label: 'ميناء مصري',
};
const WORLD_AIR: PortRule = {
  kind: 'AIR',
  egyptian: false,
  label: 'مطار عالمي',
};
const EGYPT_AIR: PortRule = { kind: 'AIR', egyptian: true, label: 'مطار مصري' };

export const SHIPMENT_TYPES: Record<ShipmentKind, ShipmentTypeRules> = {
  IMPORT_SEA: {
    kind: 'IMPORT_SEA',
    direction: 'IMPORT',
    mode: 'SEA',
    label: 'وارد بحري',
    route: { loading: WORLD_SEA, discharge: EGYPT_SEA },
    carrierKind: 'SEA',
    freeZone: false,
    reference: 'ACID',
    masterBill: 'required',
    voyageAndBooking: true,
    containers: true,
    customsRegime: true,
  },
  IMPORT_AIR: {
    kind: 'IMPORT_AIR',
    direction: 'IMPORT',
    mode: 'AIR',
    label: 'وارد جوي',
    route: { loading: WORLD_AIR, discharge: EGYPT_AIR },
    carrierKind: 'AIR',
    freeZone: false,
    reference: 'ACID',
    masterBill: 'required',
    voyageAndBooking: true,
    containers: false,
    customsRegime: true,
  },
  IMPORT_FREE_ZONE: {
    kind: 'IMPORT_FREE_ZONE',
    direction: 'IMPORT',
    mode: 'FREE_ZONE',
    label: 'وارد بضائع المناطق الحرة',
    route: null,
    carrierKind: null,
    freeZone: true,
    reference: null,
    masterBill: 'none',
    voyageAndBooking: false,
    containers: false,
    customsRegime: true,
  },
  EXPORT_SEA: {
    kind: 'EXPORT_SEA',
    direction: 'EXPORT',
    mode: 'SEA',
    label: 'صادر بحري',
    route: { loading: EGYPT_SEA, discharge: WORLD_SEA },
    carrierKind: 'SEA',
    freeZone: false,
    reference: 'UCR',
    masterBill: 'optional',
    voyageAndBooking: true,
    containers: true,
    customsRegime: false,
  },
  EXPORT_AIR: {
    kind: 'EXPORT_AIR',
    direction: 'EXPORT',
    mode: 'AIR',
    label: 'صادر جوي',
    route: { loading: EGYPT_AIR, discharge: WORLD_AIR },
    carrierKind: 'AIR',
    freeZone: false,
    reference: 'UCR',
    masterBill: 'optional',
    voyageAndBooking: true,
    containers: false,
    customsRegime: false,
  },
};

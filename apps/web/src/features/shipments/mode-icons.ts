import { Anchor, Plane, Warehouse } from 'lucide-react';
import type { ShipmentMode } from './rules';

export const MODE_ICONS: Record<ShipmentMode, typeof Anchor> = { SEA: Anchor, AIR: Plane, FREE_ZONE: Warehouse };

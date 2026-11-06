import { ShipmentStage } from '@prisma/client';

/** One entry of shipments.stage_history. */
export interface StageHistoryEntry {
  from: ShipmentStage | null;
  to: ShipmentStage;
  movement: 'FORWARD' | 'BACKWARD';
  /** When it happened (may be set back if recorded late). */
  at: string;
  /** When it was recorded. */
  recordedAt?: string;
  by: number;
  reason?: string;
}

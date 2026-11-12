import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { financeKeys } from './api';

export type Regime = 'FINAL' | 'TEMPORARY';

export const REGIMES: Record<Regime, string> = { TEMPORARY: 'سماح مؤقت', FINAL: 'نهائي' };

/** أتعاب المستخلص for sea imports through Alexandria / El Dekheila, by customs regime. */
export interface FeeRate {
  regime: Regime;
  firstContainer: string;
  extraContainer: string;
}

/** A fixed-price item a clearer's custody is settled with (once per shipment). */
export interface SettlementItem {
  id: number;
  name: string;
  price: string;
  perContainer: boolean;
  isActive: boolean;
  sortOrder: number;
}

export const pricesKey = [...financeKeys.all, 'prices'] as const;

export const usePrices = (enabled = true) =>
  useQuery({
    queryKey: pricesKey,
    queryFn: () => api.get<{ feeRates: FeeRate[]; items: SettlementItem[] }>('/finance/prices'),
    staleTime: 5 * 60_000,
    enabled,
  });

export const pricesApi = {
  updateFeeRate: (regime: Regime, body: { firstContainer: number; extraContainer: number }) =>
    api.patch<FeeRate>(`/finance/prices/fee-rates/${regime}`, body),
  createItem: (body: { name: string; price: number; perContainer: boolean }) => api.post<SettlementItem>('/finance/prices/items', body),
  updateItem: (id: number, body: Partial<{ name: string; price: number; perContainer: boolean; isActive: boolean }>) =>
    api.patch<SettlementItem>(`/finance/prices/items/${id}`, body),
};

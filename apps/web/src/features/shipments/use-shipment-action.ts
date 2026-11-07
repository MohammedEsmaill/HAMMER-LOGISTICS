import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-error';
import { shipmentKeys, type Shipment } from './api';

/**
 * A write to one shipment. Every edit returns the updated shipment, which replaces the
 * cached one (new version included). A 409 means someone else changed the file first:
 * the latest copy is fetched so the next try starts from it.
 */
export function useShipmentAction<TVars>(id: number, fn: (vars: TVars) => Promise<Shipment | unknown>, success?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result) => {
      if (result && typeof result === 'object' && 'version' in result) {
        queryClient.setQueryData(shipmentKeys.one(id), result as Shipment);
      } else {
        await queryClient.invalidateQueries({ queryKey: shipmentKeys.one(id) });
      }
      void queryClient.invalidateQueries({ queryKey: [...shipmentKeys.all, 'list'] });
      if (success) toast.success(success);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: shipmentKeys.one(id) });
      }
    },
  });
}

/** "2026-11-07T00:00:00.000Z" → "2026-11-07" for date inputs. */
export const dayValue = (value: string | null | undefined) => (value ? value.slice(0, 10) : '');

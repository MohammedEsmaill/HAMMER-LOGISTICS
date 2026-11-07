import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorMessages } from './api-error';

/**
 * A write to the API: on success it shows a short confirmation and refreshes the
 * affected lists. Errors are left to the caller: forms show them inline (ErrorBox),
 * row actions call toastError.
 */
export function useAction<TVars, TResult>(
  fn: (vars: TVars) => Promise<TResult>,
  options: { success?: string; invalidate?: QueryKey[] } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      if (options.success) toast.success(options.success);
      await Promise.all(
        (options.invalidate ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });
}

export function toastError(error: unknown) {
  const [first, ...rest] = errorMessages(error);
  toast.error(first, rest.length ? { description: rest.join('\n') } : undefined);
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

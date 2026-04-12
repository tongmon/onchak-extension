import { queryOptions, useQuery } from '@tanstack/react-query';
import { sendRuntimeMessage } from '@/shared/extension';

export const extensionContextQueryOptions = queryOptions({
  queryKey: ['extension-context'],
  queryFn: async () =>
    sendRuntimeMessage({
      type: 'system/get-extension-context',
    }),
});

export function useExtensionContextQuery() {
  return useQuery(extensionContextQueryOptions);
}


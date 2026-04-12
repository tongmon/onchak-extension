import { queryOptions, useQuery } from '@tanstack/react-query';
import { authStorage } from '../model/auth-storage';
import type { AuthState } from '../model/schema';

export const authStateQueryKey = ['auth', 'state'] as const;

export const authStateQueryOptions = queryOptions<AuthState>({
  queryKey: authStateQueryKey,
  staleTime: Infinity,
  gcTime: Infinity,
  queryFn: async () => {
    await authStorage.ensureDefaults();

    const [config, session] = await Promise.all([
      authStorage.getConfig(),
      authStorage.getSession(),
    ]);

    return {
      config,
      session,
    };
  },
});

export function useAuthStateQuery() {
  return useQuery(authStateQueryOptions);
}

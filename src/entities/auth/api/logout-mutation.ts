import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authStateQueryKey } from './get-auth-state-query';
import { authStorage } from '../model/auth-storage';
import type { AuthState } from '../model/schema';

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['auth', 'logout'],
    networkMode: 'always',
    mutationFn: async (): Promise<AuthState> => {
      const config = await authStorage.getConfig();

      await authStorage.clearSession();

      return {
        config,
        session: null,
      };
    },
    onSuccess: (authState) => {
      queryClient.setQueryData(authStateQueryKey, authState);
    },
  });
}

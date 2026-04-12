import { useMutation, useQueryClient } from '@tanstack/react-query';
import { login } from './auth-client';
import { authStateQueryKey } from './get-auth-state-query';
import { authStorage } from '../model/auth-storage';
import {
  normalizeAuthConfig,
  type AuthConfig,
  type AuthState,
  type LoginCredentials,
} from '../model/schema';

export interface LoginMutationVariables {
  credentials: LoginCredentials;
  config: Partial<AuthConfig>;
}

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['auth', 'login'],
    networkMode: 'always',
    mutationFn: async ({
      config,
      credentials,
    }: LoginMutationVariables): Promise<AuthState> => {
      const nextConfig = normalizeAuthConfig(config);

      await authStorage.setConfig(nextConfig);

      const session = await login(credentials, nextConfig);

      await authStorage.setSession(session);

      return {
        config: nextConfig,
        session,
      };
    },
    onSuccess: (authState) => {
      queryClient.setQueryData(authStateQueryKey, authState);
    },
  });
}

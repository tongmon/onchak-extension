import type { AuthConfig, AuthMode } from '@/entities/auth';

export interface LoginFormValues {
  email: string;
  password: string;
  mode: AuthMode;
  apiBaseUrl: string;
  csrfPath: string;
}

export function createInitialLoginFormValues(
  authConfig: AuthConfig,
): LoginFormValues {
  return {
    email: '',
    password: '',
    mode: authConfig.mode,
    apiBaseUrl: authConfig.apiBaseUrl,
    csrfPath: authConfig.csrfPath,
  };
}

import { authenticatedFetch, requireRemoteSession } from "./session-client.ts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authStateQueryKey } from "./get-auth-state-query";
import { authStorage } from "../model/auth-storage";
import type { AuthState } from "../model/schema";

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["auth", "logout"],
    networkMode: "always",
    mutationFn: async (): Promise<AuthState> => {
      const { session } = await requireRemoteSession();
      const response = await authenticatedFetch(
        "/api/auth/logout",
        { method: "POST" },
        10000,
        session.accessToken,
      );
      if (!response.ok)
        throw new Error("서버 로그아웃에 실패했습니다. 다시 시도해 주세요.");
      await authStorage.clearSession(session.accessToken);

      return {
        config: await authStorage.getConfig(),
        session: await authStorage.getSession(),
      };
    },
    onSuccess: (authState) => {
      queryClient.setQueryData(authStateQueryKey, authState);
    },
  });
}

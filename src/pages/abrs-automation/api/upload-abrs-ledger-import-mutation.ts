import { useMutation } from '@tanstack/react-query';
import { authStorage } from '@/entities/auth';
import {
  abrsLedgerImportPath,
  buildAbrsLedgerImportFormData,
  buildAbrsLedgerImportUrl,
  createAbrsLedgerImportHeaders,
  extractAbrsLedgerImportErrorMessage,
} from './abrs-ledger-import-request';
import {
  createAbrsLedgerBatchName,
  validateAbrsLedgerFiles,
  type AbrsLedgerFileEntry,
} from '../model/abrs-ledger-files';

export interface UploadAbrsLedgerImportMutationVariables {
  targetDate: string;
  entries: AbrsLedgerFileEntry[];
}

export interface UploadAbrsLedgerImportMutationResult {
  batchName: string;
  response: unknown;
  url: string;
}

const MISSING_LOGIN_SESSION_MESSAGE =
  '로그인 세션을 찾을 수 없습니다. 다시 로그인한 뒤 업로드해주세요.';

const MISSING_ACCESS_TOKEN_MESSAGE =
  '인증 토큰을 찾을 수 없습니다. 다시 로그인한 뒤 업로드해주세요.';

const EXPIRED_LOGIN_SESSION_MESSAGE =
  '로그인 세션이 만료되었습니다. 다시 로그인한 뒤 업로드해주세요.';

async function parseResponseJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function uploadAbrsLedgerImport({
  targetDate,
  entries,
}: UploadAbrsLedgerImportMutationVariables): Promise<UploadAbrsLedgerImportMutationResult> {
  const validation = validateAbrsLedgerFiles(entries, targetDate);

  if (!validation.ok) {
    throw new Error(validation.messages.join('\n'));
  }

  const [config, session] = await Promise.all([
    authStorage.getConfig(),
    authStorage.getSession(),
  ]);

  if (!session) {
    throw new Error(MISSING_LOGIN_SESSION_MESSAGE);
  }

  if (!session.accessToken) {
    throw new Error(MISSING_ACCESS_TOKEN_MESSAGE);
  }

  const batchName = createAbrsLedgerBatchName(targetDate);
  const url = buildAbrsLedgerImportUrl(config.apiBaseUrl, abrsLedgerImportPath);
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: createAbrsLedgerImportHeaders({
      accessToken: session.accessToken,
      csrfToken: session.csrfToken,
      tokenType: session.tokenType,
    }),
    body: buildAbrsLedgerImportFormData({
      targetDate,
      batchName,
      entries,
    }),
  });
  const responsePayload = await parseResponseJson(response);

  if (!response.ok) {
    if (response.status === 401) {
      await authStorage.clearSession();
      throw new Error(EXPIRED_LOGIN_SESSION_MESSAGE);
    }

    throw new Error(
      extractAbrsLedgerImportErrorMessage(
        responsePayload,
        `Ledger import failed with status ${response.status}.`,
      ),
    );
  }

  return {
    batchName,
    response: responsePayload,
    url,
  };
}

export function useUploadAbrsLedgerImportMutation() {
  return useMutation({
    mutationKey: ['abrs-ledger-import', 'upload'],
    networkMode: 'always',
    mutationFn: uploadAbrsLedgerImport,
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Missing data and errors are never interpreted as verified zero-cost statements. */
export function assertAbrsLedgerPreflightCanUpload(preflight: Record<string, unknown>): void {
  if (typeof preflight.canAnalyze !== 'boolean' || !Array.isArray(preflight.missingFileTypes) || !Array.isArray(preflight.files)) {
    throw new Error('서버 사전 검사 응답을 확인할 수 없습니다. 파일은 보관되어 있습니다.');
  }
  const issues = [
    ...(Array.isArray(preflight.issues) ? preflight.issues : []),
    ...preflight.files.flatMap((file) => {
      const item = record(file);
      return Array.isArray(item?.issues) ? item.issues : [];
    }),
  ].map(record).filter((item): item is Record<string, unknown> => item !== null);
  const errors = issues.filter((issue) => issue.severity === 'ERROR')
    .map((issue) => typeof issue.message === 'string' ? issue.message : '파일 내용 검사 오류');
  const missing = preflight.missingFileTypes.filter((type): type is string => typeof type === 'string');
  if (!preflight.canAnalyze || errors.length || missing.length) {
    throw new Error([
      '서버 사전 검사에서 업로드를 중단했습니다. 파일은 보관되어 있습니다.',
      ...errors,
      ...(missing.length ? [`누락 자료: ${missing.join(', ')}`] : []),
    ].join('\n'));
  }
}

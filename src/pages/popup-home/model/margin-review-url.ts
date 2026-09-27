export function marginReviewUrl(apiBaseUrl: string, marginResultId: string): string {
  const base = apiBaseUrl === 'http://localhost:8080' ? 'http://localhost:5173' : apiBaseUrl;
  const url = new URL('/app/margin-results', base);
  url.searchParams.set('marginResultId', marginResultId);
  return url.toString();
}

// Cesium often rejects with RequestErrorEvent, which is not an Error instance.
// Never surface its raw URL/response: those can contain access tokens.
export function describeWorldFailure(provider: string, error: unknown): string {
  const status = error && typeof error === "object" && "statusCode" in error ? error.statusCode : undefined;
  if (status === 401 || status === 403) {
    return `${provider} access was rejected. The site owner needs to restore the scenery service credentials.`;
  }
  if (status === 429) return `${provider} has reached its service limit. Try again later.`;
  return `${provider} could not load. Check your connection and retry.`;
}

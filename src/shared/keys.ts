/**
 * Stable key computation for idempotent analysis requests
 * Keys must be deterministic across background/popup contexts
 */

export function computeStableKey({ url, model, params, appVersion }: any) {
  // No timestamps, randoms, or unstable values that change between calls
  const base = JSON.stringify({ 
    url: url,
    model: model, 
    params: params, 
    appVersion: appVersion || "1.0.0" 
  });
  
  const hash = simpleHash(base);
  return `analysis:${url}|${hash}`;
}

/**
 * Simple deterministic hash function
 */
function simpleHash(str: string): string {
  let hash = 0;
  if (str.length === 0) return '0';
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return Math.abs(hash).toString(36);
}

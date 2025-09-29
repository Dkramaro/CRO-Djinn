/**
 * Idempotency utilities for preventing duplicate analysis requests
 * Based on battle-tested patterns for Chrome extension MV3 architecture
 */

/**
 * Input parameters for generating analysis keys
 */
export interface AnalysisKeyInput {
  url: string;
  viewport?: string;
  model: string;
  paramsHash: string; // stable hash of prompt flags, settings, etc.
  domSnapshotHash?: string; // optional: hash of DOM state for true page-state identity
}

/**
 * Generate a deterministic idempotency key for analysis requests
 * Same input always produces the same key, enabling duplicate detection
 */
export function analysisKey(input: AnalysisKeyInput): string {
  // Keep it short but collision-resistant
  const baseKey = `${input.url}|${input.viewport || ''}|${input.model}|${input.paramsHash}`;
  
  // Add DOM snapshot hash if provided for more precise deduplication
  const fullKey = input.domSnapshotHash 
    ? `${baseKey}|${input.domSnapshotHash}`
    : baseKey;
  
  // Create a stable hash of the key for consistent short identifiers
  const hash = simpleHash(fullKey);
  
  return `analysis:${hash}`;
}

/**
 * Generate stable hash of analysis parameters for consistent key generation
 */
export function generateParamsHash(settings: any, features?: any): string {
  const params = {
    provider: settings.provider,
    model: settings.openaiModel || settings.geminiModel,
    fullPage: settings.fullPageScreenshot || false,
    features: features || {}
  };
  
  return simpleHash(JSON.stringify(params));
}

/**
 * Generate optional DOM snapshot hash for more precise deduplication
 * This can be used when you want to detect actual content changes
 */
export function generateDOMSnapshotHash(pageData: any): string {
  // Create hash of key page elements that affect conversion analysis
  const snapshot = {
    title: pageData.title,
    metaDescription: pageData.metaDescription,
    headings: pageData.structuredContent?.headings?.map((h: any) => h.text).slice(0, 10) || [],
    buttons: pageData.structuredContent?.buttons?.map((b: any) => b.text).slice(0, 10) || [],
    forms: pageData.structuredContent?.forms?.length || 0,
    contentLength: pageData.fullTextContent?.length || 0,
    contentHash: simpleHash(pageData.fullTextContent?.substring(0, 1000) || '')
  };
  
  return simpleHash(JSON.stringify(snapshot));
}

/**
 * Simple but effective hash function for generating consistent short identifiers
 */
function simpleHash(str: string): string {
  let hash = 0;
  if (str.length === 0) return '0';
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert to positive hex string
  return Math.abs(hash).toString(36);
}

/**
 * Validate that an analysis key has the correct format
 */
export function isValidAnalysisKey(key: string): boolean {
  return typeof key === 'string' && key.startsWith('analysis:') && key.length > 10;
}

/**
 * Extract timestamp from job for cleanup purposes
 */
export function extractTimestampFromKey(key: string): number {
  // If we have a timestamp-based component, extract it
  // For now, return current time as fallback
  return Date.now();
}

/**
 * Helper to check if two analysis requests should be considered duplicates
 */
export function areRequestsDuplicate(req1: AnalysisKeyInput, req2: AnalysisKeyInput): boolean {
  return analysisKey(req1) === analysisKey(req2);
}

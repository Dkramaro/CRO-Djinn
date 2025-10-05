/**
 * Security utilities for sanitizing sensitive data in logs and error messages
 * 
 * CRITICAL: These functions prevent API keys from being exposed in error messages
 * that users might screenshot or share for support.
 */

/**
 * Sanitize error messages and API responses to remove sensitive data
 * 
 * Removes:
 * - OpenAI API keys (sk-...)
 * - Gemini API keys (AIza...)
 * - Bearer tokens
 * - Authorization headers
 * 
 * @param message - Error message or API response text to sanitize
 * @returns Sanitized message with sensitive data replaced with ***
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message || typeof message !== 'string') {
    return String(message);
  }

  let sanitized = message;

  // Remove OpenAI API keys (sk-xxx format)
  // Matches: sk- followed by any combination of letters, numbers, underscores, hyphens
  sanitized = sanitized.replace(/sk-[a-zA-Z0-9_-]{20,}/g, 'sk-***');

  // Remove Gemini API keys (AIza format)
  // Matches: AIza followed by any combination of letters, numbers, underscores, hyphens
  sanitized = sanitized.replace(/AIza[a-zA-Z0-9_-]{20,}/g, 'AIza***');

  // Remove Bearer tokens from error messages
  // Matches: Bearer followed by space and token
  sanitized = sanitized.replace(/Bearer\s+[^\s"']+/gi, 'Bearer ***');

  // Remove Authorization header values
  // Matches: Authorization: followed by value
  sanitized = sanitized.replace(/Authorization:\s*[^\s"']+/gi, 'Authorization: ***');

  // Remove x-goog-api-key header values
  sanitized = sanitized.replace(/x-goog-api-key:\s*[^\s"']+/gi, 'x-goog-api-key: ***');

  return sanitized;
}

/**
 * Sanitize an Error object, replacing its message with a sanitized version
 * 
 * @param error - Error object to sanitize
 * @returns New Error object with sanitized message
 */
export function sanitizeError(error: Error): Error {
  const sanitizedMessage = sanitizeErrorMessage(error.message);
  const sanitizedError = new Error(sanitizedMessage);
  sanitizedError.name = error.name;
  sanitizedError.stack = error.stack; // Keep stack trace for debugging (it doesn't contain API keys)
  return sanitizedError;
}

/**
 * Sanitize API response text before logging or throwing
 * 
 * @param responseText - Raw API response text
 * @returns Sanitized response text
 */
export function sanitizeApiResponse(responseText: string): string {
  return sanitizeErrorMessage(responseText);
}

/**
 * Check if a string contains potential API keys (for validation)
 * 
 * @param text - Text to check
 * @returns true if text contains patterns that look like API keys
 */
export function containsSensitiveData(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const sensitivePatterns = [
    /sk-[a-zA-Z0-9_-]{20,}/,      // OpenAI keys
    /AIza[a-zA-Z0-9_-]{20,}/,      // Gemini keys
    /Bearer\s+[^\s"']{20,}/i,      // Bearer tokens
  ];

  return sensitivePatterns.some(pattern => pattern.test(text));
}

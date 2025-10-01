/**
 * Debug Configuration
 * 
 * IMPORTANT: All flags must be set to FALSE before publishing to Chrome Web Store.
 * These flags enable detailed console logging during development only.
 */

export const DEBUG = {
  /** Enable detailed encryption/decryption logs (never log actual keys) */
  ENCRYPTION: false,
  
  /** Enable detailed storage operation logs */
  STORAGE: false,
  
  /** Enable detailed API call logs */
  API_CALLS: false,
  
  /** Enable general debug logs */
  GENERAL: false
};

/**
 * Safe logging helper - logs metadata without exposing sensitive data
 */
export const safeLog = {
  apiKey: (key: string | undefined, provider: 'openai' | 'gemini') => {
    if (!DEBUG.ENCRYPTION) return;
    
    const expectedPrefix = provider === 'openai' ? 'sk-' : 'AIza';
    console.log(`🔑 API Key Debug (${provider}):`, {
      present: !!key,
      length: key?.length || 0,
      validFormat: key?.startsWith(expectedPrefix) || false,
      type: typeof key
    });
  },
  
  settings: (settings: any) => {
    if (!DEBUG.STORAGE) return;
    
    console.log('⚙️ Settings Debug:', {
      provider: settings.provider,
      hasOpenaiKey: !!settings.openaiApiKey,
      hasGeminiKey: !!settings.geminiApiKey,
      openaiKeyLength: settings.openaiApiKey?.length || 0,
      geminiKeyLength: settings.geminiApiKey?.length || 0,
      openaiModel: settings.openaiModel,
      geminiModel: settings.geminiModel
    });
  }
};


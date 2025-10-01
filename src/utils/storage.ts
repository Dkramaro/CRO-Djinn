import { CachedAudit, ExtensionSettings, LLMAnalysis, RawPageData } from '../types';
import { EncryptionManager } from './encryption';
import { DEBUG, safeLog } from '../config/debug';

export class StorageManager {
  private static readonly SETTINGS_KEY = 'extension_settings';
  private static readonly CACHE_PREFIX = 'audit_cache_';

  static async getSettings(): Promise<ExtensionSettings> {
    try {
      const result = await chrome.storage.sync.get(this.SETTINGS_KEY);
      const rawSettings = result[this.SETTINGS_KEY] || { 
        provider: 'openai', 
        openaiApiKey: '', 
        geminiApiKey: '', 
        openaiModel: 'gpt-5', 
        geminiModel: 'gemini-2.5-pro',
        fullPageScreenshot: true
      };

      console.log('Raw settings retrieved:', {
        hasSettings: !!result[this.SETTINGS_KEY],
        provider: rawSettings.provider,
        hasOpenaiKey: !!rawSettings.openaiApiKey,
        hasGeminiKey: !!rawSettings.geminiApiKey,
        openaiKeyLength: rawSettings.openaiApiKey?.length || 0,
        geminiKeyLength: rawSettings.geminiApiKey?.length || 0
      });

      // Decrypt sensitive fields
      const decryptedSettings = await EncryptionManager.decryptSettings(rawSettings);
      
      if (DEBUG.STORAGE) {
        console.log('Decrypted settings:');
        safeLog.settings(decryptedSettings);
      }

      // Validate decrypted settings
      const validation = this.validateSettings(decryptedSettings);
      if (!validation.isValid) {
        console.warn('Settings validation failed:', validation.errors);
        // Don't throw error, just log warnings - allow user to fix in options
      }

      return decryptedSettings;
    } catch (error) {
      console.error('Failed to get settings:', error);
      console.log('Returning default settings due to error');
      
      // Return safe defaults if settings are corrupted
      return {
        provider: 'openai',
        openaiApiKey: '',
        geminiApiKey: '',
        openaiModel: 'gpt-5',
        geminiModel: 'gemini-2.5-pro',
        fullPageScreenshot: true
      };
    }
  }

  static async saveSettings(settings: ExtensionSettings): Promise<void> {
    // Encrypt sensitive fields before storing
    const encryptedSettings = await EncryptionManager.encryptSettings(settings);
    console.log('Saving encrypted settings, field lengths:', {
      openaiKeyLength: encryptedSettings.openaiApiKey?.length || 0,
      geminiKeyLength: encryptedSettings.geminiApiKey?.length || 0
    });
    await chrome.storage.sync.set({ [this.SETTINGS_KEY]: encryptedSettings });
  }

  /**
   * Clear corrupted settings and reset to defaults
   */
  static async clearCorruptedSettings(): Promise<void> {
    console.log('Clearing potentially corrupted settings...');
    await chrome.storage.sync.remove(this.SETTINGS_KEY);
    console.log('Settings cleared. Users will need to re-enter API keys.');
  }

  /**
   * Validate settings after decryption
   */
  static validateSettings(settings: ExtensionSettings): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check OpenAI API key format if provider is openai or if key exists
    if (settings.provider === 'openai' || settings.openaiApiKey) {
      if (settings.openaiApiKey && !settings.openaiApiKey.startsWith('sk-')) {
        errors.push('OpenAI API key should start with "sk-"');
      }
      if (settings.openaiApiKey && settings.openaiApiKey.length < 20) {
        errors.push('OpenAI API key seems too short');
      }
    }
    
    // Check Gemini API key format if provider is gemini or if key exists
    if (settings.provider === 'gemini' || settings.geminiApiKey) {
      if (settings.geminiApiKey && !settings.geminiApiKey.startsWith('AIza')) {
        errors.push('Gemini API key should start with "AIza"');
      }
      if (settings.geminiApiKey && settings.geminiApiKey.length < 30) {
        errors.push('Gemini API key seems too short');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static async getCachedAudit(url: string): Promise<CachedAudit | null> {
    const key = this.getCacheKey(url);
    const result = await chrome.storage.local.get(key);
    return result[key] || null;
  }

  static async saveCachedAudit(
    url: string, 
    analysis: LLMAnalysis, 
    rawData: RawPageData, 
    modelName: string
  ): Promise<void> {
    try {
      const key = this.getCacheKey(url);
      const cachedAudit: CachedAudit = {
        analysis: this.optimizeAnalysisForStorage(analysis),
        rawData: this.optimizeRawDataForStorage(rawData),
        timestamp: Date.now(),
        modelName
      };
      
      // Check estimated size before storing
      const estimatedSize = this.estimateObjectSize(cachedAudit);
      const maxSize = 1024 * 1024; // 1MB limit per cache entry
      
      if (estimatedSize > maxSize) {
        console.warn(`Cache entry too large (${estimatedSize} bytes), skipping cache for ${url}`);
        return;
      }
      
      await chrome.storage.local.set({ [key]: cachedAudit });
    } catch (error) {
      if (error instanceof Error && error.message.includes('QUOTA_BYTES')) {
        console.warn('Storage quota exceeded, clearing old cache and retrying');
        await this.cleanOldCache(24 * 60 * 60 * 1000); // Clean entries older than 1 day
        // Don't retry to avoid infinite loops - just log the issue
        console.warn('Cache storage failed due to quota limits');
      } else {
        console.error('Failed to save cached audit:', error);
      }
    }
  }

  private static optimizeAnalysisForStorage(analysis: LLMAnalysis): LLMAnalysis {
    const optimized = { ...analysis };
    
    // Limit and truncate large fields for storage efficiency
    if (optimized.recommendations && optimized.recommendations.length > 15) {
      optimized.recommendations = optimized.recommendations.slice(0, 15);
    }
    
    if (optimized.recommendations) {
      optimized.recommendations = optimized.recommendations.map(rec => ({
        ...rec,
        currentState: this.truncateForStorage(rec.currentState, 800),
        proposedChange: this.truncateForStorage(rec.proposedChange, 800),
        psychologyBehind: this.truncateForStorage(rec.psychologyBehind, 600),
        testingApproach: this.truncateForStorage(rec.testingApproach, 500),
        implementationDetails: Array.isArray(rec.implementationDetails) 
          ? rec.implementationDetails.slice(0, 8).map(item => this.truncateForStorage(item, 150))
          : rec.implementationDetails
      }));
    }
    
    if (optimized.executiveSummary && optimized.executiveSummary.length > 10) {
      optimized.executiveSummary = optimized.executiveSummary.slice(0, 10);
    }
    
    // Ensure quickWins is preserved
    if (optimized.quickWins && optimized.quickWins.length > 10) {
      optimized.quickWins = optimized.quickWins.slice(0, 10);
    }
    
    console.log('Storage optimization - quickWins preserved:', optimized.quickWins);
    console.log('Storage optimization - all keys:', Object.keys(optimized));
    
    return optimized;
  }

  private static optimizeRawDataForStorage(rawData: RawPageData): RawPageData {
    const optimized = { ...rawData };
    
    // Truncate very large text content to prevent storage bloat
    if (optimized.fullTextContent && optimized.fullTextContent.length > 50000) {
      optimized.fullTextContent = optimized.fullTextContent.substring(0, 50000) + '... [truncated for storage]';
    }
    
    if (optimized.fullHTML && optimized.fullHTML.length > 100000) {
      optimized.fullHTML = optimized.fullHTML.substring(0, 100000) + '... [truncated for storage]';
    }
    
    // Limit structured content arrays
    if (optimized.structuredContent) {
      optimized.structuredContent = {
        ...optimized.structuredContent,
        headings: optimized.structuredContent.headings?.slice(0, 50) || [],
        interactiveElements: optimized.structuredContent.interactiveElements?.slice(0, 200) || [],
        forms: optimized.structuredContent.forms?.slice(0, 10) || [],
        images: optimized.structuredContent.images?.slice(0, 50) || [],
        lists: optimized.structuredContent.lists?.slice(0, 20) || [],
        sections: optimized.structuredContent.sections?.slice(0, 30) || [],
        videos: optimized.structuredContent.videos || [],
        interactive: optimized.structuredContent.interactive || []
      };
    }
    
    return optimized;
  }

  private static truncateForStorage(text: string | undefined, maxLength: number): string {
    if (!text || text.length <= maxLength) return text || '';
    return text.substring(0, maxLength - 3) + '...';
  }

  private static estimateObjectSize(obj: any): number {
    // Rough estimation of object size in bytes
    const jsonString = JSON.stringify(obj);
    return new Blob([jsonString]).size;
  }

  static async clearCache(): Promise<void> {
    const items = await chrome.storage.local.get();
    const keysToRemove = Object.keys(items).filter(key => 
      key.startsWith('job:') || key.startsWith('jobStatus:')
    );
    
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
  }

  static async getCacheSize(): Promise<number> {
    const items = await chrome.storage.local.get();
    return Object.keys(items).filter(key => 
      key.startsWith('job:') || key.startsWith('jobStatus:')
    ).length;
  }

  private static getCacheKey(url: string): string {
    // Normalize URL to avoid cache misses due to minor differences
    const normalizedUrl = url.split('?')[0].split('#')[0].toLowerCase();
    return `${this.CACHE_PREFIX}${btoa(normalizedUrl)}`;
  }

  static async cleanOldCache(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    const items = await chrome.storage.local.get();
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (const [key, value] of Object.entries(items)) {
      if (key.startsWith(this.CACHE_PREFIX)) {
        const cachedAudit = value as CachedAudit;
        if (now - cachedAudit.timestamp > maxAgeMs) {
          keysToRemove.push(key);
        }
      }
    }

    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
  }
}

/**
 * Post-process customer journey steps to remove duplicate numbering
 * Removes leading numbered patterns like "1.", "1)", "1-", "1 ", etc.
 * 
 * Examples of what gets cleaned:
 * - "1. Visitor arrives at landing page" → "Visitor arrives at landing page"
 * - "2) User scrolls down" → "User scrolls down" 
 * - "3- User clicks CTA" → "User clicks CTA"
 * - "Step 4: User fills form" → "User fills form"
 * - "5 User converts" → "User converts"
 */
export function cleanCustomerJourneySteps(steps: string[]): string[] {
  if (!steps || !Array.isArray(steps)) {
    return steps;
  }

  return steps.map(step => {
    if (typeof step !== 'string') {
      return step;
    }

    // Remove leading numbered patterns: "1.", "1)", "1-", "1 ", "Step 1:", etc.
    // This regex matches:
    // - Optional "Step" followed by space
    // - One or more digits
    // - Optional dot, parenthesis, dash, colon, or space
    // - Optional space after the delimiter
    const cleanedStep = step.replace(/^(?:Step\s+)?\d+[\.\)\-\:\s]*\s*/i, '').trim();
    
    return cleanedStep || step; // Fallback to original if cleaning results in empty string
  });
}
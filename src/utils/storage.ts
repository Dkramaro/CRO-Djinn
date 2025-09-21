import { CachedAudit, ExtensionSettings, LLMAnalysis, RawPageData } from '../types';

export class StorageManager {
  private static readonly SETTINGS_KEY = 'extension_settings';
  private static readonly CACHE_PREFIX = 'audit_cache_';

  static async getSettings(): Promise<ExtensionSettings> {
    const result = await chrome.storage.sync.get(this.SETTINGS_KEY);
    return result[this.SETTINGS_KEY] || { 
      provider: 'openai', 
      openaiApiKey: '', 
      geminiApiKey: '', 
      openaiModel: 'gpt-5-mini', 
      geminiModel: 'gemini-2.5-flash' 
    };
  }

  static async saveSettings(settings: ExtensionSettings): Promise<void> {
    await chrome.storage.sync.set({ [this.SETTINGS_KEY]: settings });
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
    const key = this.getCacheKey(url);
    const cachedAudit: CachedAudit = {
      analysis,
      rawData,
      timestamp: Date.now(),
      modelName
    };
    
    await chrome.storage.local.set({ [key]: cachedAudit });
  }

  static async clearCache(): Promise<void> {
    const items = await chrome.storage.local.get();
    const keysToRemove = Object.keys(items).filter(key => 
      key.startsWith(this.CACHE_PREFIX)
    );
    
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
  }

  static async getCacheSize(): Promise<number> {
    const items = await chrome.storage.local.get();
    return Object.keys(items).filter(key => 
      key.startsWith(this.CACHE_PREFIX)
    ).length;
  }

  private static getCacheKey(url: string): string {
    // Normalize URL to avoid cache misses due to minor differences
    const normalizedUrl = url.split('?')[0].split('#')[0].toLowerCase();
    return `${this.CACHE_PREFIX}${btoa(normalizedUrl)}`;
  }

  static async cleanOldCache(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
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

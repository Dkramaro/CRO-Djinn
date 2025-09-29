import { StorageManager } from '../utils/storage';
import { ConsentManager } from '../utils/consent';
import { ExtensionSettings } from '../types';

class OptionsController {
  private form: HTMLFormElement | null = null;
  private providerSelect: HTMLSelectElement | null = null;
  private openaiApiKeyInput: HTMLInputElement | null = null;
  private geminiApiKeyInput: HTMLInputElement | null = null;
  private openaiModelSelect: HTMLSelectElement | null = null;
  private geminiModelSelect: HTMLSelectElement | null = null;
  private fullPageScreenshotCheckbox: HTMLInputElement | null = null;
  private openaiConfig: HTMLElement | null = null;
  private geminiConfig: HTMLElement | null = null;
  private saveButton: HTMLButtonElement | null = null;
  private cacheCountElement: HTMLElement | null = null;
  private consentsCountElement: HTMLElement | null = null;

  constructor() {
    this.initializeOptions();
  }

  private async initializeOptions(): Promise<void> {
    try {
      this.setupElements();
      this.setupEventListeners();
      await this.loadSettings();
      await this.updateCacheInfo();
      await this.updatePrivacyInfo();
    } catch (error) {
      console.error('Failed to initialize options:', error);
      this.showError('Failed to load settings');
    }
  }

  private setupElements(): void {
    // Get form elements
    this.providerSelect = document.getElementById('provider-select') as HTMLSelectElement;
    this.openaiApiKeyInput = document.getElementById('openai-api-key') as HTMLInputElement;
    this.geminiApiKeyInput = document.getElementById('gemini-api-key') as HTMLInputElement;
    this.openaiModelSelect = document.getElementById('openai-model') as HTMLSelectElement;
    this.geminiModelSelect = document.getElementById('gemini-model') as HTMLSelectElement;
    this.fullPageScreenshotCheckbox = document.getElementById('full-page-screenshot') as HTMLInputElement;
    this.openaiConfig = document.getElementById('openai-config');
    this.geminiConfig = document.getElementById('gemini-config');
    this.saveButton = document.getElementById('save-button') as HTMLButtonElement;
    this.cacheCountElement = document.getElementById('cache-count');
    this.consentsCountElement = document.getElementById('consents-count');

    if (!this.providerSelect || !this.openaiApiKeyInput || !this.geminiApiKeyInput || 
        !this.openaiModelSelect || !this.geminiModelSelect || !this.fullPageScreenshotCheckbox || !this.saveButton ||
        !this.openaiConfig || !this.geminiConfig) {
      throw new Error('Required form elements not found');
    }
  }

  private setupEventListeners(): void {
    // Save button
    this.saveButton?.addEventListener('click', (e) => {
      e.preventDefault();
      this.saveSettings();
    });

    // Provider selection
    this.providerSelect?.addEventListener('change', () => {
      this.handleProviderChange();
    });

    // Clear cache button
    const clearCacheButton = document.getElementById('clear-cache-button');
    clearCacheButton?.addEventListener('click', () => {
      this.clearCache();
    });

    // Privacy control buttons
    const clearConsentsButton = document.getElementById('clear-consents-button');
    clearConsentsButton?.addEventListener('click', () => {
      this.clearConsents();
    });

    const clearAllDataButton = document.getElementById('clear-all-data-button');
    clearAllDataButton?.addEventListener('click', () => {
      this.clearAllData();
    });

    // Debug diagnostic button
    const diagnosticButton = document.getElementById('diagnostic-button');
    if (diagnosticButton) {
      diagnosticButton.addEventListener('click', () => {
        this.runDiagnostics();
      });
    }

    // Form validation
    this.openaiApiKeyInput?.addEventListener('input', () => {
      this.validateForm();
    });
    this.geminiApiKeyInput?.addEventListener('input', () => {
      this.validateForm();
    });

    // Enter key to save
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        this.saveSettings();
      }
    });
  }

  private handleProviderChange(): void {
    const provider = this.providerSelect?.value;
    
    if (provider === 'openai') {
      this.openaiConfig?.classList.remove('hidden');
      this.geminiConfig?.classList.add('hidden');
    } else if (provider === 'gemini') {
      this.openaiConfig?.classList.add('hidden');
      this.geminiConfig?.classList.remove('hidden');
    }
    
    this.validateForm();
  }

  private async loadSettings(): Promise<void> {
    try {
      const settings = await StorageManager.getSettings();
      
      // Set provider
      if (this.providerSelect) {
        this.providerSelect.value = settings.provider || 'openai';
      }

      // Set API keys
      if (this.openaiApiKeyInput) {
        this.openaiApiKeyInput.value = settings.openaiApiKey || '';
      }
      if (this.geminiApiKeyInput) {
        this.geminiApiKeyInput.value = settings.geminiApiKey || '';
      }
      
      // Set models
      if (this.openaiModelSelect) {
        this.openaiModelSelect.value = settings.openaiModel || 'gpt-5';
      }
      if (this.geminiModelSelect) {
        this.geminiModelSelect.value = settings.geminiModel || 'gemini-2.5-pro';
      }
      
      // Set full page screenshot setting
      if (this.fullPageScreenshotCheckbox) {
        this.fullPageScreenshotCheckbox.checked = settings.fullPageScreenshot || false;
      }

      // Update UI based on provider
      this.handleProviderChange();
      this.validateForm();
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.showError('Failed to load saved settings');
    }
  }

  private async saveSettings(): Promise<void> {
    if (!this.validateForm()) {
      return;
    }

    try {
      this.setLoading(true);
      this.hideMessages();

      const provider = this.providerSelect?.value as 'openai' | 'gemini' || 'openai';
      
      // Get current values from the form, preserving existing keys for non-active providers
      const currentSettings = await StorageManager.getSettings();
      
      // CRITICAL: Validate preserved keys are actual strings, not corrupted objects
      const preservedOpenaiKey = provider !== 'openai' ? currentSettings.openaiApiKey : '';
      const preservedGeminiKey = provider !== 'gemini' ? currentSettings.geminiApiKey : '';
      
      // Detect and reject [object Object] corruption
      if (preservedOpenaiKey && (typeof preservedOpenaiKey !== 'string' || preservedOpenaiKey === '[object Object]')) {
        console.error('🔧 CORRUPTION DETECTED in preserved OpenAI key:', preservedOpenaiKey);
        throw new Error('Stored OpenAI API key is corrupted. Please re-enter it on the OpenAI provider settings.');
      }
      if (preservedGeminiKey && (typeof preservedGeminiKey !== 'string' || preservedGeminiKey === '[object Object]')) {
        console.error('🔧 CORRUPTION DETECTED in preserved Gemini key:', preservedGeminiKey);
        throw new Error('Stored Gemini API key is corrupted. Please re-enter it on the Gemini provider settings.');
      }
      
      const settings: ExtensionSettings = {
        provider,
        // Only update the API key for the current provider, preserve others
        openaiApiKey: provider === 'openai' 
          ? (this.openaiApiKeyInput?.value.trim() || '') 
          : preservedOpenaiKey,
        geminiApiKey: provider === 'gemini' 
          ? (this.geminiApiKeyInput?.value.trim() || '') 
          : preservedGeminiKey,
        openaiModel: this.openaiModelSelect?.value || 'gpt-5',
        geminiModel: this.geminiModelSelect?.value || 'gemini-2.5-pro',
        fullPageScreenshot: this.fullPageScreenshotCheckbox?.checked || false
      };

      console.log('🔧 Preparing to save settings:', {
        provider: settings.provider,
        preservingOpenaiKey: provider !== 'openai' && !!currentSettings.openaiApiKey,
        preservingGeminiKey: provider !== 'gemini' && !!currentSettings.geminiApiKey,
        openaiKeyLength: settings.openaiApiKey?.length || 0,
        geminiKeyLength: settings.geminiApiKey?.length || 0,
        openaiKeyType: typeof settings.openaiApiKey,
        geminiKeyType: typeof settings.geminiApiKey,
        openaiKeyPrefix: settings.openaiApiKey?.substring(0, 5) || 'empty',
        geminiKeyPrefix: settings.geminiApiKey?.substring(0, 5) || 'empty'
      });

      // Validate current provider's API key
      const currentApiKey = provider === 'openai' ? settings.openaiApiKey : settings.geminiApiKey;
      if (!this.isValidApiKey(currentApiKey, provider)) {
        const providerName = provider === 'openai' ? 'OpenAI' : 'Gemini';
        throw new Error(`Please enter a valid ${providerName} API key`);
      }

      // Test the API key by making a simple request
      await this.testApiKey(currentApiKey, provider === 'openai' ? settings.openaiModel : settings.geminiModel, provider);

      // Save settings
      await StorageManager.saveSettings(settings);

      this.showSuccess('Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      const message = error instanceof Error ? error.message : 'Failed to save settings';
      this.showError(message);
    } finally {
      this.setLoading(false);
    }
  }

  private async testApiKey(apiKey: string, modelName: string, provider: 'openai' | 'gemini'): Promise<void> {
    if (provider === 'openai') {
      // Test OpenAI API key
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid OpenAI API key. Please check your key.');
        } else if (response.status === 429) {
          throw new Error('OpenAI API rate limit exceeded. Please try again later.');
        } else {
          throw new Error(`OpenAI API test failed (${response.status}). Please check your API key.`);
        }
      }

      // Check if the specified model is available
      const data = await response.json();
      const availableModels = data.data?.map((model: any) => model.id) || [];
      
      if (!availableModels.includes(modelName)) {
        console.warn(`OpenAI model ${modelName} not found in available models. Using anyway.`);
      }
    } else {
      // Test Gemini API key with a simple request
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Invalid Gemini API key. Please check your key.');
        } else if (response.status === 429) {
          throw new Error('Gemini API rate limit exceeded. Please try again later.');
        } else {
          throw new Error(`Gemini API test failed (${response.status}). Please check your API key.`);
        }
      }

      // Check if the specified model is available
      const data = await response.json();
      const availableModels = data.models?.map((model: any) => model.name.split('/').pop()) || [];
      
      if (!availableModels.includes(modelName)) {
        console.warn(`Gemini model ${modelName} not found in available models. Using anyway.`);
      }
    }
  }

  private async updateCacheInfo(): Promise<void> {
    try {
      const cacheSize = await StorageManager.getCacheSize();
      if (this.cacheCountElement) {
        this.cacheCountElement.textContent = `${cacheSize} audits`;
      }
    } catch (error) {
      console.error('Failed to get cache info:', error);
      if (this.cacheCountElement) {
        this.cacheCountElement.textContent = 'Unknown';
      }
    }
  }

  private async clearCache(): Promise<void> {
    try {
      const confirmed = confirm('Are you sure you want to clear all cached audit results? This action cannot be undone.');
      
      if (!confirmed) {
        return;
      }

      await StorageManager.clearCache();
      await this.updateCacheInfo();
      this.showSuccess('Cache cleared successfully!');
    } catch (error) {
      console.error('Failed to clear cache:', error);
      this.showError('Failed to clear cache');
    }
  }

  private async updatePrivacyInfo(): Promise<void> {
    try {
      const consents = await ConsentManager.getGrantedConsents();
      if (this.consentsCountElement) {
        this.consentsCountElement.textContent = `${consents.length} sites`;
      }
    } catch (error) {
      console.error('Failed to get privacy info:', error);
      if (this.consentsCountElement) {
        this.consentsCountElement.textContent = 'Unknown';
      }
    }
  }

  private async clearConsents(): Promise<void> {
    try {
      const confirmed = confirm('Are you sure you want to clear all site consents? You will be prompted for consent again on all websites.');
      
      if (!confirmed) {
        return;
      }

      await ConsentManager.clearAllConsents();
      await this.updatePrivacyInfo();
      this.showSuccess('Site consents cleared successfully!');
    } catch (error) {
      console.error('Failed to clear consents:', error);
      this.showError('Failed to clear site consents');
    }
  }

  private async clearAllData(): Promise<void> {
    try {
      const confirmed = confirm('⚠️ WARNING: This will delete ALL extension data including API keys, settings, cached results, and site consents. This action cannot be undone.\n\nAre you sure you want to continue?');
      
      if (!confirmed) {
        return;
      }

      // Clear all storage areas
      await Promise.all([
        ConsentManager.clearAllConsents(),
        StorageManager.clearCache(),
        chrome.storage.sync.clear(),
        chrome.storage.local.clear()
      ]);

      this.showSuccess('All extension data deleted successfully! Page will reload to reset settings.');
      
      // Reload the page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error) {
      console.error('Failed to clear all data:', error);
      this.showError('Failed to delete all extension data');
    }
  }

  private async runDiagnostics(): Promise<void> {
    try {
      console.log('🔍 Running settings diagnostics...');
      
      // Get raw storage data
      const rawStorageResult = await chrome.storage.sync.get('extension_settings');
      const rawSettings = rawStorageResult.extension_settings;
      
      console.log('Raw stored settings:', rawSettings);
      
      // Get decrypted settings
      const decryptedSettings = await StorageManager.getSettings();
      
      console.log('Decrypted settings:', {
        provider: decryptedSettings.provider,
        hasOpenaiKey: !!decryptedSettings.openaiApiKey,
        hasGeminiKey: !!decryptedSettings.geminiApiKey,
        openaiKeyLength: decryptedSettings.openaiApiKey?.length || 0,
        geminiKeyLength: decryptedSettings.geminiApiKey?.length || 0,
        openaiKeyValid: this.isValidApiKey(decryptedSettings.openaiApiKey, 'openai'),
        geminiKeyValid: this.isValidApiKey(decryptedSettings.geminiApiKey, 'gemini'),
        openaiKeyPrefix: decryptedSettings.openaiApiKey?.substring(0, 5) || '',
        geminiKeyPrefix: decryptedSettings.geminiApiKey?.substring(0, 5) || ''
      });

      // Check validation
      const validation = StorageManager.validateSettings(decryptedSettings);
      console.log('Settings validation:', validation);

      // Show diagnostic results to user
      const currentProvider = decryptedSettings.provider;
      const currentKey = currentProvider === 'openai' ? decryptedSettings.openaiApiKey : decryptedSettings.geminiApiKey;
      const keyValid = this.isValidApiKey(currentKey, currentProvider);

      let message = `🔍 Diagnostics Results:\n\n`;
      message += `Provider: ${currentProvider}\n`;
      message += `Current API Key Valid: ${keyValid ? '✅ YES' : '❌ NO'}\n`;
      message += `Current API Key Length: ${currentKey?.length || 0}\n`;
      message += `Current API Key Prefix: "${currentKey?.substring(0, 10) || 'none'}..."\n\n`;
      
      if (!keyValid) {
        message += `❌ Issue Detected: Your ${currentProvider.toUpperCase()} API key appears to be corrupted.\n\n`;
        message += `Recommended Actions:\n`;
        message += `1. Re-enter your API key manually\n`;
        message += `2. Make sure it starts with "${currentProvider === 'openai' ? 'sk-' : 'AIza'}"\n`;
        message += `3. Or clear all data and start fresh\n\n`;
        message += `Check browser console for detailed logs.`;
      } else {
        message += `✅ Your API key appears to be valid.\n`;
        message += `If you're still having issues, there might be a network or API quota problem.`;
      }

      alert(message);
      
      // Offer to clear corrupted settings or attempt automatic repair
      if (!keyValid) {
        const autoRepair = confirm('Would you like to attempt automatic repair of the corrupted API key? If that fails, we can clear all settings and start fresh.');
        
        if (autoRepair) {
          try {
            // Attempt to repair the settings
            await this.attemptSettingsRepair();
            this.showSuccess('Settings repair attempted. Please check if your API key is working now.');
          } catch (repairError) {
            console.error('Automatic repair failed:', repairError);
            
            const clearCorrupted = confirm('Automatic repair failed. Would you like to clear all corrupted settings? This will reset your API keys and you\'ll need to re-enter them.');
            if (clearCorrupted) {
              await chrome.runtime.sendMessage({ type: 'CLEAR_CORRUPTED_SETTINGS' });
              this.showSuccess('Corrupted settings cleared. Please re-enter your API keys.');
              setTimeout(() => {
                window.location.reload();
              }, 1500);
            }
          }
        }
      }

    } catch (error) {
      console.error('Diagnostics failed:', error);
      this.showError('Failed to run diagnostics. Check console for details.');
    }
  }

  private async attemptSettingsRepair(): Promise<void> {
    console.log('🔧 Attempting automatic settings repair...');
    
    try {
      // Get raw storage data directly
      const rawResult = await chrome.storage.sync.get('extension_settings');
      const rawSettings = rawResult.extension_settings;
      
      if (!rawSettings) {
        throw new Error('No settings found to repair');
      }
      
      console.log('🔧 Raw settings before repair:', rawSettings);
      
      // Repair logic: Ensure API keys are strings
      const repairedSettings = { ...rawSettings };
      let repairsMade = false;
      
      // Fix OpenAI API key if it's an object
      if (repairedSettings.openaiApiKey && typeof repairedSettings.openaiApiKey !== 'string') {
        console.log('🔧 Repairing OpenAI API key from:', typeof repairedSettings.openaiApiKey);
        repairedSettings.openaiApiKey = String(repairedSettings.openaiApiKey);
        repairsMade = true;
      }
      
      // Fix Gemini API key if it's an object
      if (repairedSettings.geminiApiKey && typeof repairedSettings.geminiApiKey !== 'string') {
        console.log('🔧 Repairing Gemini API key from:', typeof repairedSettings.geminiApiKey);
        repairedSettings.geminiApiKey = String(repairedSettings.geminiApiKey);
        repairsMade = true;
      }
      
      if (repairsMade) {
        // Save the repaired settings
        await chrome.storage.sync.set({ extension_settings: repairedSettings });
        console.log('✅ Settings repair complete');
        
        // Reload the form to show the repaired settings
        await this.loadSettings();
      } else {
        console.log('ℹ️ No repairs needed - settings appear to be valid');
      }
      
    } catch (error) {
      console.error('🔧 Settings repair failed:', error);
      throw error;
    }
  }

  private validateForm(): boolean {
    const provider = this.providerSelect?.value;
    let isValid = false;

    if (provider === 'openai') {
      const apiKey = this.openaiApiKeyInput?.value.trim() || '';
      isValid = this.isValidApiKey(apiKey, 'openai');
    } else if (provider === 'gemini') {
      const apiKey = this.geminiApiKeyInput?.value.trim() || '';
      isValid = this.isValidApiKey(apiKey, 'gemini');
    }
    
    if (this.saveButton) {
      this.saveButton.disabled = !isValid;
    }

    return isValid;
  }

  private isValidApiKey(apiKey: string, provider: 'openai' | 'gemini'): boolean {
    if (!apiKey || apiKey.length === 0) {
      return false;
    }

    if (provider === 'openai') {
      return apiKey.startsWith('sk-') && apiKey.length > 20;
    } else {
      return apiKey.startsWith('AIza') && apiKey.length > 30;
    }
  }

  private setLoading(loading: boolean): void {
    if (!this.saveButton) return;

    const buttonText = this.saveButton.querySelector('.button-text');
    const spinner = this.saveButton.querySelector('.loading-spinner');

    if (loading) {
      this.saveButton.disabled = true;
      buttonText?.classList.add('hidden');
      spinner?.classList.remove('hidden');
    } else {
      this.saveButton.disabled = false;
      buttonText?.classList.remove('hidden');
      spinner?.classList.add('hidden');
    }
  }

  private showSuccess(message: string): void {
    this.hideMessages();
    const successElement = document.getElementById('success-message');
    if (successElement) {
      successElement.classList.remove('hidden');
      setTimeout(() => {
        successElement.classList.add('hidden');
      }, 4000);
    }
  }

  private showError(message: string): void {
    this.hideMessages();
    const errorElement = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    
    if (errorElement && errorText) {
      errorText.textContent = message;
      errorElement.classList.remove('hidden');
    }
  }

  private hideMessages(): void {
    const successElement = document.getElementById('success-message');
    const errorElement = document.getElementById('error-message');
    
    successElement?.classList.add('hidden');
    errorElement?.classList.add('hidden');
  }
}

// Initialize options when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new OptionsController();
});

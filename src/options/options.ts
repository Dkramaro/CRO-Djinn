import { StorageManager } from '../utils/storage';
import { ExtensionSettings } from '../types';

class OptionsController {
  private form: HTMLFormElement | null = null;
  private providerSelect: HTMLSelectElement | null = null;
  private openaiApiKeyInput: HTMLInputElement | null = null;
  private geminiApiKeyInput: HTMLInputElement | null = null;
  private openaiModelSelect: HTMLSelectElement | null = null;
  private geminiModelSelect: HTMLSelectElement | null = null;
  private openaiConfig: HTMLElement | null = null;
  private geminiConfig: HTMLElement | null = null;
  private saveButton: HTMLButtonElement | null = null;
  private cacheCountElement: HTMLElement | null = null;

  constructor() {
    this.initializeOptions();
  }

  private async initializeOptions(): Promise<void> {
    try {
      this.setupElements();
      this.setupEventListeners();
      await this.loadSettings();
      await this.updateCacheInfo();
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
    this.openaiConfig = document.getElementById('openai-config');
    this.geminiConfig = document.getElementById('gemini-config');
    this.saveButton = document.getElementById('save-button') as HTMLButtonElement;
    this.cacheCountElement = document.getElementById('cache-count');

    if (!this.providerSelect || !this.openaiApiKeyInput || !this.geminiApiKeyInput || 
        !this.openaiModelSelect || !this.geminiModelSelect || !this.saveButton ||
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
        this.openaiModelSelect.value = settings.openaiModel || 'gpt-5-mini';
      }
      if (this.geminiModelSelect) {
        this.geminiModelSelect.value = settings.geminiModel || 'gemini-2.5-flash';
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
      
      const settings: ExtensionSettings = {
        provider,
        openaiApiKey: this.openaiApiKeyInput?.value.trim() || '',
        geminiApiKey: this.geminiApiKeyInput?.value.trim() || '',
        openaiModel: this.openaiModelSelect?.value || 'gpt-5-mini',
        geminiModel: this.geminiModelSelect?.value || 'gemini-2.5-flash'
      };

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

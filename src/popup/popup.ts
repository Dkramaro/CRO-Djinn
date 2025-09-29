import { StorageManager } from '../utils/storage';
import { generatePDF } from '../utils/pdf';
import { AnalysisState, LLMAnalysis, RawPageData } from '../types';
import { computeStableKey } from '../shared/keys';

/**
 * PopupController - Pure stateless subscriber to background job state
 * NEVER affects job execution - jobs are owned by background
 * Can connect/disconnect without impacting running jobs
 */
class PopupController {
  private static instance: PopupController | null = null;
  private state: AnalysisState = { status: 'idle' };
  private currentUrl: string = '';
  private currentJobKey: string | null = null;
  private isInitialized: boolean = false;
  private statusPollingInterval: NodeJS.Timeout | null = null;
  private storageListener: ((changes: any, area: string) => void) | null = null;

  constructor() {
    if (PopupController.instance) {
      console.warn('❌ Attempting to create duplicate PopupController instance');
      return PopupController.instance;
    }
    
    console.log('✅ Creating PopupController subscriber instance');
    PopupController.instance = this;
    this.init();
  }

  public static getInstance(): PopupController | null {
    return PopupController.instance;
  }

  public static getOrCreateInstance(): PopupController {
    if (!PopupController.instance) {
      new PopupController();
    }
    return PopupController.instance!;
  }

  private async init(): Promise<void> {
    if (this.isInitialized) {
      console.warn('PopupController already initialized');
      return;
    }

    console.log('🔌 Initializing PopupController with state propagation fix...');
    
    try {
    
    // Get current tab URL
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.url) {
      this.currentUrl = tabs[0].url;
    }

    if (!this.currentUrl) {
      console.warn('No current URL available');
      this.isInitialized = true;
      return;
    }

    // Compute stable job key using friend's exact pattern
    const settings = await StorageManager.getSettings();
    this.currentJobKey = computeStableKey({
      url: this.currentUrl,
      model: settings.openaiModel || settings.geminiModel,
      params: {
        provider: settings.provider,
        fullPage: settings.fullPageScreenshot || false
      },
      appVersion: "1.0.0"
    });

    console.log(`🔑 [Popup] Computed stable jobKey: ${this.currentJobKey} for ${this.currentUrl}`);

    // Set up rehydration logic FIRST
    await this.setupStateRehydration();

    // Set up event listeners
    this.setupEventListeners();

    // Update provider notice
    await this.updateProviderNotice();

    // Clean old cache on startup
    StorageManager.cleanOldCache();
    
    this.isInitialized = true;
    console.log('✅ PopupController initialization complete with state rehydration');
    
    } catch (error) {
      console.error('❌ [Popup] Initialization failed:', error);
      this.isInitialized = true;
      
      // Still show the UI even if there's an error
      this.state = { status: 'idle' };
      this.updateUI();
      
      // Set up basic event listeners even if initialization failed
      try {
        const scanButton = document.getElementById('scan-button');
        if (scanButton) {
          scanButton.addEventListener('click', () => {
            this.showError('Extension initialization failed. Please reload the extension.');
          });
        }
      } catch (listenerError) {
        console.error('❌ [Popup] Failed to set up error state listeners:', listenerError);
      }
    }
  }
  
  private setupEventListeners(): void {
    console.log('Setting up event listeners...');
    
    // Scan button - Simple single listener
    const scanButton = document.getElementById('scan-button');
    if (scanButton) {
      scanButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.handleScanClick();
      });
    }

    // Re-run buttons
    const rerunButton = document.getElementById('rerun-button');
    rerunButton?.addEventListener('click', () => this.handleRerunClick());

    const rerunCacheButton = document.getElementById('rerun-cache-button');
    rerunCacheButton?.addEventListener('click', () => this.handleRerunClick());

    // Export PDF button
    const exportButton = document.getElementById('export-pdf-button');
    exportButton?.addEventListener('click', () => this.handleExportClick());

    // Options buttons
    const optionsButton = document.getElementById('options-button');
    optionsButton?.addEventListener('click', () => this.openOptions());

    const optionsErrorButton = document.getElementById('options-error-button');
    optionsErrorButton?.addEventListener('click', () => this.openOptions());

    // Retry button
    const retryButton = document.getElementById('retry-button');
    retryButton?.addEventListener('click', () => this.handleRetryClick());

    // Visual analysis link
    const visualAnalysisLink = document.getElementById('visual-analysis-link');
    visualAnalysisLink?.addEventListener('click', (e) => {
      e.preventDefault();
      this.handleVisualAnalysisLinkClick();
    });
  }

  /**
   * Setup state rehydration using friend's exact pattern
   */
  private async setupStateRehydration(): Promise<void> {
    if (!this.currentJobKey) return;

    // 1. Hydrate once from storage.local
    await this.hydrateOnce();

    // 2. Listen for storage.onChanged for area "local" (NOT session!)
    this.storageListener = (changes: any, area: string) => {
      if (area !== "local") return;
      const entry = changes[`job:${this.currentJobKey}`];
      if (entry?.newValue) {
        console.log(`📡 Storage change detected for ${this.currentJobKey}:`, entry.newValue);
        this.render(entry.newValue);
      }
    };
    chrome.storage.onChanged.addListener(this.storageListener);

    // 3. Poll backup in case change fired while popup was closed (3 second intervals)
    this.statusPollingInterval = setInterval(async () => {
      if (!this.currentJobKey) return;
      
      try {
        const res = await chrome.runtime.sendMessage({ 
          type: "GET_STATUS", 
          payload: { key: this.currentJobKey } 
        });
        
        if (res?.ok && res.state) {
          console.log(`🔄 [Popup] Poll backup found state for ${this.currentJobKey}:`, res.state);
          this.render(res.state);
          
          // Stop polling when terminal state reached
          if (["succeeded", "failed", "cancelled"].includes(res.state.state)) {
            this.stopStatusPolling();
          }
        } else {
          console.log(`🔄 [Popup] Poll backup: no state for ${this.currentJobKey}`);
        }
      } catch (error) {
        console.warn(`❌ [Popup] Poll backup failed:`, error);
      }
    }, 3000);

    console.log(`📡 State rehydration setup complete for ${this.currentJobKey}`);
  }

  /**
   * Hydrate once from storage.local on popup open - Friend's exact pattern
   */
  private async hydrateOnce(): Promise<void> {
    if (!this.currentJobKey) return;

    try {
      // First try direct storage.local lookup
      const obj = await chrome.storage.local.get(`job:${this.currentJobKey}`);
      const state = obj[`job:${this.currentJobKey}`];
      
      if (state) {
        console.log(`🔄 [Popup] hydrateOnce found state for ${this.currentJobKey}:`, state);
        this.render(state);
      } else {
        console.log(`🔄 [Popup] hydrateOnce: no state found for ${this.currentJobKey} in storage.local`);
        
        // Fallback to GET_STATUS API
        try {
          const res = await chrome.runtime.sendMessage({ 
            type: "GET_STATUS", 
            payload: { key: this.currentJobKey } 
          });
          
          if (res?.ok && res.state) {
            console.log(`🔄 [Popup] hydrateOnce GET_STATUS found state:`, res.state);
            this.render(res.state);
          } else {
            console.log(`🔄 [Popup] hydrateOnce: no state found via GET_STATUS either`);
          }
        } catch (apiError) {
          console.warn(`❌ [Popup] hydrateOnce GET_STATUS fallback failed:`, apiError);
        }
      }
    } catch (error) {
      console.warn(`❌ [Popup] hydrateOnce failed:`, error);
    }
  }

  /**
   * Render state using friend's pattern
   */
  private render(jobState: any): void {
    if (!jobState) return;

    const { state, progress, result, error } = jobState;
    
    switch (state) {
      case 'running':
        // Check the step to determine what UI to show
        const step = progress?.step || 'Analysis in progress...';
        
        if (step.toLowerCase().includes('screenshot')) {
          this.state = { 
            status: 'analyzing',
            progress: step
          };
          this.updateUI();
          this.showScreenshotProgress(true, step);
        } else if (step.toLowerCase().includes('scraping') || step.toLowerCase().includes('capturing page')) {
          this.state = { 
            status: 'scraping',
            progress: step
          };
          this.updateUI();
          this.showScreenshotProgress(false);
        } else {
          this.state = { 
            status: 'analyzing',
            progress: step
          };
          this.updateUI();
          this.showScreenshotProgress(false);
        }
        break;
      case 'succeeded':
        this.showScreenshotProgress(false);
        if (result) {
          this.handleAnalysisResult(result, false);
          return;
        }
        break;
      case 'failed':
        this.showScreenshotProgress(false);
        this.showError(error || 'Analysis failed');
        return;
    }

    // Don't call updateUI() here since it's already called above
  }

      
  private async handleScanClick(): Promise<void> {
    console.log('🔍 Scan button clicked');
    
    if (!this.currentUrl) {
      this.showError('Unable to analyze this page');
      return;
    }

    // Validate URL
    if (!this.isValidAnalysisUrl(this.currentUrl)) {
      this.showError(`Cannot analyze this type of URL: ${this.currentUrl}. Please navigate to a regular website (http/https) to use CRO Genie.`);
      return;
    }

    await this.requestAnalysis(false);
  }

  private async handleRerunClick(): Promise<void> {
    await this.requestAnalysis(true);
  }

  private async handleRetryClick(): Promise<void> {
    console.log('Retry button clicked');
    this.state.status = 'idle';
    await this.handleScanClick();
  }

  /**
   * Request analysis from background - background owns the job lifecycle
   */
  /**
   * Start analysis using friend's START_ANALYSIS pattern
   */
  private async requestAnalysis(forceRefresh: boolean = false): Promise<void> {
    console.log(`🚀 [Popup] Starting analysis using friend's pattern - forceRefresh: ${forceRefresh}`);
    
    if (!this.currentUrl || !this.currentJobKey) {
      this.showError('Unable to analyze this page');
      return;
    }

    // Check for existing job first (unless forcing refresh)
    if (!forceRefresh) {
      const obj = await chrome.storage.local.get(`job:${this.currentJobKey}`);
      const existingState = obj[`job:${this.currentJobKey}`];
      
      if (existingState) {
        // Check if job is stale (older than 5 minutes) or in failed state
        const jobAge = Date.now() - existingState.updatedAt;
        const isStale = jobAge > 5 * 60 * 1000; // 5 minutes
        const isFailed = existingState.state === 'failed';
        const isStuckInQueue = existingState.state === 'queued' && jobAge > 2 * 60 * 1000; // 2 minutes
        
        if (isStale || isFailed || isStuckInQueue) {
          console.log(`🧹 [Popup] Clearing stale/failed job (state: ${existingState.state}, age: ${Math.round(jobAge/1000)}s)`);
          await chrome.storage.local.remove(`job:${this.currentJobKey}`);
          // Continue with fresh analysis
        } else {
          console.log(`📡 [Popup] Found existing job state:`, existingState);
          this.render(existingState);
          return;
        }
      }
    }

    try {
      // Get current settings
      const settings = await StorageManager.getSettings();
      
      // Update UI to show starting
      this.state = { 
        status: 'analyzing',
        progress: 'Starting analysis...'
      };
      this.updateUI();

      // Send START_ANALYSIS message - Friend's exact pattern
      const response = await chrome.runtime.sendMessage({ 
        type: "START_ANALYSIS", 
        payload: { 
          key: this.currentJobKey,
          url: this.currentUrl, 
          model: settings.openaiModel || settings.geminiModel, 
          params: {
            provider: settings.provider,
            fullPage: settings.fullPageScreenshot || false
          }
        } 
      });

      if (response?.ok) {
        console.log(`✅ [Popup] START_ANALYSIS acknowledged for key: ${response.key}`);
        // Note: We don't wait for a long response - just the acknowledgment
        // The rehydration logic will pick up progress via storage.onChanged
      } else {
        throw new Error(response?.error || 'Failed to start analysis');
      }

    } catch (error) {
      console.error(`❌ [Popup] Failed to request analysis:`, error);
      this.showError(error instanceof Error ? error.message : 'Failed to start analysis');
    }
  }

  /**
   * Start polling background for job status - pure subscriber
   */
  private startStatusPolling(): void {
    if (this.statusPollingInterval) {
      clearInterval(this.statusPollingInterval);
    }

    if (!this.currentJobKey) return;

    console.log('📡 Starting status polling for job:', this.currentJobKey);

    this.statusPollingInterval = setInterval(async () => {
      if (!this.currentJobKey) {
        this.stopStatusPolling();
        return;
      }

      try {
          const response = await this.sendMessageToBackground({
            type: 'GET_JOB_STATUS',
          jobKey: this.currentJobKey
        });

        if (response.success) {
          this.handleStatusUpdate(response);
        }
      } catch (error) {
        console.warn('Status polling failed (background may be busy):', error);
      }
    }, 2000); // Poll every 2 seconds
  }

  /**
   * Stop status polling
   */
  private stopStatusPolling(): void {
    if (this.statusPollingInterval) {
      clearInterval(this.statusPollingInterval);
      this.statusPollingInterval = null;
      console.log('📡 Stopped status polling');
    }
  }

  /**
   * Handle status updates from background
   */
  private handleStatusUpdate(response: any): void {
    const { status, result, error, cached } = response;

    switch (status) {
      case 'queued':
        this.state = { 
          status: 'scraping', 
          progress: 'Queued for analysis...' 
        };
        break;
      case 'running':
        this.state = { 
          status: 'analyzing', 
          progress: 'AI analysis in progress...' 
        };
        break;
      case 'succeeded':
        this.stopStatusPolling();
        this.currentJobKey = null;
        this.handleAnalysisResult(result, cached);
        break;
      case 'failed':
        this.stopStatusPolling();
        this.currentJobKey = null;
        this.showError(error || 'Analysis failed');
        break;
      case 'not_found':
        this.stopStatusPolling();
        this.currentJobKey = null;
        // Job not found - will rely on initial rehydration
        break;
    }

    this.updateUI();
  }

  /**
   * Handle completed analysis result
   */
  private handleAnalysisResult(analysis: any, fromCache: boolean = false): void {
    // Create minimal RawPageData for display
    const rawData: RawPageData = {
      title: analysis.pageSummary?.businessType || 'Analysis Results',
      url: this.currentUrl,
      metaDescription: '',
      fullHTML: '',
      fullTextContent: '',
      pageMetadata: { viewport: { width: 0, height: 0, scrollHeight: 0 }, viewportMeta: '' },
      structuredContent: { headings: [], buttons: [], forms: [], links: [], lists: [], sections: [], images: [] },
      timestamp: Date.now()
    };

    this.state = {
      status: 'ready',
      analysis: analysis,
      rawData: rawData,
      fromCache: fromCache
    };

    this.updateUI();
    
    console.log('✅ Analysis result received and displayed');
  }

  /**
   * Send message to background script with simple error handling
   */
  private async sendMessageToBackground(message: any): Promise<any> {
    try {
      return await new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => {
          reject(new Error('Background script timeout'));
        }, 10000); // 10 second timeout

          chrome.runtime.sendMessage(message, (response) => {
            clearTimeout(timeout);
            
            if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || 'Connection failed'));
            } else if (!response) {
            reject(new Error('No response from background script'));
            } else {
              resolve(response);
            }
          });
        });
      } catch (error) {
      console.error('Message to background failed:', error);
          throw error;
    }
  }

  /**
   * Validate URL for analysis
   */
  private isValidAnalysisUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      
      const restrictedProtocols = ['chrome:', 'chrome-extension:', 'moz-extension:', 'edge:', 'about:', 'data:', 'file:', 'ftp:'];
      if (restrictedProtocols.includes(urlObj.protocol)) {
        return false;
      }
      
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        return false;
      }
      
      if (urlObj.hostname === 'localhost' || 
          urlObj.hostname === '127.0.0.1' || 
          urlObj.hostname.startsWith('192.168.') ||
          urlObj.hostname.startsWith('10.') ||
          urlObj.hostname.startsWith('172.')) {
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  // UI Update Methods
  private updateUI(): void {
    console.log('🔄 Updating UI with state:', this.state.status);
    this.hideAllStates();

    const scanButton = document.getElementById('scan-button') as HTMLButtonElement;
    
    switch (this.state.status) {
      case 'idle':
        this.showState('initial-state');
        if (scanButton) {
          scanButton.disabled = false;
          scanButton.textContent = 'Start Analysis';
        }
        break;
      case 'scraping':
        this.showState('loading-state');
        this.updateLoadingText(this.state.progress || 'Scraping page...');
        if (scanButton) {
          scanButton.disabled = true;
          scanButton.textContent = 'Analysis in Progress...';
        }
        break;
      case 'analyzing':
        this.showState('loading-state');
        this.updateLoadingText(this.state.progress || 'Analyzing with AI...');
        if (scanButton) {
          scanButton.disabled = true;
          scanButton.textContent = 'Analysis in Progress...';
        }
        break;
      case 'ready':
        this.showState('results-state');
        this.populateResults();
        if (scanButton) {
          scanButton.disabled = false;
          scanButton.textContent = 'Start Analysis';
        }
        break;
      case 'error':
        this.showState('error-state');
        if (scanButton) {
          scanButton.disabled = false;
          scanButton.textContent = 'Start Analysis';
        }
        break;
    }
  }

  private hideAllStates(): void {
    const states = ['initial-state', 'loading-state', 'results-state', 'error-state'];
    states.forEach(state => {
      const element = document.getElementById(state);
      element?.classList.add('hidden');
    });
  }

  private showState(stateId: string): void {
    const element = document.getElementById(stateId);
    element?.classList.remove('hidden');
  }

  private updateLoadingText(text: string): void {
    const loadingText = document.getElementById('loading-text');
    if (loadingText) {
      loadingText.textContent = text;
    }
  }

  private showScreenshotProgress(show: boolean, text?: string): void {
    const screenshotProgress = document.getElementById('screenshot-progress');
    const progressText = document.getElementById('progress-text');
    
    if (show && screenshotProgress && progressText) {
      screenshotProgress.classList.remove('hidden');
      if (text) {
        progressText.textContent = text;
      }
    } else if (screenshotProgress) {
      screenshotProgress.classList.add('hidden');
    }
  }

  private showError(message: string): void {
    this.state = { status: 'error', error: message };
    
    const errorMessage = document.getElementById('error-message');
    if (errorMessage) {
      errorMessage.textContent = message;
    }
    
    this.updateUI();
  }

  // Results population methods (keeping existing implementation)
  private populateResults(): void {
    if (!this.state.analysis || !this.state.rawData) return;

    const { analysis, rawData, fromCache } = this.state;

    // Show/hide cache banner
    const cacheBanner = document.getElementById('cache-banner');
    if (fromCache && cacheBanner) {
      cacheBanner.classList.remove('hidden');
    }

    // Page meta
    this.setTextContent('page-title', rawData.title);
    this.setTextContent('page-url', rawData.url);
    this.setTextContent('timestamp', new Date().toLocaleString());
    
    // Update star rating
    this.updateStarRating(analysis.starRating);

    try {
      if (analysis.pageSummary) {
        this.populatePageSummary(analysis.pageSummary);
      }
      
      if (analysis.recommendations) {
        this.populateStreamlinedRecommendations(analysis.recommendations);
      }
      
      if (analysis.quickWins) {
        this.populateQuickWins(analysis.quickWins);
      }
      
      if (analysis.visualCROAnalysis) {
        this.populateVisualCROAnalysis(analysis.visualCROAnalysis);
      }
    } catch (error) {
      console.warn('Error populating analysis sections:', error);
    }

    // Core sections
    this.populateList('executive-summary', analysis.executiveSummary || []);
    this.populateCopySuggestions(analysis.copySuggestions);
  }

  // Keep existing UI population methods (setTextContent, updateStarRating, etc.)
  private setTextContent(elementId: string, text: string): void {
    try {
      const element = document.getElementById(elementId);
      if (element) {
        element.textContent = text;
      }
    } catch (error) {
      console.warn(`Error setting text content for '${elementId}':`, error);
    }
  }

  private updateStarRating(rating: 1 | 2 | 3): void {
    const starElements = document.querySelectorAll('.star');
    const scorePill = document.getElementById('score-pill');
    
    if (!starElements.length || !scorePill) return;

    starElements.forEach(star => star.classList.remove('active'));

    for (let i = 0; i < rating; i++) {
      const star = starElements[i];
      if (star) {
        star.classList.add('active');
      }
    }

    scorePill.className = 'score-pill';
    if (rating === 3) {
      scorePill.style.backgroundColor = '#34a853';
    } else if (rating === 2) {
      scorePill.style.backgroundColor = '#fbbc05';
    } else {
      scorePill.style.backgroundColor = '#ea4335';
    }
  }

  private populateList(elementId: string, items: string[]): void {
    try {
      const container = document.getElementById(elementId);
      if (!container) return;

      container.innerHTML = '';
      if (Array.isArray(items)) {
        items.forEach(item => {
          const li = document.createElement('li');
          li.textContent = item || '';
          container.appendChild(li);
        });
      }
    } catch (error) {
      console.warn(`Error populating list for '${elementId}':`, error);
    }
  }

  private populatePageSummary(pageSummary: any): void {
    if (!pageSummary) return;
    
    try {
      this.setTextContent('business-type', pageSummary.businessType || 'Not specified');
      this.setTextContent('page-type', pageSummary.pageType || 'Not specified');
      this.setTextContent('conversion-goal', pageSummary.primaryConversionGoal || 'Not specified');
      this.setTextContent('target-audience', pageSummary.targetAudience || 'Not specified');
      this.setTextContent('purchase-behavior', this.formatPurchaseBehavior(pageSummary.purchaseBehaviorType) || 'Not specified');
      this.setTextContent('industry-context', pageSummary.industryContext || 'Industry context not provided');
      
      this.populateCustomerJourney(pageSummary.currentUserJourney || []);
      this.populateList('key-strengths', pageSummary.keyStrengths || []);
      this.populateList('critical-weaknesses', pageSummary.criticalWeaknesses || []);
    } catch (error) {
      console.warn('Error populating page summary:', error);
    }
  }

  private formatPurchaseBehavior(behaviorType: string): string {
    if (!behaviorType) return 'Not specified';
    
    switch (behaviorType.toLowerCase()) {
      case 'high-consideration':
        return 'High Consideration';
      case 'low-consideration':
        return 'Low Consideration';
      case 'impulse':
        return 'Impulse Purchase';
      default:
        return behaviorType.charAt(0).toUpperCase() + behaviorType.slice(1);
    }
  }

  private populateCustomerJourney(journeySteps: string[]): void {
    const container = document.getElementById('customer-journey');
    if (!container || !journeySteps || journeySteps.length === 0) {
      this.setTextContent('customer-journey', 'Customer journey analysis not available');
      return;
    }

    container.innerHTML = '';
    journeySteps.forEach(step => {
      const listItem = document.createElement('li');
      listItem.textContent = step;
      container.appendChild(listItem);
    });
  }

  private populateStreamlinedRecommendations(recommendations: any[]): void {
    const container = document.getElementById('streamlined-recommendations');
    if (!container) return;

    container.innerHTML = '';
    
    // Check if recommendations is defined and is an array
    if (!recommendations || !Array.isArray(recommendations)) {
      container.innerHTML = '<p style="color: #666; font-style: italic;">No recommendations available</p>';
      return;
    }
    
    recommendations.forEach((rec) => {
      const recElement = document.createElement('div');
      recElement.className = 'recommendation-card';

      const priorityClass = this.getPriorityClass(rec.priority);
      const effortStars = '●'.repeat(rec.effort);
      
      recElement.innerHTML = `
        <div class="rec-header">
          <h4 class="rec-title">${rec.title}</h4>
          <div class="rec-badges">
            <span class="priority-badge ${priorityClass}">${rec.priority}</span>
            <span class="effort-badge">Effort: ${effortStars}</span>
            <span class="timeline-badge">${rec.timeline}</span>
          </div>
        </div>
        <div class="rec-issue">
          <strong>Issue:</strong> ${rec.issue}
        </div>
        <div class="rec-solution">
          <strong>Solution:</strong> ${rec.solution}
        </div>
        <div class="rec-implementation">
          <strong>How to implement:</strong>
          <ul>${(rec.implementation || []).map((step: string) => `<li>${step}</li>`).join('')}</ul>
        </div>
        <div class="rec-psychology">
          <strong>Why this works:</strong> ${rec.psychologyBehind}
        </div>
      `;

      container.appendChild(recElement);
    });
  }

  private populateQuickWins(quickWins: any): void {
    const container = document.getElementById('quick-wins');
    if (!container) return;

    container.style.display = 'block';
    container.innerHTML = '';
    
    let winsArray: any[] = [];
    
    if (Array.isArray(quickWins)) {
      winsArray = quickWins;
    } else if (quickWins && typeof quickWins === 'object') {
      if (quickWins.quickWins && Array.isArray(quickWins.quickWins)) {
        winsArray = quickWins.quickWins;
      } else if (quickWins.data && Array.isArray(quickWins.data)) {
        winsArray = quickWins.data;
      } else {
        winsArray = Object.values(quickWins).filter((item: any) => 
          item && typeof item === 'object' && (item.title || item.description)
        );
      }
    }
    
    if (!winsArray || winsArray.length === 0) {
      container.innerHTML = '<p style="color: #666; font-style: italic;">No quick wins available</p>';
      return;
    }

    winsArray.forEach((win) => {
      const winElement = document.createElement('div');
      winElement.className = 'quick-win-card';

      const effortStars = '●'.repeat(win.effort || 1);
      const description = win.description || win.rationale || 'No description available';
      
      winElement.innerHTML = `
        <div class="win-header">
          <h4 class="win-title">${win.title || 'Quick Win'}</h4>
          <div class="win-badges">
            <span class="effort-badge">Effort: ${effortStars}</span>
            <span class="timeline-badge">${win.timeline || 'TBD'}</span>
          </div>
        </div>
        <div class="win-description">
          <p><strong>What to do:</strong> ${description}</p>
          ${win.rationale && win.description !== win.rationale ? `<p><strong>Why:</strong> ${win.rationale}</p>` : ''}
        </div>
      `;

      container.appendChild(winElement);
    });
  }

  private populateVisualCROAnalysis(visualCRO: any): void {
    const section = document.getElementById('visual-cro-section');
    if (!section) return;

    section.classList.remove('hidden');
    
    this.setTextContent('eye-flow-path', visualCRO.visualFlow?.eyeFlowPath || 'Analyzing...');
    this.setTextContent('flow-score', `${visualCRO.visualFlow?.flowScore || '-'}/10`);
    
    const flowDistractionsContainer = document.getElementById('flow-distractions-container');
    const flowDistractionsList = document.getElementById('flow-distractions');
    if (flowDistractionsList && visualCRO.visualFlow?.distractions?.length > 0) {
      flowDistractionsContainer?.classList.remove('hidden');
      this.populateList('flow-distractions', visualCRO.visualFlow.distractions);
    } else {
      flowDistractionsContainer?.classList.add('hidden');
    }

    this.setTextContent('cta-contrast', visualCRO.colorContrast?.ctaContrast || 'Analyzing...');
    this.setTextContent('readability', visualCRO.colorContrast?.readability || 'Analyzing...');
    this.setTextContent('emotional-response', visualCRO.colorContrast?.emotionalResponse || 'Analyzing...');
    this.setTextContent('contrast-score', `${visualCRO.colorContrast?.contrastScore || '-'}/10`);

    this.setTextContent('critical-problem', visualCRO.criticalIssue?.problem || 'Analyzing critical visual issues...');
    this.setTextContent('critical-solution', visualCRO.criticalIssue?.solution || 'Generating solution...');
    this.setTextContent('critical-impact', visualCRO.criticalIssue?.impact || 'Analyzing...');
  }

  private populateCopySuggestions(suggestions?: any[]): void {
    const section = document.getElementById('copy-suggestions-section');
    const container = document.getElementById('copy-suggestions');
    
    if (!suggestions || suggestions.length === 0) {
      section?.classList.add('hidden');
      return;
    }

    section?.classList.remove('hidden');
    if (!container) return;

    container.innerHTML = '';
    suggestions.forEach(suggestion => {
      const suggestionElement = document.createElement('div');
      suggestionElement.className = 'copy-suggestion';

      suggestionElement.innerHTML = `
        <div class="suggestion-section">${suggestion.section}</div>
        <div class="suggestion-text">${suggestion.suggestion}</div>
      `;

      container.appendChild(suggestionElement);
    });
  }

  private getPriorityClass(priority: string): string {
    switch (priority) {
      case 'critical': return 'priority-critical';
      case 'high': return 'priority-high';
      case 'medium': return 'priority-medium';
      case 'low': return 'priority-low';
      default: return 'priority-neutral';
    }
  }

  private async handleExportClick(): Promise<void> {
    if (!this.state.analysis || !this.state.rawData) return;

    try {
      const exportButton = document.getElementById('export-pdf-button') as HTMLButtonElement;
      if (exportButton) {
        exportButton.disabled = true;
        exportButton.textContent = 'Generating PDF...';
      }

      await generatePDF(this.state.analysis, this.state.rawData);
      
      if (exportButton) {
        exportButton.disabled = false;
        exportButton.textContent = 'Export PDF';
      }
    } catch (error) {
      console.error('PDF export failed:', error);
      
      const exportButton = document.getElementById('export-pdf-button') as HTMLButtonElement;
      if (exportButton) {
        exportButton.disabled = false;
        exportButton.textContent = 'Export PDF';
      }
      
      if (error instanceof Error) {
        if (error.message.includes('quota') || error.message.includes('large content')) {
          this.showError('PDF export failed: Analysis too detailed for PDF.');
        } else {
          this.showError(`PDF export failed: ${error.message}`);
        }
      } else {
        this.showError('Failed to export PDF. Please try again.');
      }
    }
  }

  private openOptions(): void {
    chrome.runtime.openOptionsPage();
  }

  private async updateProviderNotice(): Promise<void> {
    try {
      const settings = await StorageManager.getSettings();
      const geminiNotice = document.getElementById('gemini-notice');
      const openaiNotice = document.getElementById('openai-notice');
      const openaiTextNotice = document.getElementById('openai-text-notice');

      if (settings.provider === 'gemini') {
        geminiNotice?.classList.remove('hidden');
        openaiNotice?.classList.add('hidden');
        openaiTextNotice?.classList.add('hidden');
      } else {
        geminiNotice?.classList.add('hidden');
        
        const modelName = settings.openaiModel;
        const supportsVision = modelName.includes('gpt-4') || modelName.startsWith('gpt-5');
        
        if (supportsVision) {
          openaiNotice?.classList.remove('hidden');
          openaiTextNotice?.classList.add('hidden');
        } else {
          openaiNotice?.classList.add('hidden');
          openaiTextNotice?.classList.remove('hidden');
        }
      }
    } catch (error) {
      console.warn('Failed to update provider notice:', error);
    }
  }

  private handleVisualAnalysisLinkClick(): void {
    chrome.runtime.openOptionsPage();
  }

  // Cleanup when popup closes
  public cleanup(): void {
    this.stopStatusPolling();
    
    // Remove storage listener
    if (this.storageListener) {
      chrome.storage.onChanged.removeListener(this.storageListener);
      this.storageListener = null;
    }
    
    console.log('🔌 PopupController subscriber cleaned up');
  }
}

// Initialize popup when DOM is ready
function initializePopup() {
  try {
    console.log('🚀 Initializing PopupController subscriber...');
    
    if (PopupController.getInstance()) {
      console.warn('🚫 PopupController already exists');
      return;
    }
    
    // Make sure basic DOM elements exist
    const appElement = document.getElementById('app');
    if (!appElement) {
      console.error('❌ [Popup] App element not found in DOM');
      return;
    }
    
    PopupController.getOrCreateInstance();
  } catch (error) {
    console.error('❌ [Popup] Failed to initialize popup:', error);
    
    // Try to show at least something to the user
    try {
      const appElement = document.getElementById('app');
      if (appElement) {
        appElement.innerHTML = `
          <div style="padding: 20px; text-align: center;">
            <h3>⚠️ Extension Error</h3>
            <p>Failed to initialize CRO Genie. Please try:</p>
            <ul style="text-align: left; margin: 10px 0;">
              <li>Reload this extension</li>
              <li>Refresh this page</li>
              <li>Check browser console for details</li>
            </ul>
            <p style="font-size: 12px; color: #666;">Error: ${error.message}</p>
          </div>
        `;
      }
    } catch (fallbackError) {
      console.error('❌ [Popup] Even fallback error display failed:', fallbackError);
    }
  }
}

// Handle different loading states
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure DOM is fully ready
    setTimeout(initializePopup, 10);
  });
} else {
  // Small delay even if DOM is ready to ensure all elements are accessible
  setTimeout(initializePopup, 10);
}

// Cleanup on window unload
window.addEventListener('beforeunload', () => {
  const instance = PopupController.getInstance();
  if (instance) {
    instance.cleanup();
  }
});
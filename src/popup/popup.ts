import { StorageManager } from '../utils/storage';
import { generatePDF } from '../utils/pdf';
import { AnalysisState, LLMAnalysis, RawPageData } from '../types';

class PopupController {
  private state: AnalysisState = { status: 'idle' };
  private currentUrl: string = '';
  private currentJobId: string | null = null;

  constructor() {
    this.init();
    this.setupMessageListener();
  }

  private async init(): Promise<void> {
    // Get current tab URL
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.url) {
      this.currentUrl = tabs[0].url;
    }

    // Try to wake up background script if needed (helps with service worker idle state)
    // This is optional and may fail silently if service worker is idle
    await this.ensureBackgroundReady();

    // Check for cached results
    await this.checkForCachedResults();

    // Check for active jobs
    await this.checkForActiveJobs();

    // Update provider notice
    await this.updateProviderNotice();

    // Set up event listeners
    this.setupEventListeners();

    // Clean old cache on startup
    StorageManager.cleanOldCache();
  }

  private setupEventListeners(): void {
    // Listen for job status updates
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local') {
        this.handleStorageChanges(changes);
      }
    });

    // Scan button
    const scanButton = document.getElementById('scan-button');
    scanButton?.addEventListener('click', () => this.handleScanClick());

    // Re-run buttons
    const rerunButton = document.getElementById('rerun-button');
    rerunButton?.addEventListener('click', () => this.handleRerunClick());

    const rerunCacheButton = document.getElementById('rerun-cache-button');
    rerunCacheButton?.addEventListener('click', () => this.handleRerunClick());

    // Export PDF button
    const exportButton = document.getElementById('export-pdf-button');
    exportButton?.addEventListener('click', () => this.handleExportClick());

    // Options button
    const optionsButton = document.getElementById('options-button');
    optionsButton?.addEventListener('click', () => this.openOptions());

    const optionsErrorButton = document.getElementById('options-error-button');
    optionsErrorButton?.addEventListener('click', () => this.openOptions());

    // Retry button
    const retryButton = document.getElementById('retry-button');
    retryButton?.addEventListener('click', () => this.handleScanClick());

    // Visual analysis link
    const visualAnalysisLink = document.getElementById('visual-analysis-link');
    visualAnalysisLink?.addEventListener('click', (e) => {
      e.preventDefault();
      this.handleVisualAnalysisLinkClick();
    });
  }

  private async handleStorageChanges(changes: { [key: string]: chrome.storage.StorageChange }): Promise<void> {
    // Check if any job status changed
    for (const [key, change] of Object.entries(changes)) {
      if (key.startsWith('analysis_jobs_') && change.newValue) {
        const job = change.newValue;
        if (job.id === this.currentJobId) {
          await this.updateJobStatus(job);
        }
      }
    }
  }

  private async ensureBackgroundReady(): Promise<void> {
    try {
      // Simple ping to wake up the background script (with minimal retry)
      await this.sendMessageToBackground({ type: 'PING' }, 1);
      console.debug('Background script ping successful');
    } catch (error) {
      // If ping fails, that's completely normal - background will wake up on first real request
      console.debug('Background script ping failed (this is normal during service worker idle):', error);
      // Don't show any errors to user for this - it's expected behavior
    }
  }

  private async checkForActiveJobs(): Promise<void> {
    if (!this.currentUrl) return;

    try {
      // Use minimal retries to avoid blocking popup initialization
      const response = await this.sendMessageToBackground({ type: 'GET_ALL_JOBS' }, 1);
      if (response?.success && Array.isArray(response.jobs)) {
        const activeJob = response.jobs.find((job: any) => 
          job.url === this.currentUrl && 
          (job.status === 'pending' || job.status === 'scraping' || job.status === 'analyzing')
        );
        
        if (activeJob) {
          this.currentJobId = activeJob.id;
          this.state = { 
            status: activeJob.status === 'analyzing' ? 'analyzing' : 'scraping',
            progress: activeJob.progress || 'Analysis in progress...'
          };
          this.updateUI();
          console.log(`Found active job: ${activeJob.id} (${activeJob.status})`);
        }
      }
    } catch (error) {
      console.warn('Failed to check for active jobs (background may be busy with analysis):', error);
      
      // If we get connection errors, check if we have cached job info
      const lastJobId = localStorage.getItem('lastJobId');
      const lastJobUrl = localStorage.getItem('lastJobUrl');
      
      if (lastJobId && lastJobUrl === this.currentUrl) {
        console.log('Using cached job info during background analysis');
        this.currentJobId = lastJobId;
        this.state = {
          status: 'analyzing',
          progress: 'Analysis in progress... (Background busy, please wait)'
        };
        this.updateUI();
        
        // Set up polling to check when background becomes available again
        this.startPollingForResumption();
      }
    }
  }

  private async checkForCachedResults(): Promise<void> {
    if (!this.currentUrl) return;

    const cached = await StorageManager.getCachedAudit(this.currentUrl);
    if (cached) {
      this.state = {
        status: 'ready',
        analysis: cached.analysis,
        rawData: cached.rawData,
        fromCache: true
      };
      this.updateUI();
    }
  }

  private async handleScanClick(): Promise<void> {
    const scanButton = document.getElementById('scan-button') as HTMLButtonElement;
    
    // Prevent multiple concurrent scans
    if (this.state.status === 'scraping' || this.state.status === 'analyzing') {
      console.warn('Scan already in progress, ignoring duplicate request');
      
      // Disable button to prevent UI confusion
      if (scanButton) {
        scanButton.disabled = true;
        scanButton.textContent = 'Analysis in Progress...';
      }
      
      // If we have a job ID, try to get status update
      if (this.currentJobId) {
        console.log('Attempting to get status update for existing job...');
        try {
          const statusResponse = await this.sendMessageToBackground({
            type: 'GET_JOB_STATUS',
            jobId: this.currentJobId
          }, 1);
          
          if (statusResponse?.success && statusResponse.job) {
            this.updateJobStatus(statusResponse.job);
          }
        } catch (error) {
          console.warn('Could not get job status update, background may be busy');
        }
      }
      
      return;
    }

    // Disable button during analysis start to prevent double-clicks
    if (scanButton) {
      scanButton.disabled = true;
      scanButton.textContent = 'Starting Analysis...';
    }

    try {
      await this.startAnalysis(false);
    } catch (error) {
      // Re-enable button on error
      if (scanButton) {
        scanButton.disabled = false;
        scanButton.textContent = 'Start Analysis';
      }
      throw error;
    }
  }

  private async handleRerunClick(): Promise<void> {
    await this.startAnalysis(true);
  }

  private async startAnalysis(forceRefresh: boolean = false): Promise<void> {
    if (!this.currentUrl) {
      this.showError('Unable to analyze this page');
      return;
    }

    // Validate URL before starting analysis
    if (!this.isValidAnalysisUrl(this.currentUrl)) {
      this.showError(`Cannot analyze this type of URL: ${this.currentUrl}. Please navigate to a regular website (http/https) to use CRO Genie.`);
      return;
    }

    // Check if we should use cache
    if (!forceRefresh) {
      const cached = await StorageManager.getCachedAudit(this.currentUrl);
      if (cached) {
        this.state = {
          status: 'ready',
          analysis: cached.analysis,
          rawData: cached.rawData,
          fromCache: true
        };
        this.updateUI();
        return;
      }
    }

    try {
      // Check API key and get settings
      const settings = await StorageManager.getSettings();
      const currentApiKey = settings.provider === 'gemini' ? settings.geminiApiKey : settings.openaiApiKey;
      if (!currentApiKey) {
        const providerName = settings.provider === 'gemini' ? 'Gemini' : 'OpenAI';
        this.showError(`${providerName} API key not configured. Please go to Options to set your API key.`);
        return;
      }

      // Get current tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]?.id) {
        this.showError('No active tab found');
        return;
      }

      // Start analysis job in background
      const response = await this.sendMessageToBackground({
        type: 'START_ANALYSIS',
        tabId: tabs[0].id,
        url: this.currentUrl
      }, 5); // Increased retries for critical operation

      if (response.success) {
        this.currentJobId = response.jobId;
        console.log('Analysis started with job ID:', response.jobId);
        
        // Cache job info for recovery during background analysis
        localStorage.setItem('lastJobId', response.jobId);
        localStorage.setItem('lastJobUrl', this.currentUrl);
        
        this.state = { 
          status: 'scraping',
          progress: 'Analysis started. You can close this popup and return later.'
        };
        this.updateUI();
      } else {
        throw new Error(response.error || 'Failed to start analysis');
      }

    } catch (error) {
      console.error('Failed to start analysis:', error);
      this.showError(error instanceof Error ? error.message : 'Failed to start analysis');
    }
  }

  private async updateJobStatus(job: any): Promise<void> {
    switch (job.status) {
      case 'scraping':
        this.state = { status: 'scraping', progress: job.progress || 'Scraping page content...' };
        break;
      case 'analyzing':
        this.state = { status: 'analyzing', progress: job.progress || 'Analyzing with AI...' };
        break;
      case 'completed':
        // Job completed, check for cached results
        await this.checkForCachedResults();
        this.currentJobId = null;
        
        // Clear cached job info
        localStorage.removeItem('lastJobId');
        localStorage.removeItem('lastJobUrl');
        break;
      case 'failed':
        this.showError(job.error || 'Analysis failed');
        this.currentJobId = null;
        
        // Clear cached job info
        localStorage.removeItem('lastJobId');
        localStorage.removeItem('lastJobUrl');
        break;
    }
    this.updateUI();
  }

  /**
   * Start polling to resume connection when background becomes available
   */
  private startPollingForResumption(): void {
    let attempts = 0;
    const maxAttempts = 10; // Try for about 20 seconds
    
    const poll = async () => {
      attempts++;
      try {
        if (this.currentJobId) {
          const response = await this.sendMessageToBackground({
            type: 'GET_JOB_STATUS',
            jobId: this.currentJobId
          }, 1);
          
          if (response?.success) {
            console.log('Background connection resumed');
            if (response.job) {
              this.updateJobStatus(response.job);
              
              // If job is completed, clear cache
              if (response.job.status === 'completed' || response.job.status === 'failed') {
                localStorage.removeItem('lastJobId');
                localStorage.removeItem('lastJobUrl');
              }
            }
            return; // Stop polling
          }
        }
      } catch (error) {
        console.debug(`Polling attempt ${attempts} failed, background still busy`);
      }
      
      if (attempts < maxAttempts) {
        setTimeout(poll, 2000); // Check every 2 seconds
      } else {
        console.warn('Could not resume background connection, giving up');
        // Clear cached job info
        localStorage.removeItem('lastJobId');
        localStorage.removeItem('lastJobUrl');
        this.state = { status: 'idle' };
        this.updateUI();
      }
    };
    
    setTimeout(poll, 2000); // Start polling after 2 seconds
  }

  /**
   * Check if URL is valid for analysis
   */
  private isValidAnalysisUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      
      // Block restricted protocols
      const restrictedProtocols = ['chrome:', 'chrome-extension:', 'moz-extension:', 'edge:', 'about:', 'data:', 'file:', 'ftp:'];
      if (restrictedProtocols.includes(urlObj.protocol)) {
        return false;
      }
      
      // Only allow http and https
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        return false;
      }
      
      // Block localhost/private IPs (optional - you might want to allow these)
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

  /**
   * Setup message listener for screenshot progress updates
   */
  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'SCREENSHOT_PROGRESS') {
        this.showScreenshotProgress(message.message);
      } else if (message.type === 'SCREENSHOT_PROGRESS_CLEAR') {
        this.clearScreenshotProgress();
      }
    });
  }

  /**
   * Show screenshot progress in popup
   */
  private showScreenshotProgress(message: string): void {
    const progressElement = document.getElementById('screenshot-progress');
    const messageElement = document.getElementById('screenshot-message');
    
    if (progressElement && messageElement) {
      messageElement.textContent = message;
      progressElement.classList.remove('hidden');
    }
  }

  /**
   * Clear screenshot progress from popup
   */
  private clearScreenshotProgress(): void {
    const progressElement = document.getElementById('screenshot-progress');
    if (progressElement) {
      progressElement.classList.add('hidden');
    }
  }

  private async sendMessageToBackground(message: any, maxRetries: number = 3): Promise<any> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Message timeout - background script may be idle'));
          }, 5000); // 5 second timeout

          chrome.runtime.sendMessage(message, (response) => {
            clearTimeout(timeout);
            
            if (chrome.runtime.lastError) {
              const errorMessage = chrome.runtime.lastError.message || 'Connection failed';
              // Handle specific service worker idle errors
              if (errorMessage.includes('message port closed') || 
                  errorMessage.includes('Extension context invalidated') ||
                  errorMessage.includes('receiving end does not exist')) {
                reject(new Error(`Background script idle: ${errorMessage}`));
              } else {
                reject(new Error(errorMessage));
              }
            } else if (!response) {
              reject(new Error('No response received from background script'));
            } else {
              resolve(response);
            }
          });
        });
        return response;
      } catch (error) {
        const isIdleError = error instanceof Error && 
          (error.message.includes('Background script idle') || 
           error.message.includes('message port closed') ||
           error.message.includes('timeout'));
           
        console.warn(`Message attempt ${attempt} failed:`, error);
        
        if (attempt === maxRetries) {
          // For idle errors, return a graceful fallback instead of throwing
          if (isIdleError && (message.type === 'GET_ALL_JOBS' || message.type === 'GET_JOB_STATUS' || message.type === 'PING')) {
            console.info('Background script appears idle, returning empty response for:', message.type);
            return { success: true, jobs: [], job: null };
          }
          console.error(`Failed to send message after ${maxRetries} attempts:`, message.type);
          throw error;
        }
        
        // For idle errors, wait longer to allow service worker to wake up
        const waitTime = isIdleError ? 
          1000 * Math.pow(2, attempt) : // 2s, 4s, 8s for idle errors
          500 * Math.pow(2, attempt - 1); // 500ms, 1s, 2s for other errors
          
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    throw new Error('Unexpected end of retry loop');
  }

  private updateUI(): void {
    this.hideAllStates();

    // Update button states based on current status
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
      // Streamlined sections - focused and non-redundant
      if (analysis.pageSummary) {
        this.populatePageSummary(analysis.pageSummary);
      }
      
      if (analysis.recommendations) {
        this.populateStreamlinedRecommendations(analysis.recommendations);
      }
      
      console.log('Full analysis object:', analysis);
      console.log('Quick wins check:', analysis.quickWins);
      console.log('Quick wins type:', typeof analysis.quickWins);
      console.log('Quick wins length:', analysis.quickWins?.length);
      console.log('Analysis keys:', Object.keys(analysis));
      
      // Try multiple ways to find quick wins data
      let quickWinsData = null;
      
      if (analysis.quickWins && Array.isArray(analysis.quickWins) && analysis.quickWins.length > 0) {
        quickWinsData = analysis.quickWins;
        console.log('Found quickWins array:', quickWinsData);
      } else if (analysis.quickWins && typeof analysis.quickWins === 'object') {
        // Try to extract from object
        quickWinsData = Object.values(analysis.quickWins).filter(item => 
          item && typeof item === 'object' && (item.title || item.description)
        );
        console.log('Extracted quickWins from object:', quickWinsData);
      } else {
        console.warn('No quick wins data found in analysis');
        console.warn('Available analysis keys:', Object.keys(analysis));
      }
      
      if (quickWinsData && quickWinsData.length > 0) {
        console.log('Populating quick wins with data:', quickWinsData);
        this.populateQuickWins(quickWinsData);
      } else {
        console.warn('No valid quick wins data to display');
        // Hide the quick wins section entirely if no data
        const container = document.getElementById('quick-wins');
        if (container) {
          container.style.display = 'none';
        }
      }
      
      if (analysis.visualCROAnalysis) {
        this.populateVisualCROAnalysis(analysis.visualCROAnalysis);
      }
    } catch (error) {
      console.warn('Error populating analysis sections:', error);
    }

    // Core sections (always present)
    this.populateList('executive-summary', analysis.executiveSummary || []);
    this.populateCopySuggestions(analysis.copySuggestions);
  }

  private setTextContent(elementId: string, text: string): void {
    try {
      const element = document.getElementById(elementId);
      if (element) {
        element.textContent = text;
      } else {
        console.warn(`Element with id '${elementId}' not found`);
      }
    } catch (error) {
      console.warn(`Error setting text content for '${elementId}':`, error);
    }
  }

  private updateStarRating(rating: 1 | 2 | 3): void {
    const starElements = document.querySelectorAll('.star');
    const scorePill = document.getElementById('score-pill');
    
    if (!starElements.length || !scorePill) return;

    // Reset all stars to inactive
    starElements.forEach(star => {
      star.classList.remove('active');
    });

    // Activate stars up to the rating
    for (let i = 0; i < rating; i++) {
      const star = starElements[i];
      if (star) {
        star.classList.add('active');
      }
    }

    // Set background color based on rating
    scorePill.className = 'score-pill';
    if (rating === 3) {
      scorePill.style.backgroundColor = '#34a853'; // Green - Well optimized
    } else if (rating === 2) {
      scorePill.style.backgroundColor = '#fbbc05'; // Yellow - Good foundation
    } else {
      scorePill.style.backgroundColor = '#ea4335'; // Red - Major issues
    }
  }

  private populateList(elementId: string, items: string[]): void {
    try {
      const container = document.getElementById(elementId);
      if (!container) {
        console.warn(`Element with id '${elementId}' not found`);
        return;
      }

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

  private populateTopFixes(fixes: any[]): void {
    const container = document.getElementById('top-fixes');
    if (!container) return;

    container.innerHTML = '';
    fixes.forEach(fix => {
      const fixElement = document.createElement('div');
      fixElement.className = 'fix-item';

      const impactStars = '★'.repeat(fix.impact);
      const effortStars = '★'.repeat(fix.effort);

      fixElement.innerHTML = `
        <div class="fix-header">
          <div class="fix-title">${fix.title}</div>
          <div class="fix-badges">
            <span class="impact-badge">Impact: ${impactStars}</span>
            <span class="effort-badge">Effort: ${effortStars}</span>
          </div>
        </div>
        <div class="fix-details">
          <div class="fix-why"><strong>Why:</strong> ${fix.why}</div>
          <div class="fix-how"><strong>How:</strong> ${fix.how}</div>
          ${fix.psychology ? `<div class="fix-psychology">${fix.psychology}</div>` : ''}
        </div>
      `;

      container.appendChild(fixElement);
    });
  }

  private populateChecklist(checklist: any[]): void {
    const container = document.getElementById('checklist');
    if (!container) return;

    container.innerHTML = '';
    checklist.forEach(item => {
      const itemElement = document.createElement('div');
      itemElement.className = 'checklist-item';

      let statusIcon = '○';
      let statusClass = 'status-neutral';
      
      if (item.result === 'pass') {
        statusIcon = '✓';
        statusClass = 'status-pass';
      } else if (item.result === 'fail') {
        statusIcon = '✗';
        statusClass = 'status-fail';
      }

      itemElement.innerHTML = `
        <div class="checklist-status ${statusClass}">${statusIcon}</div>
        <div class="checklist-content">
          <div class="checklist-area">${item.area}</div>
          <div class="checklist-note">${item.note}</div>
        </div>
      `;

      container.appendChild(itemElement);
    });
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

  private showError(message: string): void {
    this.state = { status: 'error', error: message };
    
    const errorMessage = document.getElementById('error-message');
    if (errorMessage) {
      errorMessage.textContent = message;
    }
    
    this.updateUI();
  }

  private async handleExportClick(): Promise<void> {
    if (!this.state.analysis || !this.state.rawData) return;

    try {
      // Show loading state during PDF generation
      const exportButton = document.getElementById('export-pdf-button') as HTMLButtonElement;
      if (exportButton) {
        exportButton.disabled = true;
        exportButton.textContent = 'Generating PDF...';
      }

      await generatePDF(this.state.analysis, this.state.rawData);
      
      // Reset button state on success
      if (exportButton) {
        exportButton.disabled = false;
        exportButton.textContent = 'Export PDF';
      }
    } catch (error) {
      console.error('PDF export failed:', error);
      
      // Reset button state
      const exportButton = document.getElementById('export-pdf-button') as HTMLButtonElement;
      if (exportButton) {
        exportButton.disabled = false;
        exportButton.textContent = 'Export PDF';
      }
      
      // Provide specific error messages for quota issues
      if (error instanceof Error) {
        if (error.message.includes('quota') || error.message.includes('large content')) {
          this.showError('PDF export failed: Analysis too detailed for PDF. The enhanced visual analysis creates very comprehensive reports that may exceed PDF size limits. You can still view all insights in the app.');
        } else {
          this.showError(`PDF export failed: ${error.message}`);
        }
      } else {
        this.showError('Failed to export PDF. Please try again.');
      }
    }
  }

  private populatePageSummary(pageSummary: any): void {
    if (!pageSummary) return;
    
    try {
      // Core page overview fields
      this.setTextContent('business-type', pageSummary.businessType || 'Not specified');
      this.setTextContent('page-type', pageSummary.pageType || 'Not specified');
      this.setTextContent('conversion-goal', pageSummary.primaryConversionGoal || 'Not specified');
      this.setTextContent('target-audience', pageSummary.targetAudience || 'Not specified');
      this.setTextContent('purchase-behavior', this.formatPurchaseBehavior(pageSummary.purchaseBehaviorType) || 'Not specified');
      
      // Industry context section
      this.setTextContent('industry-context', pageSummary.industryContext || 'Industry context not provided');
      
      // Customer journey
      this.populateCustomerJourney(pageSummary.currentUserJourney || []);
      
      // Strengths and weaknesses
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
    recommendations.forEach((rec, index) => {
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
          <ul>${rec.implementation.map((step: string) => `<li>${step}</li>`).join('')}</ul>
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
    if (!container) {
      console.warn('Quick wins container not found');
      return;
    }

    // Make sure the container is visible
    container.style.display = 'block';

    console.log('Populating quick wins:', quickWins);
    console.log('Quick wins type:', typeof quickWins);
    console.log('Is array:', Array.isArray(quickWins));
    container.innerHTML = '';
    
    // Handle different data formats
    let winsArray: any[] = [];
    
    if (Array.isArray(quickWins)) {
      winsArray = quickWins;
    } else if (quickWins && typeof quickWins === 'object') {
      // If it's an object, try to extract array from it
      if (quickWins.quickWins && Array.isArray(quickWins.quickWins)) {
        winsArray = quickWins.quickWins;
      } else if (quickWins.data && Array.isArray(quickWins.data)) {
        winsArray = quickWins.data;
      } else {
        // Convert object to array if it has numeric keys
        winsArray = Object.values(quickWins).filter(item => 
          item && typeof item === 'object' && (item.title || item.description)
        );
      }
    }
    
    if (!winsArray || winsArray.length === 0) {
      console.warn('No valid quick wins data provided');
      container.innerHTML = '<p style="color: #666; font-style: italic;">No quick wins available</p>';
      return;
    }

    winsArray.forEach((win, index) => {
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
    
    console.log('Quick wins populated successfully');
  }

  private populateVisualCROAnalysis(visualCRO: any): void {
    const section = document.getElementById('visual-cro-section');
    if (!section) return;

    // Show the section
    section.classList.remove('hidden');
    
    console.log('populateVisualCROAnalysis called with:', visualCRO);

    // Populate Visual Flow
    this.setTextContent('eye-flow-path', visualCRO.visualFlow?.eyeFlowPath || 'Analyzing...');
    this.setTextContent('flow-score', `${visualCRO.visualFlow?.flowScore || '-'}/10`);
    
    // Populate flow distractions
    const flowDistractionsContainer = document.getElementById('flow-distractions-container');
    const flowDistractionsList = document.getElementById('flow-distractions');
    if (flowDistractionsList && visualCRO.visualFlow?.distractions?.length > 0) {
      flowDistractionsContainer?.classList.remove('hidden');
      this.populateList('flow-distractions', visualCRO.visualFlow.distractions);
    } else {
      flowDistractionsContainer?.classList.add('hidden');
    }


    // Populate Color & Contrast
    this.setTextContent('cta-contrast', visualCRO.colorContrast?.ctaContrast || 'Analyzing...');
    this.setTextContent('readability', visualCRO.colorContrast?.readability || 'Analyzing...');
    this.setTextContent('emotional-response', visualCRO.colorContrast?.emotionalResponse || 'Analyzing...');
    this.setTextContent('contrast-score', `${visualCRO.colorContrast?.contrastScore || '-'}/10`);

    // Populate Critical Issue
    this.setTextContent('critical-problem', visualCRO.criticalIssue?.problem || 'Analyzing critical visual issues...');
    this.setTextContent('critical-solution', visualCRO.criticalIssue?.solution || 'Generating solution...');
    this.setTextContent('critical-impact', visualCRO.criticalIssue?.impact || 'Analyzing...');
  }

  private populateConversionAnalysis(conversionAnalysis: any): void {
    if (!conversionAnalysis) return;
    
    this.populateConversionPath(conversionAnalysis.conversionPath || []);
    this.populateDropOffPoints(conversionAnalysis.dropOffPoints || []);
    this.populateFrictionAnalysis(conversionAnalysis.frictionAnalysis || []);
    this.populateTrustFactors(conversionAnalysis.trustFactors || []);
    this.populateUrgencyFactors(conversionAnalysis.urgencyFactors || []);
  }

  private populateConversionPath(conversionPath: any[]): void {
    const container = document.getElementById('conversion-path');
    if (!container) return;

    container.innerHTML = '';
    conversionPath.forEach((step, index) => {
      const stepElement = document.createElement('div');
      stepElement.className = 'conversion-step';

      const effectiveness = this.getEffectivenessClass(step.currentEffectiveness);
      
      stepElement.innerHTML = `
        <div class="step-header">
          <span class="step-number">${index + 1}</span>
          <span class="step-title">${step.step}</span>
          <span class="effectiveness-badge ${effectiveness}">${step.currentEffectiveness}</span>
        </div>
        <div class="step-description">${step.description}</div>
        <div class="step-opportunity"><strong>Opportunity:</strong> ${step.optimizationOpportunity}</div>
      `;

      container.appendChild(stepElement);
    });
  }

  private populateDropOffPoints(dropOffPoints: any[]): void {
    const container = document.getElementById('dropoff-points');
    if (!container) return;

    container.innerHTML = '';
    dropOffPoints.forEach(point => {
      const pointElement = document.createElement('div');
      pointElement.className = 'dropoff-point';

      const impactClass = this.getImpactClass(point.impact);
      
      pointElement.innerHTML = `
        <div class="point-header">
          <span class="point-location">${point.location}</span>
          <span class="impact-badge ${impactClass}">${point.impact} impact</span>
        </div>
        <div class="point-reason"><strong>Issue:</strong> ${point.reason}</div>
        <div class="point-solution"><strong>Solution:</strong> ${point.solution}</div>
      `;

      container.appendChild(pointElement);
    });
  }

  private populateFrictionAnalysis(frictionAnalysis: any[]): void {
    const container = document.getElementById('friction-analysis');
    if (!container) return;

    container.innerHTML = '';
    frictionAnalysis.forEach(friction => {
      const frictionElement = document.createElement('div');
      frictionElement.className = 'friction-point';

      const priorityClass = this.getPriorityClass(friction.priority);
      
      frictionElement.innerHTML = `
        <div class="friction-header">
          <span class="friction-element">${friction.element}</span>
          <span class="priority-badge ${priorityClass}">${friction.priority}</span>
        </div>
        <div class="friction-issue"><strong>Issue:</strong> ${friction.issue}</div>
        <div class="friction-impact"><strong>User Impact:</strong> ${friction.userImpact}</div>
        <div class="friction-solution"><strong>Solution:</strong> ${friction.solution}</div>
      `;

      container.appendChild(frictionElement);
    });
  }

  private populateTrustFactors(trustFactors: any[]): void {
    const container = document.getElementById('trust-factors');
    if (!container) return;

    container.innerHTML = '';
    trustFactors.forEach(trust => {
      const trustElement = document.createElement('div');
      trustElement.className = 'trust-factor';

      const stateClass = this.getEffectivenessClass(trust.currentState);
      
      trustElement.innerHTML = `
        <div class="trust-header">
          <span class="trust-element">${trust.element}</span>
          <span class="state-badge ${stateClass}">${trust.currentState}</span>
        </div>
        <div class="trust-recommendation"><strong>Recommendation:</strong> ${trust.recommendation}</div>
        <div class="trust-impact"><strong>Expected Impact:</strong> ${trust.impact}</div>
      `;

      container.appendChild(trustElement);
    });
  }

  private populateUrgencyFactors(urgencyFactors: any[]): void {
    const container = document.getElementById('urgency-factors');
    if (!container) return;

    container.innerHTML = '';
    urgencyFactors.forEach(urgency => {
      const urgencyElement = document.createElement('div');
      urgencyElement.className = 'urgency-factor';

      const levelClass = this.getUrgencyClass(urgency.currentLevel);
      
      urgencyElement.innerHTML = `
        <div class="urgency-header">
          <span class="urgency-element">${urgency.element}</span>
          <span class="level-badge ${levelClass}">${urgency.currentLevel}</span>
        </div>
        <div class="urgency-recommendation"><strong>Recommendation:</strong> ${urgency.recommendation}</div>
        <div class="urgency-psychology"><strong>Psychology:</strong> ${urgency.psychologyBehind}</div>
      `;

      container.appendChild(urgencyElement);
    });
  }

  private populateCurrentStateAnalysis(currentStateAnalysis: any): void {
    if (!currentStateAnalysis) return;
    
    this.populateHeadlineAnalysis(currentStateAnalysis.headlines || []);
    this.populateCTAAnalysis(currentStateAnalysis.callsToAction || []);
    this.populateFormAnalysis(currentStateAnalysis.forms || []);
    this.populateMessagingAnalysis(currentStateAnalysis.messaging);
    this.populateVisualHierarchy(currentStateAnalysis.visualHierarchy);
  }

  private populateHeadlineAnalysis(headlines: any[]): void {
    const container = document.getElementById('headline-analysis');
    if (!container) return;

    container.innerHTML = '';
    headlines.forEach((headline, index) => {
      const headlineElement = document.createElement('div');
      headlineElement.className = 'headline-item';

      headlineElement.innerHTML = `
        <div class="headline-header">
          <span class="headline-text">"${headline.text}"</span>
          <span class="effectiveness-score">${headline.effectiveness}/10</span>
        </div>
        <div class="headline-position">Position: ${headline.position}</div>
        <div class="headline-issues">
          <strong>Issues:</strong>
          <ul>${headline.issues.map((issue: string) => `<li>${issue}</li>`).join('')}</ul>
        </div>
        <div class="headline-improvements">
          <strong>Improvements:</strong>
          <ul>${headline.improvements.map((improvement: string) => `<li>${improvement}</li>`).join('')}</ul>
        </div>
        <div class="headline-psychology">
          <strong>Psychology Notes:</strong>
          <ul>${headline.psychologyNotes.map((note: string) => `<li>${note}</li>`).join('')}</ul>
        </div>
      `;

      container.appendChild(headlineElement);
    });
  }

  private populateCTAAnalysis(ctas: any[]): void {
    const container = document.getElementById('cta-analysis');
    if (!container) return;

    container.innerHTML = '';
    ctas.forEach((cta, index) => {
      const ctaElement = document.createElement('div');
      ctaElement.className = 'cta-item';

      ctaElement.innerHTML = `
        <div class="cta-header">
          <span class="cta-text">"${cta.text}"</span>
          <div class="cta-scores">
            <span class="score-badge">V: ${cta.visibility}/10</span>
            <span class="score-badge">E: ${cta.effectiveness}/10</span>
          </div>
        </div>
        <div class="cta-position">Position: ${cta.position}</div>
        <div class="cta-potential">Conversion Potential: ${cta.conversionPotential}</div>
        <div class="cta-issues">
          <strong>Issues:</strong>
          <ul>${cta.issues.map((issue: string) => `<li>${issue}</li>`).join('')}</ul>
        </div>
        <div class="cta-improvements">
          <strong>Improvements:</strong>
          <ul>${cta.improvements.map((improvement: string) => `<li>${improvement}</li>`).join('')}</ul>
        </div>
      `;

      container.appendChild(ctaElement);
    });
  }

  private populateFormAnalysis(forms: any[]): void {
    const container = document.getElementById('form-analysis');
    if (!container) return;

    container.innerHTML = '';
    forms.forEach((form, index) => {
      const formElement = document.createElement('div');
      formElement.className = 'form-item';

      const frictionClass = this.getFrictionClass(form.friction);
      
      formElement.innerHTML = `
        <div class="form-header">
          <span class="form-title">Form ${index + 1}</span>
          <span class="friction-badge ${frictionClass}">${form.friction} friction</span>
        </div>
        <div class="form-stats">
          <span>Fields: ${form.fieldCount}</span>
          <span>Required: ${form.requiredFields}</span>
        </div>
        ${form.abandonmentRisk ? `<div class="form-risk">Abandonment Risk: ${form.abandonmentRisk}</div>` : ''}
        <div class="form-optimizations">
          <strong>Optimizations:</strong>
          <ul>${form.optimizations.map((opt: string) => `<li>${opt}</li>`).join('')}</ul>
        </div>
      `;

      container.appendChild(formElement);
    });
  }

  private populateMessagingAnalysis(messaging: any): void {
    if (!messaging) return;
    
    this.setTextContent('clarity-score', `${messaging.clarity}/10`);
    this.setTextContent('persuasiveness-score', `${messaging.persuasiveness}/10`);
    this.setTextContent('benefits-score', `${messaging.benefitsFocus}/10`);
    this.setTextContent('emotional-score', `${messaging.emotionalAppeal}/10`);
    
    this.populateList('messaging-improvements', messaging.improvements || []);
  }

  private populateVisualHierarchy(visualHierarchy: any): void {
    if (!visualHierarchy) return;
    
    this.setTextContent('hierarchy-score', `${visualHierarchy.effectiveness}/10`);
    
    this.populateList('hierarchy-issues', visualHierarchy.issues || []);
    this.populateList('hierarchy-improvements', visualHierarchy.improvements || []);
  }

  private populateRecommendations(recommendations: any[]): void {
    const container = document.getElementById('professional-recommendations');
    if (!container) return;

    container.innerHTML = '';
    recommendations.forEach((rec, index) => {
      const recElement = document.createElement('div');
      recElement.className = 'recommendation-item';

      const priorityClass = this.getPriorityClass(rec.priority);
      const categoryClass = this.getCategoryClass(rec.category);
      
      recElement.innerHTML = `
        <div class="rec-header">
          <span class="rec-title">${rec.title}</span>
          <div class="rec-badges">
            <span class="priority-badge ${priorityClass}">${rec.priority}</span>
            <span class="category-badge ${categoryClass}">${rec.category}</span>
          </div>
        </div>
        <div class="rec-scores">
          <span class="impact-score">Impact: ${'★'.repeat(rec.impact)}</span>
          <span class="effort-score">Effort: ${'★'.repeat(rec.effort)}</span>
          <span class="timeline">${rec.timeline}</span>
        </div>
        <div class="rec-current">
          <strong>Current State:</strong> ${rec.currentState}
        </div>
        <div class="rec-proposed">
          <strong>Proposed Change:</strong> ${rec.proposedChange}
        </div>
        <div class="rec-implementation">
          <strong>Implementation:</strong>
          <ul>${rec.implementationDetails.map((detail: string) => `<li>${detail}</li>`).join('')}</ul>
        </div>
        <div class="rec-impact">
          <strong>Expected Impact:</strong>
          <div class="impact-details">
            <div>Conversion Lift: ${rec.expectedImpact.conversionLift}</div>
            <div>Revenue Impact: ${rec.expectedImpact.revenueImpact}</div>
            <div>UX Improvement: ${rec.expectedImpact.userExperience}</div>
          </div>
        </div>
        <div class="rec-psychology">
          <strong>Psychology Behind:</strong> ${rec.psychologyBehind}
        </div>
        <div class="rec-testing">
          <strong>Testing Approach:</strong> ${rec.testingApproach}
        </div>
      `;

      container.appendChild(recElement);
    });
  }

  private populateImplementationRoadmap(roadmap: any[]): void {
    const container = document.getElementById('implementation-roadmap');
    if (!container) return;

    container.innerHTML = '';
    roadmap.forEach((phase, index) => {
      const phaseElement = document.createElement('div');
      phaseElement.className = 'roadmap-phase';

      phaseElement.innerHTML = `
        <div class="phase-header">
          <span class="phase-number">Phase ${phase.phase}</span>
          <span class="phase-title">${phase.title}</span>
          <span class="phase-timeline">${phase.timeline}</span>
        </div>
        <div class="phase-description">${phase.description}</div>
        <div class="phase-tasks">
          <strong>Tasks:</strong>
          <ul>${phase.tasks.map((task: string) => `<li>${task}</li>`).join('')}</ul>
        </div>
        <div class="phase-resources">
          <strong>Resources:</strong> ${phase.resources.join(', ')}
        </div>
        <div class="phase-metrics">
          <strong>Success Metrics:</strong>
          <ul>${phase.successMetrics.map((metric: string) => `<li>${metric}</li>`).join('')}</ul>
        </div>
        <div class="phase-dependencies">
          <strong>Dependencies:</strong> ${phase.dependencies.join(', ')}
        </div>
      `;

      container.appendChild(phaseElement);
    });
  }

  private populatePsychologyInsights(insights: any[]): void {
    const container = document.getElementById('psychology-insights');
    if (!container) return;

    container.innerHTML = '';
    insights.forEach((insight, index) => {
      const insightElement = document.createElement('div');
      insightElement.className = 'psychology-insight';

      const applicationClass = this.getEffectivenessClass(insight.currentApplication);
      
      insightElement.innerHTML = `
        <div class="insight-header">
          <span class="insight-principle">${insight.principle}</span>
          <span class="application-badge ${applicationClass}">${insight.currentApplication}</span>
        </div>
        <div class="insight-opportunity">
          <strong>Opportunity:</strong> ${insight.opportunity}
        </div>
        <div class="insight-implementation">
          <strong>Implementation:</strong> ${insight.implementation}
        </div>
        <div class="insight-behavior">
          <strong>Expected Behavior Change:</strong> ${insight.expectedBehaviorChange}
        </div>
      `;

      container.appendChild(insightElement);
    });
  }

  private populateCompetitiveBenchmarks(benchmarks: any[]): void {
    const container = document.getElementById('competitive-benchmarks');
    if (!container) return;

    container.innerHTML = '';
    benchmarks.forEach((benchmark, index) => {
      const benchmarkElement = document.createElement('div');
      benchmarkElement.className = 'benchmark-item';

      benchmarkElement.innerHTML = `
        <div class="benchmark-header">
          <span class="benchmark-aspect">${benchmark.aspect}</span>
        </div>
        <div class="benchmark-comparison">
          <div class="benchmark-row">
            <strong>Industry Standard:</strong> ${benchmark.industryStandard}
          </div>
          <div class="benchmark-row">
            <strong>Current State:</strong> ${benchmark.currentState}
          </div>
          <div class="benchmark-row">
            <strong>Gap Analysis:</strong> ${benchmark.gapAnalysis}
          </div>
          <div class="benchmark-row">
            <strong>Recommendation:</strong> ${benchmark.recommendation}
          </div>
        </div>
      `;

      container.appendChild(benchmarkElement);
    });
  }

  // Helper methods for CSS classes
  private getEffectivenessClass(effectiveness: string): string {
    switch (effectiveness) {
      case 'strong': return 'status-strong';
      case 'moderate': return 'status-moderate';
      case 'weak': return 'status-weak';
      case 'missing': return 'status-missing';
      default: return 'status-neutral';
    }
  }

  private getImpactClass(impact: string): string {
    switch (impact) {
      case 'high': return 'impact-high';
      case 'medium': return 'impact-medium';
      case 'low': return 'impact-low';
      default: return 'impact-neutral';
    }
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

  private getFrictionClass(friction: string): string {
    switch (friction) {
      case 'high': return 'friction-high';
      case 'medium': return 'friction-medium';
      case 'low': return 'friction-low';
      default: return 'friction-neutral';
    }
  }

  private getUrgencyClass(level: string): string {
    switch (level) {
      case 'high': return 'urgency-high';
      case 'medium': return 'urgency-medium';
      case 'low': return 'urgency-low';
      case 'none': return 'urgency-none';
      default: return 'urgency-neutral';
    }
  }

  private getCategoryClass(category: string): string {
    return `category-${category}`;
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
        // OpenAI provider
        geminiNotice?.classList.add('hidden');
        
        // Check if OpenAI model supports vision
        const modelName = settings.openaiModel;
        const supportsVision = modelName.includes('gpt-4') || modelName.startsWith('gpt-5');
        
        if (supportsVision) {
          // Show visual analysis notice for vision-capable models
          openaiNotice?.classList.remove('hidden');
          openaiTextNotice?.classList.add('hidden');
        } else {
          // Show text-only notice for older models
          openaiNotice?.classList.add('hidden');
          openaiTextNotice?.classList.remove('hidden');
        }
      }
    } catch (error) {
      console.warn('Failed to update provider notice:', error);
    }
  }

  private handleVisualAnalysisLinkClick(): void {
    // Open options page to switch to Gemini
    chrome.runtime.openOptionsPage();
  }

  private showProgressTracking(show: boolean): void {
    const progressContainer = document.getElementById('screenshot-progress');
    if (progressContainer) {
      if (show) {
        progressContainer.classList.remove('hidden');
      } else {
        progressContainer.classList.add('hidden');
      }
    }
  }

  private updateProgress(current: number, total: number): void {
    const progressText = document.getElementById('progress-text');
    const progressCount = document.getElementById('progress-count');
    const progressFill = document.getElementById('progress-fill');

    if (progressText) {
      progressText.textContent = `Capturing screenshot ${current} of ${total}...`;
    }

    if (progressCount) {
      progressCount.textContent = `${current}/${total}`;
    }

    if (progressFill) {
      const percentage = total > 0 ? (current / total) * 100 : 0;
      progressFill.style.width = `${percentage}%`;
    }
  }
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
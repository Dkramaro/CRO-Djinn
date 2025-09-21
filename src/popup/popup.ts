import { StorageManager } from '../utils/storage';
import { LLMAnalyzer } from '../utils/llm';
import { generatePDF } from '../utils/pdf';
import { AnalysisState, LLMAnalysis, RawPageData } from '../types';

class PopupController {
  private state: AnalysisState = { status: 'idle' };
  private currentUrl: string = '';

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    // Get current tab URL
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.url) {
      this.currentUrl = tabs[0].url;
    }

    // Check for cached results
    await this.checkForCachedResults();

    // Update provider notice
    await this.updateProviderNotice();

    // Set up event listeners
    this.setupEventListeners();

    // Clean old cache on startup
    StorageManager.cleanOldCache();
  }

  private setupEventListeners(): void {
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
    await this.runAnalysis(false);
  }

  private async handleRerunClick(): Promise<void> {
    await this.runAnalysis(true);
  }

  private async runAnalysis(forceRefresh: boolean = false): Promise<void> {
    if (!this.currentUrl) {
      this.showError('Unable to analyze this page');
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
      // Step 1: Check API key
      const settings = await StorageManager.getSettings();
      const currentApiKey = settings.provider === 'gemini' ? settings.geminiApiKey : settings.openaiApiKey;
      if (!currentApiKey) {
        const providerName = settings.provider === 'gemini' ? 'Gemini' : 'OpenAI';
        this.showError(`${providerName} API key not configured. Please go to Options to set your API key.`);
        return;
      }

      // Step 2: Start scraping
      this.state = { status: 'scraping' };
      this.updateUI();
      
      // Update loading message based on provider
      if (settings.provider === 'gemini') {
        this.updateLoadingText('Capturing screenshot and scraping content...');
      }

      // Step 3: Scrape page content
      const scrapingResult = await this.sendMessageToContentScript({ action: 'scrapePage' });
      
      if (!scrapingResult.success) {
        throw new Error(scrapingResult.error || 'Failed to scrape page');
      }

      const rawData: RawPageData = scrapingResult.data;

      // Step 4: Analyze with LLM
      this.state = { status: 'analyzing' };
      this.updateUI();
      
      // Update analyzing message based on provider
      if (settings.provider === 'gemini') {
        this.updateLoadingText('Analyzing page with visual + content insights...');
      } else {
        this.updateLoadingText('Analyzing page content...');
      }

      const analyzer = new LLMAnalyzer(settings);
      const analysis = await analyzer.analyzeRawPageData(rawData);

      // Step 5: Cache results
      const modelName = settings.provider === 'gemini' ? settings.geminiModel : settings.openaiModel;
      await StorageManager.saveCachedAudit(this.currentUrl, analysis, rawData, modelName);

      // Step 6: Show results
      this.state = {
        status: 'ready',
        analysis,
        rawData,
        fromCache: false
      };
      this.updateUI();

    } catch (error) {
      console.error('Analysis failed:', error);
      this.showError(error instanceof Error ? error.message : 'Analysis failed');
    }
  }

  private async sendMessageToContentScript(message: any): Promise<any> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      throw new Error('No active tab found');
    }

    // Inject content script if needed
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ['content.js']
      });
    } catch (error) {
      // Content script might already be injected
    }

    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabs[0].id!, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  private updateUI(): void {
    this.hideAllStates();

    switch (this.state.status) {
      case 'idle':
        this.showState('initial-state');
        break;
      case 'scraping':
        this.showState('loading-state');
        this.updateLoadingText('Scraping page...');
        break;
      case 'analyzing':
        this.showState('loading-state');
        this.updateLoadingText('Analyzing with AI...');
        break;
      case 'ready':
        this.showState('results-state');
        this.populateResults();
        break;
      case 'error':
        this.showState('error-state');
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
      
      if (analysis.quickWins) {
        this.populateQuickWins(analysis.quickWins);
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
      this.setTextContent('business-type', pageSummary.businessType || 'Not specified');
      this.setTextContent('conversion-goal', pageSummary.primaryConversionGoal || 'Not specified');
      this.setTextContent('target-audience', pageSummary.targetAudience || 'Not specified');
      
      this.populateList('user-journey', pageSummary.currentUserJourney || []);
      this.populateList('key-strengths', pageSummary.keyStrengths || []);
      this.populateList('critical-weaknesses', pageSummary.criticalWeaknesses || []);
    } catch (error) {
      console.warn('Error populating page summary:', error);
    }
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

  private populateQuickWins(quickWins: any[]): void {
    const container = document.getElementById('quick-wins');
    if (!container) return;

    container.innerHTML = '';
    quickWins.forEach((win, index) => {
      const winElement = document.createElement('div');
      winElement.className = 'quick-win-card';

      const effortStars = '●'.repeat(win.effort);
      
      winElement.innerHTML = `
        <div class="win-header">
          <h4 class="win-title">${win.title}</h4>
          <div class="win-badges">
            <span class="effort-badge">Effort: ${effortStars}</span>
            <span class="timeline-badge">${win.timeline}</span>
          </div>
        </div>
        <div class="win-description">
          ${win.description}
        </div>
      `;

      container.appendChild(winElement);
    });
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
    this.setTextContent('cta-prominence', visualHierarchy.ctaProminence || 'Not assessed');
    
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
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
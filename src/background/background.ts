import { StorageManager } from '../utils/storage';
import { ExtensionSettings } from '../types';
import { ScreenshotCapture } from '../utils/screenshot';

type JobStatus = 'pending' | 'scraping' | 'analyzing' | 'completed' | 'failed';
type Job = { 
  id: string; 
  tabId?: number; 
  url: string; 
  createdAt: number; 
  status: JobStatus; 
  error?: string;
  progress?: string;
};

class AnalysisJobQueue {
  private queue: Job[] = [];
  private running = 0;
  private readonly MAX_CONCURRENT = 2;
  private readonly JOB_STORAGE_KEY = 'analysis_jobs';
  private offscreenCreated = false;
  private processingMessages = new Set<string>();

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    console.log('Background service worker initializing...');
    
    // Restore jobs from storage on startup
    await this.restoreJobsFromStorage();
    
    // Check for and process any pending fallback responses
    await this.processPendingFallbackResponses();
    
    // Start processing queue
    await this.tick();
    
    // Listen for new job requests
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });

    console.log('Background service worker initialized');
  }

  private async handleMessage(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void): Promise<void> {
    try {
      console.log('Background received message:', message.type);
      
      switch (message.type) {
        case 'PING':
          // Simple ping/pong to wake up service worker
          console.log('Received PING, responding with PONG');
          // Also check for any pending fallback responses when pinged
          this.processPendingFallbackResponses().catch(error => {
            console.warn('Failed to process fallback responses on ping:', error);
          });
          sendResponse({ success: true, pong: true });
          break;

        case 'START_ANALYSIS':
          const jobId = await this.enqueue({
            id: this.generateJobId(),
            tabId: message.tabId,
            url: message.url,
            createdAt: Date.now(),
            status: 'pending'
          });
          sendResponse({ success: true, jobId });
          break;

        case 'GET_JOB_STATUS':
          const job = await this.getJob(message.jobId);
          sendResponse({ success: true, job });
          break;

        case 'GET_ALL_JOBS':
          const jobs = await this.getAllJobs();
          sendResponse({ success: true, jobs });
          break;

        case 'CANCEL_JOB':
          await this.cancelJob(message.jobId);
          sendResponse({ success: true });
          break;

        default:
          console.warn('Unknown message type:', message.type);
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Background message handler error:', error);
      sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async enqueue(job: Job): Promise<string> {
    console.log(`Enqueueing job ${job.id} for ${job.url}`);
    
    // Check for duplicate requests in the last 10 seconds (increased from 5)
    const recentJobs = this.queue.filter(j => 
      j.url === job.url && 
      j.createdAt > Date.now() - 10000 && // Within last 10 seconds
      (j.status === 'pending' || j.status === 'scraping' || j.status === 'analyzing')
    );
    
    if (recentJobs.length > 0) {
      console.warn(`Duplicate request for ${job.url} within 10 seconds, returning existing job ID`);
      return recentJobs[0].id;
    }
    
    // Also check by tab ID to prevent multiple requests from same tab
    const activeJobsForTab = this.queue.filter(j => 
      j.tabId === job.tabId && 
      (j.status === 'pending' || j.status === 'scraping' || j.status === 'analyzing')
    );
    
    if (activeJobsForTab.length >= 1) {
      console.warn(`Tab ${job.tabId} already has ${activeJobsForTab.length} active jobs, cancelling older ones`);
      // Cancel older jobs for this tab and URL combo
      for (const oldJob of activeJobsForTab) {
        console.log(`Cancelling older job ${oldJob.id} for tab ${job.tabId}`);
        oldJob.status = 'failed';
        oldJob.error = 'Cancelled due to new analysis request';
        oldJob.progress = 'Cancelled';
        await this.saveJob(oldJob);
        
        // Also mark as cancelled in processing messages
        this.processingMessages.delete(`analysis_${oldJob.id}_${Math.random().toString(36).substr(2, 9)}`);
      }
    }
    
    // Clean up old completed/failed jobs to prevent memory leaks
    this.cleanupOldJobs();
    
    this.queue.push(job);
    await this.saveJob(job);
    await this.tick();
    await this.updateBadge();
    return job.id;
  }

  private async tick(): Promise<void> {
    while (this.running < this.MAX_CONCURRENT && this.queue.some(j => j.status === 'pending')) {
      const job = this.queue.find(j => j.status === 'pending')!;
      this.running++;
      console.log(`Starting job ${job.id}, running count: ${this.running}`);
      
      // Don't decrement here - let runJob handle it in its finally block
      this.runJob(job).finally(() => { 
        // Only call tick again if there are pending jobs and we're not at max capacity
        if (this.running < this.MAX_CONCURRENT && this.queue.some(j => j.status === 'pending')) {
          console.log('Job finished, checking for more pending jobs...');
          this.tick(); 
        } else {
          console.log('No more pending jobs or at max capacity, tick stopping');
        }
      });
    }
  }

  private async runJob(job: Job): Promise<void> {
    console.log(`Starting job ${job.id} for ${job.url}`);
    
    try {
      // Check if job was cancelled before starting
      if (job.status === 'failed') {
        console.log(`Job ${job.id} was already cancelled, skipping`);
        return;
      }
      
      // Validate URL before proceeding
      if (!this.isValidAnalysisUrl(job.url)) {
        job.status = 'failed';
        job.error = `Cannot analyze this type of URL: ${job.url}. Please navigate to a regular website (http/https) to use CRO Genie.`;
        job.progress = 'URL not supported';
        await this.saveJob(job);
        console.log(`Job ${job.id} failed: Invalid URL type`);
        return;
      }
      
      // Ensure offscreen document exists
      await this.ensureOffscreen();

      // Step 1: Scrape page data
      job.status = 'scraping';
      job.progress = 'Scraping page content...';
      await this.saveJob(job);

      const pageData = await this.scrapePage(job.tabId!);
      
      // Check if job was cancelled during scraping
      if (this.isJobCancelled(job.id)) {
        console.log(`Job ${job.id} was cancelled during scraping`);
        return;
      }
      
      // Step 2: Capture screenshots if needed
      let screenshots: string[] = [];
      const settings = await StorageManager.getSettings();
      const useFullPage = settings.fullPageScreenshot || false;
      
      console.log('Screenshot capture check:', {
        provider: settings.provider,
        model: settings.openaiModel || settings.geminiModel,
        useFullPage,
        shouldCapture: settings.provider === 'gemini' || (settings.provider === 'openai' && (settings.openaiModel.includes('gpt-4') || settings.openaiModel.startsWith('gpt-5')))
      });
      
      // Always try to capture screenshots for visual analysis (both providers support it)
      job.status = 'analyzing';
      job.progress = 'Capturing screenshots...';
      await this.saveJob(job);
      
      // Ensure tab is active before screenshot capture
      await this.ensureTabIsActive(job.tabId!);
      
      try {
        // Check permission before screenshot capture
        if (!(await this.checkPermissions())) {
          throw new Error('Extension permissions not available. Please click the extension icon to activate.');
        }
        
        // Double-check URL validity before screenshot capture
        if (!this.isValidAnalysisUrl(job.url)) {
          throw new Error(`Cannot capture screenshots for this URL type: ${job.url}. Please navigate to a regular website.`);
        }
        
        if (useFullPage) {
          console.log('Starting full-page screenshot capture...');
          // Notify popup about screenshot progress
          await this.notifyPopupScreenshotProgress(job.tabId!, 'Starting full-page screenshot capture...');
          
          // Ensure tab is active before starting
          await this.ensureTabIsActive(job.tabId!);
          
          // Use the proper ScreenshotCapture utility for intelligent full-page capture
          const screenshotResult = await ScreenshotCapture.captureFullPage({
            maxScreenshots: 20, // Increased limit for longer pages
            scrollDelay: 800, // Match our rate limiting
            progressCallback: (current, total) => {
              // Check if job was cancelled during screenshot capture
              if (this.isJobCancelled(job.id)) {
                throw new Error('Job cancelled during screenshot capture');
              }
              job.progress = `Capturing screenshot ${current}/${total}... Please don't switch tabs!`;
              this.saveJob(job); // Update progress
              // Notify popup of progress
              this.notifyPopupScreenshotProgress(job.tabId!, `Capturing screenshot ${current}/${total}... Please don't switch tabs!`);
            }
          });
          
          screenshots = screenshotResult.screenshots;
          console.log(`Captured ${screenshots.length} full-page screenshots`);
          console.log(`Total size: ${Math.round(screenshotResult.totalSize / 1024 / 1024)}MB`);
          console.log('First screenshot preview:', screenshots[0]?.substring(0, 100) + '...');
          
          // Clear popup notification
          await this.clearPopupScreenshotNotification(job.tabId!);
        } else {
          console.log('Starting single screenshot capture...');
          await this.notifyPopupScreenshotProgress(job.tabId!, 'Capturing screenshot...');
          const screenshot = await this.captureSingleScreenshot(job.tabId!);
          screenshots = [screenshot];
          console.log('Captured single screenshot, length:', screenshot.length);
          console.log('Screenshot preview:', screenshot.substring(0, 100) + '...');
          await this.clearPopupScreenshotNotification(job.tabId!);
        }
      } catch (screenshotError) {
        console.error('Screenshot capture failed, continuing with text-only analysis:', screenshotError);
        console.error('Screenshot error details:', {
          name: screenshotError.name,
          message: screenshotError.message,
          stack: screenshotError.stack
        });
        
        // Check if this is a URL restriction error
        if (screenshotError instanceof Error && 
            (screenshotError.message.includes('chrome://') || 
             screenshotError.message.includes('Cannot access') ||
             screenshotError.message.includes('restricted'))) {
          console.log('Detected restricted URL error, skipping analysis entirely');
          job.status = 'failed';
          job.error = `Cannot analyze this type of URL: ${job.url}. Please navigate to a regular website (http/https) to use CRO Genie.`;
          job.progress = 'URL not supported';
          await this.saveJob(job);
          await this.clearTabNotification(job.tabId!);
          return;
        }
        
        screenshots = [];
        // Clear any popup notifications
        await this.clearPopupScreenshotNotification(job.tabId!);
      }

      // Check if job was cancelled before LLM analysis
      if (this.isJobCancelled(job.id)) {
        console.log(`Job ${job.id} was cancelled before LLM analysis`);
        return;
      }

      // Step 3: Run LLM analysis
      job.status = 'analyzing';
      job.progress = 'Analyzing with AI...';
      await this.saveJob(job);

      console.log('Sending to LLM analysis:', {
        screenshotCount: screenshots.length,
        screenshotSizes: screenshots.map(s => s.length),
        provider: settings.provider,
        model: settings.openaiModel || settings.geminiModel
      });
      
      const result = await this.runLLMAnalysis(pageData, job.url, settings, screenshots);

      // Check if job was cancelled after LLM analysis
      if (this.isJobCancelled(job.id)) {
        console.log(`Job ${job.id} was cancelled after LLM analysis`);
        return;
      }

      // Step 4: Cache results
      await StorageManager.saveCachedAudit(job.url, result, pageData, settings.openaiModel || settings.geminiModel);
      
      job.status = 'completed';
      job.progress = 'Analysis complete!';
      await this.saveJob(job);

      // Send notification
      await this.sendNotification(job);

      console.log(`Job ${job.id} completed successfully - ready for removal from queue`);

    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error occurred';
      job.progress = 'Analysis failed';
      await this.saveJob(job);
      
      // Clear any lingering popup notifications
      if (job.tabId) {
        await this.clearPopupScreenshotNotification(job.tabId);
      }
    } finally {
      // CRITICAL: Always decrement running counter (only place it should be decremented)
      this.running = Math.max(0, this.running - 1);
      await this.updateBadge();
      console.log(`Job ${job.id} finished, running jobs now: ${this.running}`);
      
      // Remove completed/failed jobs from queue to prevent reprocessing
      if (job.status === 'completed' || job.status === 'failed') {
        const jobIndex = this.queue.findIndex(j => j.id === job.id);
        if (jobIndex > -1) {
          this.queue.splice(jobIndex, 1);
          console.log(`Removed completed job ${job.id} from queue`);
        }
        
        // Also clean up any fallback responses for this job
        try {
          const keys = await chrome.storage.local.get();
          for (const key of Object.keys(keys)) {
            if (key.startsWith('offscreen_response_') && key.includes(job.id.split('_')[1])) {
              chrome.storage.local.remove(key);
              console.log(`Cleaned up fallback response: ${key}`);
            }
          }
        } catch (error) {
          console.warn('Failed to clean up fallback responses:', error);
        }
      }
    }
  }

  private async ensureOffscreen(): Promise<void> {
    try {
      // Check if one already exists
      const existing = await chrome.offscreen?.hasDocument?.();
      if (existing) {
        this.offscreenCreated = true;
        console.log('Offscreen document already exists');
        return;
      }

      // Reset flag if document doesn't exist
      this.offscreenCreated = false;

      // Create new offscreen document
      await chrome.offscreen.createDocument({
        url: 'src/offscreen/offscreen.html',
        reasons: ['BLOBS', 'DOM_PARSER'],
        justification: 'Run long LLM calls and image processing without popup dependency'
      });
      
      this.offscreenCreated = true;
      console.log('Offscreen document created successfully');
      
      // Wait a bit for the document to fully initialize
      await this.delay(500);
      
    } catch (error) {
      // If error is about single document limit, it means one already exists
      if (error instanceof Error && error.message.includes('single offscreen document')) {
        console.log('Offscreen document already exists (caught from error), using existing one');
        this.offscreenCreated = true;
        return;
      }
      
      console.error('Failed to create offscreen document:', error);
      // Don't throw the error - let the calling code handle offscreen unavailability
      console.warn('Continuing without offscreen document - LLM analysis may fail');
    }
  }

  private async scrapePage(tabId: number): Promise<any> {
    console.log(`Scraping page for tab ${tabId}`);
    
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Enhanced scraping function
        const getElementInfo = (el: Element) => {
          const rect = el.getBoundingClientRect();
          const styles = window.getComputedStyle(el);
          
          return {
            tag: el.tagName.toLowerCase(),
            text: el.textContent?.trim() || '',
            classes: el.className,
            id: el.id,
            href: (el as HTMLAnchorElement).href,
            src: (el as HTMLImageElement).src,
            alt: (el as HTMLImageElement).alt,
            type: (el as HTMLInputElement).type,
            placeholder: (el as HTMLInputElement).placeholder,
            value: (el as HTMLInputElement).value,
            checked: (el as HTMLInputElement).checked,
            required: (el as HTMLInputElement).required,
            action: (el as HTMLFormElement).action,
            method: (el as HTMLFormElement).method,
            position: {
              top: rect.top + window.scrollY,
              left: rect.left + window.scrollX,
              width: rect.width,
              height: rect.height
            },
            styles: {
              fontSize: styles.fontSize,
              fontWeight: styles.fontWeight,
              backgroundColor: styles.backgroundColor,
              color: styles.color
            }
          };
        };

        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(getElementInfo);
        const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a[role="button"]')).map(getElementInfo);
        const forms = Array.from(document.querySelectorAll('form')).map((form) => {
          const formInfo = getElementInfo(form);
          const inputs = Array.from(form.querySelectorAll('input, select, textarea'));
          return {
            ...formInfo,
            totalFields: inputs.length,
            requiredFields: inputs.filter(input => (input as HTMLInputElement).required).length
          };
        });
        const links = Array.from(document.querySelectorAll('a[href]')).map(getElementInfo);
        const lists = Array.from(document.querySelectorAll('ul, ol')).map((list) => {
          const listInfo = getElementInfo(list);
          const items = Array.from(list.querySelectorAll('li')).map(li => li.textContent?.trim() || '');
          return {
            ...listInfo,
            itemCount: items.length,
            items: items.slice(0, 10) // Limit items
          };
        });
        const sections = Array.from(document.querySelectorAll('section, div[class*="section"], div[id*="section"]')).map((section) => {
          const sectionInfo = getElementInfo(section);
          return {
            ...sectionInfo,
            textPreview: section.textContent?.substring(0, 200) || ''
          };
        });

        return {
          title: document.title,
          url: location.href,
          metaDescription: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
          fullTextContent: document.body.textContent || '', // Full text content for comprehensive analysis
          pageMetadata: {
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
              scrollHeight: document.documentElement.scrollHeight
            },
            viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute('content') || ''
          },
          structuredContent: {
            headings: headings.slice(0, 20),
            buttons: buttons.slice(0, 15),
            forms,
            links: links.slice(0, 50),
            lists: lists.slice(0, 10),
            sections: sections.slice(0, 10)
          }
        };
      }
    });

    console.log('Page scraping completed');
    return result[0].result;
  }

  private async runLLMAnalysis(pageData: any, url: string, settings: ExtensionSettings, screenshots: string[] = []): Promise<any> {
    console.log('Starting LLM analysis via offscreen document');
    
    // Ensure offscreen document is available before sending
    await this.ensureOffscreen();
    
    // Start keep-alive mechanism to prevent service worker from going idle
    const keepAliveInterval = this.startKeepAlive();
    
    // Send to offscreen document for LLM processing with better error handling
    return new Promise((resolve, reject) => {
      const messageId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      let messageListener: ((response: any) => void) | null = null;
      let timeoutId: NodeJS.Timeout | null = null;
      
      const cleanup = () => {
        if (messageListener) {
          chrome.runtime.onMessage.removeListener(messageListener);
          messageListener = null;
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        // Clean up processing message tracking
        this.processingMessages.delete(messageId);
        // Stop keep-alive mechanism
        this.stopKeepAlive(keepAliveInterval);
      };

      messageListener = (response: any) => {
        if (response?.messageId === messageId) {
          cleanup();
          if (response.success) {
            console.log('LLM analysis completed successfully');
            resolve(response.data);
          } else {
            console.error('LLM analysis failed:', response.error);
            reject(new Error(response.error || 'Unknown LLM analysis error'));
          }
        }
      };

      chrome.runtime.onMessage.addListener(messageListener);

      // Send message to offscreen document with retry logic
      const sendMessage = async (attempts = 3) => {
        // Check if this message is already being processed
        if (this.processingMessages.has(messageId)) {
          console.warn('Message already being processed, ignoring duplicate:', messageId);
          cleanup();
          reject(new Error('Duplicate message detected'));
          return;
        }
        
        // Mark message as being processed
        this.processingMessages.add(messageId);
        console.log('Marked message as processing:', messageId);
        
        for (let i = 0; i < attempts; i++) {
          try {
            const messagePayload = {
              type: 'OFFSCREEN_ANALYZE',
              messageId,
              payload: { pageData, url, settings, screenshots }
            };
            
            // Log message size to debug truncation issues
            const messageSize = JSON.stringify(messagePayload).length;
            console.log(`Message size: ${messageSize} bytes (${Math.round(messageSize / 1024)}KB)`);
            console.log(`Page content size: ${pageData.fullTextContent?.length || 0} characters`);
            console.log(`Screenshots count: ${screenshots.length}, total size: ${screenshots.reduce((sum, s) => sum + s.length, 0)} bytes`);
            
            // Check if message is too large (Chrome limit is ~1MB)
            if (messageSize > 900000) { // 900KB safety margin
              console.warn('Message size exceeds safe limit, implementing chunking...');
              await this.sendLargeMessage(messagePayload, messageId);
            } else {
              await chrome.runtime.sendMessage(messagePayload);
            }
            console.log(`Message sent successfully (attempt ${i + 1})`);
            break;
          } catch (error) {
            console.warn(`Message send attempt ${i + 1} failed:`, error);
            if (i === attempts - 1) {
              cleanup();
              reject(new Error(`Failed to send message to offscreen document after ${attempts} attempts: ${error}`));
              return;
            }
            // Wait before retry
            await this.delay(1000 * (i + 1));
            // Re-ensure offscreen document exists
            await this.ensureOffscreen();
          }
        }
      };

      sendMessage();

      // Check for fallback response in storage after timeout
      timeoutId = setTimeout(async () => {
        console.log('Checking for fallback response in storage...');
        try {
          const fallbackKey = `offscreen_response_${messageId}`;
          const result = await chrome.storage.local.get(fallbackKey);
          const fallbackResponse = result[fallbackKey];
          
          if (fallbackResponse && fallbackResponse.fallback) {
            console.log('Found fallback response, using it');
            cleanup();
            
            // Clean up the fallback response
            chrome.storage.local.remove(fallbackKey);
            
            if (fallbackResponse.success) {
              resolve(fallbackResponse.data);
            } else {
              reject(new Error(fallbackResponse.error));
            }
            return;
          }
        } catch (storageError) {
          console.error('Failed to check fallback storage:', storageError);
        }
        
        cleanup();
        reject(new Error('Analysis timeout after 5 minutes'));
      }, 5 * 60 * 1000);
    });
  }

  private async sendNotification(job: Job): Promise<void> {
    try {
      await chrome.notifications.create(job.id, {
        type: 'basic',
        title: 'CRO Analysis Complete',
        message: `Analysis completed for ${new URL(job.url).hostname}`,
        iconUrl: 'icons/CRO-Genie Logo.png'
      });
      console.log(`Notification sent for job ${job.id}`);
    } catch (error) {
      console.warn('Failed to send notification:', error);
    }
  }

  private async updateBadge(): Promise<void> {
    const activeJobs = this.queue.filter(j => j.status === 'pending' || j.status === 'scraping' || j.status === 'analyzing');
    const badgeText = activeJobs.length > 0 ? activeJobs.length.toString() : '';
    
    try {
      await chrome.action.setBadgeText({ text: badgeText });
      await chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
      console.log(`Badge updated: ${badgeText}`);
    } catch (error) {
      console.warn('Failed to update badge:', error);
    }
  }

  private async saveJob(job: Job): Promise<void> {
    await chrome.storage.local.set({ [`${this.JOB_STORAGE_KEY}_${job.id}`]: job });
    console.log(`Job ${job.id} saved with status: ${job.status}`);
  }

  private async getJob(jobId: string): Promise<Job | null> {
    const result = await chrome.storage.local.get(`${this.JOB_STORAGE_KEY}_${jobId}`);
    return result[`${this.JOB_STORAGE_KEY}_${jobId}`] || null;
  }

  private async getAllJobs(): Promise<Job[]> {
    const allData = await chrome.storage.local.get();
    const jobs: Job[] = [];
    
    for (const [key, value] of Object.entries(allData)) {
      if (key.startsWith(this.JOB_STORAGE_KEY)) {
        jobs.push(value as Job);
      }
    }
    
    return jobs.sort((a, b) => b.createdAt - a.createdAt);
  }

  private async cancelJob(jobId: string): Promise<void> {
    const job = this.queue.find(j => j.id === jobId);
    if (job && (job.status === 'pending' || job.status === 'scraping' || job.status === 'analyzing')) {
      job.status = 'failed';
      job.error = 'Cancelled by user';
      await this.saveJob(job);
      await this.updateBadge();
      console.log(`Job ${jobId} cancelled`);
    }
  }

  private async restoreJobsFromStorage(): Promise<void> {
    const jobs = await this.getAllJobs();
    this.queue = jobs;
    
    // Resume any pending jobs
    const pendingJobs = jobs.filter(j => j.status === 'pending' || j.status === 'scraping' || j.status === 'analyzing');
    if (pendingJobs.length > 0) {
      console.log(`Restoring ${pendingJobs.length} pending jobs`);
      // Reset analyzing jobs to pending since they were interrupted
      for (const job of pendingJobs) {
        if (job.status === 'analyzing' || job.status === 'scraping') {
          job.status = 'pending';
          job.progress = 'Resuming analysis...';
          await this.saveJob(job);
        }
      }
    }
    
    await this.updateBadge();
  }

  private async captureSingleScreenshot(tabId: number): Promise<string> {
    // Get tab info to get window ID
    const tab = await chrome.tabs.get(tabId);
    const windowId = tab.windowId;

    // Capture screenshot with retry logic for quota limits
    const dataUrl = await this.captureWithRetry(windowId, 3);
    if (!dataUrl) {
      throw new Error('Failed to capture screenshot after retries');
    }

    // Remove the data:image/png;base64, prefix to get just the base64 data
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    
    // Compression needs to happen in a context with DOM access (content script or offscreen)
    // For now, return uncompressed but log the size
    const originalSize = Math.floor(base64Data.length * 0.75);
    console.log(`Single screenshot captured: ${Math.round(originalSize / 1024)}KB (uncompressed - compression will happen in offscreen context)`);
    
    return base64Data;
  }


  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Capture screenshot with retry logic for quota limits
   */
  private async captureWithRetry(windowId: number, maxRetries: number = 3): Promise<string | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
          format: 'png',
          quality: 85
        });
        return dataUrl;
      } catch (error) {
        console.warn(`Screenshot capture attempt ${attempt} failed:`, error);
        
        if (error instanceof Error && error.message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
          // Wait exponentially longer for quota errors
          const waitTime = 2000 * Math.pow(2, attempt - 1); // 2s, 4s, 8s
          console.log(`Quota exceeded, waiting ${waitTime}ms before retry ${attempt}/${maxRetries}`);
          await this.delay(waitTime);
          
          if (attempt === maxRetries) {
            console.error('Max retries reached for screenshot capture, giving up');
            return null;
          }
        } else {
          // For other errors, fail immediately
          console.error('Non-quota error in screenshot capture:', error);
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Ensure the target tab is active before screenshot capture
   */
  private async ensureTabIsActive(tabId: number): Promise<void> {
    try {
      // Get the tab and make it active
      const tab = await chrome.tabs.get(tabId);
      
      // Switch to the tab's window first
      await chrome.windows.update(tab.windowId, { focused: true });
      
      // Then activate the specific tab
      await chrome.tabs.update(tabId, { active: true });
      
      // Wait a bit for the tab to fully activate
      await this.delay(500);
      
      console.log(`Tab ${tabId} is now active for screenshot capture`);
    } catch (error) {
      console.warn('Failed to activate tab for screenshot capture:', error);
      // Don't throw - let screenshot capture attempt and handle its own errors
    }
  }

  /**
   * Send screenshot progress notification to popup
   */
  private async notifyPopupScreenshotProgress(tabId: number, message: string): Promise<void> {
    try {
      // Send message to popup if it's open
      await chrome.runtime.sendMessage({
        type: 'SCREENSHOT_PROGRESS',
        message: message,
        tabId: tabId
      });
      console.log('Screenshot progress sent to popup:', message);
    } catch (error) {
      // Popup might not be open, that's okay
      console.log('Popup not available for screenshot progress notification');
    }
  }

  /**
   * Clear screenshot progress notification from popup
   */
  private async clearPopupScreenshotNotification(tabId: number): Promise<void> {
    try {
      await chrome.runtime.sendMessage({
        type: 'SCREENSHOT_PROGRESS_CLEAR',
        tabId: tabId
      });
      console.log('Screenshot progress cleared from popup');
    } catch (error) {
      // Popup might not be open, that's okay
      console.log('Popup not available for clearing screenshot progress');
    }
  }

  /**
   * Check if a job has been cancelled
   */
  private isJobCancelled(jobId: string): boolean {
    const job = this.queue.find(j => j.id === jobId);
    return job?.status === 'failed' && job?.error?.includes('Cancelled');
  }

  /**
   * Check extension permissions
   */
  private async checkPermissions(): Promise<boolean> {
    try {
      // Check if we have activeTab permission
      const hasPermission = await chrome.permissions.contains({
        permissions: ['activeTab', 'scripting']
      });
      
      if (!hasPermission) {
        console.warn('Extension permissions not available');
        return false;
      }
      
      return true;
    } catch (error) {
      console.warn('Permission check failed:', error);
      return false;
    }
  }

  /**
   * Clean up old jobs and processing messages to prevent memory leaks
   */
  private cleanupOldJobs(): void {
    // Clean up old processing messages (keep only recent ones)
    if (this.processingMessages.size > 20) {
      const messagesArray = Array.from(this.processingMessages);
      const toRemove = messagesArray.slice(0, messagesArray.length - 20);
      toRemove.forEach(id => this.processingMessages.delete(id));
      console.log(`Cleaned up ${toRemove.length} old processing messages`);
    }
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    
    // Remove old jobs from memory (keep only recent jobs or currently active ones)
    const originalLength = this.queue.length;
    this.queue = this.queue.filter(job => {
      const isRecent = job.createdAt > cutoffTime;
      const isActive = job.status === 'pending' || job.status === 'scraping' || job.status === 'analyzing';
      const shouldKeep = isRecent || isActive;
      
      if (!shouldKeep) {
        console.log(`Cleaning up old job: ${job.id} (status: ${job.status}, age: ${Math.round((Date.now() - job.createdAt) / 1000 / 60)} minutes)`);
      }
      
      return shouldKeep;
    });
    
    if (this.queue.length < originalLength) {
      console.log(`Cleaned up ${originalLength - this.queue.length} old jobs from memory`);
    }
  }

  /**
   * Start keep-alive mechanism to prevent service worker from going idle during long operations
   */
  private startKeepAlive(): NodeJS.Timeout {
    console.log('Starting keep-alive mechanism for background service worker');
    
    // Ping every 20 seconds to keep service worker alive (Chrome idles after ~30 seconds)
    const interval = setInterval(async () => {
      try {
        // Perform a lightweight operation to keep the service worker active
        await chrome.storage.local.get('keep_alive');
        console.log('Keep-alive ping sent');
      } catch (error) {
        console.warn('Keep-alive ping failed:', error);
      }
    }, 20000); // 20 seconds
    
    return interval;
  }

  /**
   * Stop keep-alive mechanism
   */
  private stopKeepAlive(interval: NodeJS.Timeout): void {
    if (interval) {
      clearInterval(interval);
      console.log('Keep-alive mechanism stopped');
    }
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
        console.log(`URL blocked - restricted protocol: ${urlObj.protocol}`);
        return false;
      }
      
      // Only allow http and https
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        console.log(`URL blocked - unsupported protocol: ${urlObj.protocol}`);
        return false;
      }
      
      // Block localhost/private IPs (optional - you might want to allow these)
      if (urlObj.hostname === 'localhost' || 
          urlObj.hostname === '127.0.0.1' || 
          urlObj.hostname.startsWith('192.168.') ||
          urlObj.hostname.startsWith('10.') ||
          urlObj.hostname.startsWith('172.')) {
        console.log(`URL blocked - local/private IP: ${urlObj.hostname}`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.log(`URL validation failed: ${error}`);
      return false;
    }
  }

  /**
   * Send large messages by optimizing content before sending
   */
  private async sendLargeMessage(messagePayload: any, messageId: string): Promise<void> {
    console.log('Implementing large message optimization...');
    
    // Optimize the page content if it's too large, but be more generous with limits
    const maxContentSize = 200000; // Increased to 200KB limit for content
    const content = messagePayload.payload.pageData.fullTextContent || '';
    
    console.log(`Original content size: ${content.length} characters (${Math.round(content.length/1000)}KB)`);
    
    if (content.length > maxContentSize) {
      console.log(`Content size (${content.length}) exceeds limit (${maxContentSize}), optimizing content...`);
      
      // Instead of simple truncation, extract key content sections
      const optimizedContent = this.optimizePageContent(content, maxContentSize);
      
      // Update the payload with optimized content
      messagePayload.payload.pageData.fullTextContent = optimizedContent;
      console.log(`Content optimized from ${content.length} to ${optimizedContent.length} characters`);
    } else {
      console.log('Content size is within limits, no optimization needed');
    }
    
    // Now send the (potentially optimized) message normally
    await chrome.runtime.sendMessage(messagePayload);
    console.log('Large message sent with content optimization applied');
  }

  /**
   * Optimize page content by extracting key sections rather than simple truncation
   */
  private optimizePageContent(content: string, maxSize: number): string {
    console.log('Optimizing page content by extracting key sections...');
    
    // If content is small enough, return as-is
    if (content.length <= maxSize) {
      return content;
    }
    
    // Calculate how much content we can keep
    const keepRatio = maxSize / content.length;
    const sectionsToKeep = Math.max(0.7, keepRatio); // Keep at least 70% if possible
    
    // Try to extract meaningful sections (paragraphs, headings, etc.)
    const lines = content.split('\n');
    const importantLines: string[] = [];
    let currentSize = 0;
    
    // First pass: Keep headings, important text, and form-related content
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines initially to save space
      if (!trimmedLine) continue;
      
      // Prioritize important content
      const isImportant = (
        trimmedLine.length > 10 && (
          // Headings and titles
          /^[A-Z][^.!?]*[.!?]?\s*$/.test(trimmedLine) ||
          // Call-to-action text
          /\b(buy|purchase|order|sign up|subscribe|register|download|learn more|get started|contact|call|click)\b/i.test(trimmedLine) ||
          // Form labels and important info
          /\b(email|phone|name|address|required|optional|terms|privacy|policy)\b/i.test(trimmedLine) ||
          // Navigation and important links
          /\b(home|about|contact|services|products|pricing|login|register)\b/i.test(trimmedLine) ||
          // Key business information
          /\b(price|cost|\$|guarantee|warranty|support|help|faq)\b/i.test(trimmedLine)
        )
      );
      
      const lineSize = line.length + 1; // +1 for newline
      
      if (isImportant || currentSize + lineSize < maxSize * sectionsToKeep) {
        importantLines.push(line);
        currentSize += lineSize;
        
        if (currentSize >= maxSize) break;
      }
    }
    
    // If we still have room, add more content from the beginning
    if (currentSize < maxSize * 0.9) {
      const remainingSpace = maxSize - currentSize - 200; // Leave space for truncation note
      
      for (const line of lines) {
        if (importantLines.includes(line)) continue;
        
        const lineSize = line.length + 1;
        if (currentSize + lineSize < remainingSpace) {
          importantLines.push(line);
          currentSize += lineSize;
        } else {
          break;
        }
      }
    }
    
    // Reconstruct content maintaining original structure as much as possible
    const optimizedContent = importantLines.join('\n');
    
    // Add optimization note
    const finalContent = optimizedContent + 
      `\n\n[CONTENT OPTIMIZED: This analysis uses ${Math.round(optimizedContent.length/1000)}KB of key content extracted from ${Math.round(content.length/1000)}KB total. Focus on high-value sections including headings, CTAs, forms, and navigation.]`;
    
    console.log(`Content optimization complete: ${content.length} → ${finalContent.length} characters (${Math.round((1 - finalContent.length/content.length) * 100)}% reduction)`);
    
    return finalContent;
  }

  /**
   * Process pending fallback responses from offscreen document
   */
  private async processPendingFallbackResponses(): Promise<void> {
    try {
      console.log('Checking for pending fallback responses...');
      
      const pendingKey = 'offscreen_pending_responses';
      const result = await chrome.storage.local.get(pendingKey);
      const pendingResponses = result[pendingKey] || [];
      
      if (pendingResponses.length === 0) {
        console.log('No pending fallback responses found');
        return;
      }
      
      console.log(`Found ${pendingResponses.length} pending fallback responses`);
      
      for (const pending of pendingResponses) {
        try {
          // Get the actual fallback response data
          const responseData = await chrome.storage.local.get(pending.key);
          const fallbackResponse = responseData[pending.key];
          
          if (!fallbackResponse) {
            console.warn(`Fallback response not found for key: ${pending.key}`);
            continue;
          }
          
          console.log(`Processing fallback response: ${pending.messageId}`);
          
          // Find the corresponding job by looking for the message ID pattern
          const messageIdParts = pending.messageId.split('_');
          if (messageIdParts.length >= 2) {
            const jobIdPattern = messageIdParts[1]; // Extract timestamp part
            const job = this.queue.find(j => j.id.includes(jobIdPattern));
            
            if (job && job.status === 'analyzing') {
              console.log(`Found matching job ${job.id} for fallback response`);
              
              if (fallbackResponse.success) {
                // Handle successful analysis
                await StorageManager.saveCachedAudit(job.url, fallbackResponse.data, null, 'LLM Analysis');
                job.status = 'completed';
                job.progress = 'Analysis complete (recovered from fallback)!';
                await this.sendNotification(job);
              } else {
                // Handle failed analysis
                job.status = 'failed';
                job.error = fallbackResponse.error || 'Analysis failed (recovered from fallback)';
                job.progress = 'Analysis failed';
              }
              
              await this.saveJob(job);
              console.log(`Job ${job.id} updated from fallback response`);
            }
          }
          
          // Clean up the fallback response
          await chrome.storage.local.remove(pending.key);
          
        } catch (error) {
          console.error(`Failed to process fallback response ${pending.key}:`, error);
        }
      }
      
      // Clear the pending responses list
      await chrome.storage.local.remove(pendingKey);
      console.log('Pending fallback responses processed and cleared');
      
    } catch (error) {
      console.error('Failed to process pending fallback responses:', error);
    }
  }
}

// Initialize the job queue
console.log('Initializing background service worker...');
new AnalysisJobQueue();

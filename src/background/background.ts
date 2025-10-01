/**
 * Background Service Worker - Simple Message Router
 * NEVER holds long-running operations or response channels
 * Offscreen owns the work, popup only reads storage
 */

import { ScreenshotCapture } from '../utils/screenshot';
import { NotificationManager } from '../utils/notifications';
import { DEBUG, safeLog } from '../config/debug';

console.log('Background service worker initializing...');

// Initialize notification handlers and clear any stale notifications
NotificationManager.setupNotificationHandlers();
NotificationManager.clearAllNotifications();

// Listen for storage changes to update notifications based on job progress
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    for (const [key, change] of Object.entries(changes)) {
      if (key.startsWith('job:') && change.newValue) {
        handleJobStateChange(key, change.newValue);
      }
    }
  }
});
    
// Message handler - immediate acknowledgment only
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log(`[BG] Received message: ${msg?.type}`);
  
  if (msg?.type === "START_ANALYSIS") {
    handleStartAnalysis(msg, sendResponse);
    return true;
  }
  
  if (msg?.type === "GET_STATUS") {
    handleGetStatus(msg, sendResponse);
    return true;
  }
  
  // Storage proxy handlers for offscreen documents
  if (msg?.type === "STORAGE_GET") {
    handleStorageGet(msg, sendResponse);
    return true;
  }
  
  if (msg?.type === "STORAGE_SET") {
    handleStorageSet(msg, sendResponse);
    return true;
  }
  
  if (msg?.type === "STORAGE_REMOVE") {
    handleStorageRemove(msg, sendResponse);
    return true;
  }
  
  // Storage sync handlers for settings
  if (msg?.type === "STORAGE_SYNC_GET") {
    handleStorageSyncGet(msg, sendResponse);
    return true;
  }
  
  if (msg?.type === "STORAGE_SYNC_SET") {
    handleStorageSyncSet(msg, sendResponse);
    return true;
  }

  if (msg?.type === "CLEAR_CORRUPTED_SETTINGS") {
    handleClearCorruptedSettings(msg, sendResponse);
    return true;
  }
  
  // Page scraping and screenshot handlers for offscreen
  if (msg?.type === "SCRAPE_PAGE") {
    handleScrapePage(msg, sendResponse);
    return true;
  }
  
  if (msg?.type === "CAPTURE_SCREENSHOTS") {
    handleCaptureScreenshots(msg, sendResponse);
    return true;
  }
  
  // Unknown message type
  sendResponse({ ok: false, error: 'Unknown message type' });
  return true;
});

/**
 * Handle job state changes and update notifications accordingly
 */
async function handleJobStateChange(jobKey: string, jobState: any): Promise<void> {
  try {
    const { state, progress, url, error, result } = jobState;
    const hostname = url ? new URL(url).hostname : 'website';
    
    console.log(`[BG] Job state changed: ${jobKey}, state: ${state}, progress: ${progress?.step}`);
    
    switch (state) {
      case 'running':
        const step = progress?.step || 'Analysis in progress...';
        const percentage = progress?.pct || 0;
        
        await NotificationManager.updateProgressNotification({
          message: `${step} - ${hostname}`,
          step: step,
          progress: percentage
        });
        break;
        
      case 'succeeded':
        await NotificationManager.showCompletionNotification({
          title: 'CRO Analysis Complete',
          message: `Analysis completed for ${hostname}. Click to view results.`,
          success: true,
          url: url
        });
        break;
        
      case 'failed':
        await NotificationManager.showCompletionNotification({
          title: 'CRO Analysis Failed',
          message: `Analysis failed for ${hostname}: ${error || 'Unknown error'}`,
          success: false,
          url: url
        });
        break;
    }
  } catch (error) {
    console.warn('[BG] Error handling job state change:', error);
  }
}

/**
 * Handle START_ANALYSIS - Acknowledge immediately, route to offscreen
 */
async function handleStartAnalysis(msg: any, sendResponse: (response: any) => void) {
  const { key, url, model, params } = msg.payload || {};
  
  if (!key || !url || !model) {
    sendResponse({ ok: false, error: 'Missing required parameters' });
        return;
      }

  try {
    console.log(`[BG] START_ANALYSIS key=${key}`);
    
    // Show progress notification
    const hostname = new URL(url).hostname;
    await NotificationManager.showProgressNotification({
      title: 'CRO Analysis Started',
      message: `Analyzing ${hostname}...`,
      step: 'Starting analysis',
      progress: 5
    });
    
    // 1. Write initial state to storage.local
    await chrome.storage.local.set({
      [`job:${key}`]: {
        key, 
        state: "queued", 
        createdAt: Date.now(), 
        updatedAt: Date.now(),
        url,
        progress: { step: "Starting", pct: 5 }
      }
    });
    
    // 2. Ensure offscreen document exists
    await ensureOffscreen();
    
    // 3. Fire and forget RUN_ANALYSIS to offscreen
    console.log(`[BG] Sending RUN_ANALYSIS message to offscreen...`);
    
    try {
      const response = await chrome.runtime.sendMessage({ 
        type: "RUN_ANALYSIS", 
        payload: { key, url, model, params } 
      });
      console.log(`[BG] RUN_ANALYSIS response:`, response);
      
      console.log(`[BG] RUN_ANALYSIS dispatched successfully`);
      // The offscreen document will handle the actual analysis and update storage directly
    } catch (messageError) {
      console.error(`[BG] Failed to send RUN_ANALYSIS message:`, messageError);
      throw messageError;
    }
    
    // 4. Acknowledge immediately - NO LONG RESPONSE CHANNEL
    sendResponse({ ok: true, key });
    
    } catch (error) {
    console.error(`[BG] START_ANALYSIS error:`, error);
    
    // Show error notification and clear any progress notifications
    const hostname = url ? new URL(url).hostname : 'website';
    await NotificationManager.showErrorNotification(
      'Failed to start analysis', 
      `Could not start analysis for ${hostname}`
    );
    
    sendResponse({ ok: false, error: String(error) });
  }
}

/**
 * Handle GET_STATUS - Direct storage.local lookup
 */
async function handleGetStatus(msg: any, sendResponse: (response: any) => void) {
  const { key } = msg.payload || {};
  
  if (!key) {
    sendResponse({ ok: false, error: 'Missing key parameter' });
    return;
  }
  
  try {
    const obj = await chrome.storage.local.get(`job:${key}`);
    const state = obj[`job:${key}`] || null;
    
    console.log(`[BG] GET_STATUS key=${key} state=${state?.state || 'null'}`);
    sendResponse({ ok: true, state });
    
    } catch (error) {
    console.error(`[BG] GET_STATUS error:`, error);
    sendResponse({ ok: false, error: String(error) });
    }
  }

/**
 * Handle STORAGE_GET - Proxy for offscreen documents
 */
async function handleStorageGet(msg: any, sendResponse: (response: any) => void) {
  const { key } = msg;
  
  if (!key) {
    sendResponse({ ok: false, error: 'Missing key parameter' });
    return;
  }
  
  try {
    const obj = await chrome.storage.local.get(key);
    const data = obj[key] || null;
    
    console.log(`[BG] STORAGE_GET ${key}:`, data ? 'found' : 'not found');
    sendResponse({ ok: true, data });
    
  } catch (error) {
    console.error(`[BG] STORAGE_GET error:`, error);
    sendResponse({ ok: false, error: String(error) });
  }
}

/**
 * Handle STORAGE_SET - Proxy for offscreen documents  
 */
async function handleStorageSet(msg: any, sendResponse: (response: any) => void) {
  const { key, data } = msg;
  
  if (!key || data === undefined) {
    sendResponse({ ok: false, error: 'Missing key or data parameters' });
    return;
  }
  
  try {
    await chrome.storage.local.set({ [key]: data });
    
    console.log(`[BG] STORAGE_SET ${key}:`, 'success');
    sendResponse({ ok: true });
    
  } catch (error) {
    console.error(`[BG] STORAGE_SET error:`, error);
    sendResponse({ ok: false, error: String(error) });
  }
}

/**
 * Handle STORAGE_REMOVE - Proxy for offscreen documents  
 */
async function handleStorageRemove(msg: any, sendResponse: (response: any) => void) {
  const { key } = msg;
  
  if (!key) {
    sendResponse({ ok: false, error: 'Missing key parameter' });
    return;
  }
  
  try {
    await chrome.storage.local.remove(key);
    
    console.log(`[BG] STORAGE_REMOVE ${key}:`, 'success');
    sendResponse({ ok: true });
    
  } catch (error) {
    console.error(`[BG] STORAGE_REMOVE error:`, error);
    sendResponse({ ok: false, error: String(error) });
  }
}

/**
 * Handle STORAGE_SYNC_GET - Proxy for chrome.storage.sync (settings)  
 */
async function handleStorageSyncGet(msg: any, sendResponse: (response: any) => void) {
  const { key } = msg;
  
  if (!key) {
    sendResponse({ ok: false, error: 'Missing key parameter' });
    return;
  }
  
  try {
    const obj = await chrome.storage.sync.get(key);
    const data = obj[key] || null;
    
    console.log(`[BG] STORAGE_SYNC_GET ${key}:`, data ? 'found' : 'not found');
    if (data && key === 'extension_settings') {
      if (DEBUG.STORAGE) {
        safeLog.settings(data);
      }
      
      // CRITICAL: Detect corruption and REJECT it - DO NOT convert to string
      if (data.openaiApiKey && typeof data.openaiApiKey !== 'string') {
        console.error(`🔥 [BG] FATAL: OpenAI API key is not a string in storage:`, {
          type: typeof data.openaiApiKey,
          value: data.openaiApiKey
        });
        // Return error instead of corrupted data
        sendResponse({ 
          ok: false, 
          error: 'OpenAI API key is corrupted in storage. Please clear extension data and re-enter your API key.' 
        });
        return;
      }
      if (data.geminiApiKey && typeof data.geminiApiKey !== 'string') {
        console.error(`🔥 [BG] FATAL: Gemini API key is not a string in storage:`, {
          type: typeof data.geminiApiKey,
          value: data.geminiApiKey
        });
        // Return error instead of corrupted data
        sendResponse({ 
          ok: false, 
          error: 'Gemini API key is corrupted in storage. Please clear extension data and re-enter your API key.' 
        });
        return;
      }
      
      // Additional check for "[object Object]" string corruption
      if (data.openaiApiKey === '[object Object]') {
        console.error(`🔥 [BG] FATAL: OpenAI API key is the literal string "[object Object]"`);
        sendResponse({ 
          ok: false, 
          error: 'OpenAI API key is corrupted. Please clear extension data and re-enter your API key.' 
        });
        return;
      }
      if (data.geminiApiKey === '[object Object]') {
        console.error(`🔥 [BG] FATAL: Gemini API key is the literal string "[object Object]"`);
        sendResponse({ 
          ok: false, 
          error: 'Gemini API key is corrupted. Please clear extension data and re-enter your API key.' 
        });
        return;
      }
    }
    sendResponse({ ok: true, data });
    
  } catch (error) {
    console.error(`[BG] STORAGE_SYNC_GET error:`, error);
    sendResponse({ ok: false, error: String(error) });
  }
}

/**
 * Handle STORAGE_SYNC_SET - Proxy for chrome.storage.sync (settings)  
 */
async function handleStorageSyncSet(msg: any, sendResponse: (response: any) => void) {
  const { key, data } = msg;
  
  if (!key || data === undefined) {
    sendResponse({ ok: false, error: 'Missing key or data parameters' });
    return;
  }
  
  try {
    await chrome.storage.sync.set({ [key]: data });
    
    console.log(`[BG] STORAGE_SYNC_SET ${key}:`, 'success');
    sendResponse({ ok: true });
    
  } catch (error) {
    console.error(`[BG] STORAGE_SYNC_SET error:`, error);
    sendResponse({ ok: false, error: String(error) });
  }
}

/**
 * Handle CLEAR_CORRUPTED_SETTINGS - Clear corrupted extension settings
 */
async function handleClearCorruptedSettings(msg: any, sendResponse: (response: any) => void) {
  try {
    console.log('[BG] Clearing corrupted settings...');
    await chrome.storage.sync.remove('extension_settings');
    console.log('[BG] Corrupted settings cleared successfully');
    sendResponse({ ok: true });
    
  } catch (error) {
    console.error('[BG] Failed to clear corrupted settings:', error);
    sendResponse({ ok: false, error: String(error) });
  }
}

/**
 * Handle SCRAPE_PAGE - Inject content script and scrape the page
 */
async function handleScrapePage(msg: any, sendResponse: (response: any) => void) {
  const { url } = msg;
  
  try {
    console.log(`[BG] SCRAPE_PAGE request for: ${url}`);
    
    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      throw new Error('No active tab found');
    }
    
    const tabId = tabs[0].id;
    
    // Check if content script is already loaded
    console.log(`[BG] Checking if content script is already loaded in tab ${tabId}`);
    let isContentScriptLoaded = false;
    
    try {
      // Try to send a test message - if it works, script is loaded
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      isContentScriptLoaded = true;
      console.log(`[BG] Content script already loaded, skipping injection`);
    } catch (pingError) {
      console.log(`[BG] Content script not loaded, will inject`);
    }
    
    // Only inject if not already loaded
    if (!isContentScriptLoaded) {
      console.log(`[BG] Injecting content script into tab ${tabId}`);
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });
        console.log(`[BG] Content script injection successful`);
        
        // Wait for content script to initialize
        console.log(`[BG] Waiting for content script initialization...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (injectionError) {
        console.error(`[BG] Content script injection failed:`, injectionError);
        throw new Error(`Content script injection failed: ${injectionError instanceof Error ? injectionError.message : 'Unknown error'}`);
      }
    }
    
    // Send message to content script to scrape the page
    console.log(`[BG] Sending scrapePage message to content script`);
    let response;
    try {
      response = await chrome.tabs.sendMessage(tabId, { action: 'scrapePage' });
      console.log(`[BG] Received response from content script:`, response ? 'success' : 'no response');
    } catch (messageError) {
      console.error(`[BG] Failed to send message to content script:`, messageError);
      throw new Error(`Failed to communicate with content script: ${messageError instanceof Error ? messageError.message : 'Unknown error'}`);
    }
    
    if (response?.success) {
      console.log(`[BG] SCRAPE_PAGE success: ${response.data.title}`);
      sendResponse({ ok: true, data: response.data });
    } else {
      throw new Error(response?.error || 'Page scraping failed');
    }
    
  } catch (error) {
    console.error(`[BG] SCRAPE_PAGE error:`, error);
    sendResponse({ ok: false, error: String(error) });
  }
}

/**
 * Handle CAPTURE_SCREENSHOTS - Use screenshot utility to capture images with compression
 */
async function handleCaptureScreenshots(msg: any, sendResponse: (response: any) => void) {
  const { params } = msg;
  
  try {
    console.log(`[BG] CAPTURE_SCREENSHOTS request:`, params);
    
    let screenshots: string[] = [];
    let totalOriginalSize = 0;
    let totalCompressedSize = 0;
    
    if (params?.fullPage) {
      // Capture full page screenshots
      const result = await ScreenshotCapture.captureFullPage({
        fullPage: true,
        maxScreenshots: 20, // Increased to capture entire page
        scrollDelay: 300    // Reduced from 1000ms to 300ms for faster capture
      });
      screenshots = result.screenshots;
      totalCompressedSize = result.totalSize;
      console.log(`[BG] Captured ${screenshots.length} full page screenshots, total size: ${Math.round(totalCompressedSize / 1024 / 1024)}MB, compressed: ${result.compressed}`);
    } else {
      // Capture single viewport screenshot
      const screenshot = await ScreenshotCapture.captureActiveTab();
      screenshots = [screenshot];
      totalCompressedSize = ScreenshotCapture.getEstimatedSize(screenshot);
      console.log(`[BG] Captured 1 viewport screenshot, size: ${Math.round(totalCompressedSize / 1024)}KB`);
    }
    
    // Log compression effectiveness
    if (screenshots.length > 0) {
      console.log(`[BG] Total screenshots captured: ${screenshots.length}`);
      console.log(`[BG] Average screenshot size: ${Math.round(totalCompressedSize / screenshots.length / 1024)}KB`);
      console.log(`[BG] Ready to send ${Math.round(totalCompressedSize / 1024 / 1024)}MB total to LLM`);
    }
    
    sendResponse({ ok: true, screenshots });
    
  } catch (error) {
    console.error(`[BG] CAPTURE_SCREENSHOTS error:`, error);
    sendResponse({ ok: false, error: String(error), screenshots: [] });
  }
}

  /**
 * Ensure offscreen document exists
 */
async function ensureOffscreen(): Promise<void> {
  try {
    const hasDocument = await chrome.offscreen?.hasDocument?.();
    if (hasDocument) {
      console.log(`[BG] Offscreen document already exists`);
      return;
    }

    console.log(`[BG] Creating offscreen document...`);
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL('src/offscreen/offscreen.html'),
      reasons: ['BLOBS' as chrome.offscreen.Reason, 'DOM_PARSER' as chrome.offscreen.Reason],
      justification: 'Long-running analysis and LLM calls'
    });
    
    console.log(`[BG] Offscreen document created, waiting for initialization...`);
    
    // Give offscreen time to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(`[BG] Offscreen document should be ready`);
    
    console.log(`[BG] Offscreen document initialization complete`);
    
    } catch (error) {
    if (error instanceof Error && error.message.includes('single offscreen document')) {
      console.log(`[BG] Offscreen document already exists (race condition)`);
      return;
    }
    console.error(`[BG] Failed to create offscreen document:`, error);
    throw error;
  }
}

// Action button click - auto-start analysis
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id && tab.url) {
    console.log(`[BG] Action button clicked, URL: ${tab.url}`);
    
    // Note: The actual analysis is triggered by popup.ts
    // This just opens the popup, but we can show a brief notification
    try {
      const hostname = new URL(tab.url).hostname;
      await NotificationManager.showProgressNotification({
        title: 'CRO Djinn',
        message: `Opening analysis popup for ${hostname}`,
        step: 'Ready to analyze',
        progress: 0
      });
      
      // Clear this notification quickly as it's just informational
      setTimeout(async () => {
        await NotificationManager.clearProgressNotification();
      }, 2000);
    } catch (error) {
      console.warn(`[BG] Failed to show notification:`, error);
    }
  }
});

console.log('Background service worker initialized');
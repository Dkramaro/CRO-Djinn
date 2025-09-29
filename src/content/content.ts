import { scrapePage } from './scraper';
import { ConsentProxy } from '../utils/consentProxy';

// Prevent multiple injections
if (!(window as any).__croGenieContentScriptLoaded) {
  (window as any).__croGenieContentScriptLoaded = true;
  
  console.log('🔧 [Content] Content script loaded successfully');
  console.log('🔧 [Content] Location:', window.location.href);
  console.log('🔧 [Content] chrome.runtime available:', !!chrome?.runtime);

  // Message listener for popup communications
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('🔧 [Content] Received message:', request);
    if (request.action === 'scrapePage') {
      console.log('🔧 [Content] Handling scrapePage request');
      handleScrapeRequest(sendResponse);
      return true; // Keep the message channel open for async response
    }
    console.log('🔧 [Content] Unknown action:', request.action);
    return false;
  });
  
  console.log('🔧 [Content] Message listener registered');
} else {
  console.log('🔧 [Content] Content script already loaded, skipping initialization');
}

async function handleScrapeRequest(sendResponse: (response: any) => void): Promise<void> {
  try {
    console.log('🔧 [Content] Starting scrape request handling');
    
    // Check consent for current domain using content script-compatible proxy
    const domain = window.location.hostname;
    const hasConsent = await ConsentProxy.hasConsent(domain);
    
    if (!hasConsent) {
      console.log('🔒 [Content] No consent found, showing dialog...');
      const userConsent = await ConsentProxy.showConsentDialog(domain);
      
      if (!userConsent) {
        console.log('🔒 [Content] User declined consent');
        sendResponse({ 
          success: false, 
          error: 'User declined consent for data collection',
          code: 'CONSENT_DENIED'
        });
        return;
      }
      
      // Save consent
      await ConsentProxy.saveConsent(domain, true);
      console.log('🔒 [Content] User granted consent, saved');
    }
    
    console.log('🔧 [Content] Calling scrapePage function');
    const rawData = await scrapePage();
    console.log('🔧 [Content] Scraping completed, sending response');
    sendResponse({ success: true, data: rawData });
  } catch (error) {
    console.error('🔧 [Content] Page scraping failed:', error);
    sendResponse({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}


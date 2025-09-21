import { scrapePage } from './scraper';

// Message listener for popup communications
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapePage') {
    handleScrapeRequest(sendResponse);
    return true; // Keep the message channel open for async response
  }
});

async function handleScrapeRequest(sendResponse: (response: any) => void): Promise<void> {
  try {
    const rawData = await scrapePage();
    sendResponse({ success: true, data: rawData });
  } catch (error) {
    console.error('Page scraping failed:', error);
    sendResponse({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}


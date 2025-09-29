console.log('🔧 [Offscreen-Minimal] Document loaded');
console.log('🔧 [Offscreen-Minimal] Location:', location.href);
console.log('🔧 [Offscreen-Minimal] Chrome available:', typeof chrome !== 'undefined');

// Wait for document to be fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

function initialize() {
  console.log('🔧 [Offscreen-Minimal] Initializing...');
  
  // Check chrome APIs availability with more detail
  console.log('🔧 [Offscreen-Minimal] Chrome object:', chrome);
  console.log('🔧 [Offscreen-Minimal] Chrome runtime:', typeof chrome?.runtime !== 'undefined');
  console.log('🔧 [Offscreen-Minimal] Chrome storage:', typeof chrome?.storage !== 'undefined');
  console.log('🔧 [Offscreen-Minimal] Chrome storage.local:', typeof chrome?.storage?.local !== 'undefined');
  
  if (chrome?.storage) {
    console.log('🔧 [Offscreen-Minimal] Storage methods:', Object.keys(chrome.storage));
  } else {
    console.error('🔧 [Offscreen-Minimal] Chrome storage is completely unavailable!');
    console.error('🔧 [Offscreen-Minimal] Available chrome APIs:', chrome ? Object.keys(chrome) : 'chrome is undefined');
  }
  
  // Set up message listener immediately
  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      console.log('🔧 [Offscreen-Minimal] Received message:', msg);
      
      if (msg?.type === "TEST_CONNECTION") {
        console.log('🔧 [Offscreen-Minimal] Test connection received');
        sendResponse({ ok: true, message: 'Minimal offscreen ready' });
        return true;
      }
      
      if (msg?.type === "TEST_STORAGE") {
        console.log('🔧 [Offscreen-Minimal] Testing storage...');
        
        if (!chrome?.storage?.local) {
          console.error('🔧 [Offscreen-Minimal] Chrome storage not available');
          
          // Try to provide more detailed information
          const details = {
            chromeExists: typeof chrome !== 'undefined',
            chromeStorageExists: typeof chrome?.storage !== 'undefined',
            availableApis: chrome ? Object.keys(chrome) : [],
            context: 'offscreen',
            location: location.href
          };
          
          console.error('🔧 [Offscreen-Minimal] Chrome API details:', details);
          sendResponse({ ok: false, error: 'Chrome storage not available', details });
          return true;
        }
        
        // Test storage access
        chrome.storage.local.set({ 'test_key': 'test_value' }, () => {
          if (chrome.runtime.lastError) {
            console.error('🔧 [Offscreen-Minimal] Storage set error:', chrome.runtime.lastError);
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            chrome.storage.local.get('test_key', (result) => {
              if (chrome.runtime.lastError) {
                console.error('🔧 [Offscreen-Minimal] Storage get error:', chrome.runtime.lastError);
                sendResponse({ ok: false, error: chrome.runtime.lastError.message });
              } else {
                console.log('🔧 [Offscreen-Minimal] Storage test successful:', result);
                chrome.storage.local.remove('test_key');
                sendResponse({ ok: true, result });
              }
            });
          }
        });
        return true;
      }
      
      if (msg?.type === "RUN_ANALYSIS") {
        console.log('🔧 [Offscreen-Minimal] RUN_ANALYSIS received - minimal handler');
        console.log('🔧 [Offscreen-Minimal] RUN_ANALYSIS payload:', msg.payload);
        
        // Since chrome.storage is not available in offscreen context,
        // we'll respond immediately and let the background script handle storage
        sendResponse({ 
          ok: true, 
          message: 'Minimal handler - analysis not implemented', 
          storageAvailable: !!chrome?.storage?.local,
          needsStorageProxy: !chrome?.storage?.local
        });
        return true;
      }
      
      return false;
    });
    
    console.log('🔧 [Offscreen-Minimal] Message listener set up');
  } else {
    console.error('🔧 [Offscreen-Minimal] Chrome runtime.onMessage not available');
  }
}

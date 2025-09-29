# Chrome Storage Diagnostics - Friend's Pressure Test

## Problem Fixed
❌ **Error**: `TypeError: Cannot read properties of undefined (reading 'local')`  
✅ **Solution**: Added proper chrome.storage guards, manifest fixes, and URL corrections

## Immediate Diagnostics to Run

### 1. ✅ Check Extension Console Outputs

**Background Console** (`chrome://extensions` → CRO Djinn → "Inspect views: background page"):
```
[BG] Background service worker initializing...
[BG] START_ANALYSIS key=analysis:https://example.com|abc123
[BG] Offscreen document created
```

**Offscreen Console** (`chrome://extensions` → CRO Djinn → "Inspect views: offscreen.html"):
```
🔧 [Offscreen] Document loaded at: chrome-extension://abc.../src/offscreen/offscreen.html
🔧 [Offscreen] chrome.storage.local available: true
✅ [Offscreen] chrome.storage.local is available
[Offscreen] Received RUN_ANALYSIS: {key: "analysis:...", url: "...", ...}
[Offscreen] State updated for analysis:...: {state: "running"}
```

**Popup Console** (F12 on popup):
```
🔑 [Popup] Computed stable jobKey: analysis:https://example.com|abc123
✅ [Popup] START_ANALYSIS acknowledged for key: analysis:...
📡 Storage change detected for analysis:...: {state: "succeeded"}
```

### 2. ✅ Quick Manual Tests

**In Offscreen Console**, run these commands:
```javascript
// Should return an object, not undefined
chrome.storage

// Should return an object, not undefined  
chrome.storage.local

// Should return current URL starting with chrome-extension://
location.href

// Test a simple write/read
chrome.storage.local.set({test: "hello"}).then(() => console.log("✅ Write OK"));
chrome.storage.local.get("test").then(r => console.log("✅ Read:", r));
```

### 3. ✅ Extension Storage Inspector

**In chrome://extensions → CRO Djinn → "Storage":**
- Look for entries like `job:analysis:https://example.com|abc123`
- Should see `{state: "succeeded", result: {...}, updatedAt: ...}`
- Should NOT see immediate cleanup (stays for hours)

### 4. ✅ Network Tab Verification

**In Offscreen Console Network Tab:**
- Should see successful LLM API calls (200 responses)  
- Should see calls to OpenAI or Gemini endpoints
- No failed chrome-extension:// resource loads

## Changes Made

### ✅ A) Fixed Manifest (`src/manifest.json`)
```json
{
  "permissions": ["storage", "offscreen", ...],
  "offscreen": {
    "documents": ["src/offscreen/offscreen.html"]
  },
  "web_accessible_resources": [{
    "resources": ["src/offscreen/offscreen.html"],
    "matches": ["<all_urls>"]
  }]
}
```

### ✅ B) Fixed Background URL (`src/background/background.ts`)
```typescript
// BEFORE: url: 'src/offscreen/offscreen.html' (relative path)
// AFTER: url: chrome.runtime.getURL('src/offscreen/offscreen.html') (absolute)
await chrome.offscreen.createDocument({
  url: chrome.runtime.getURL('src/offscreen/offscreen.html'),
  reasons: ['BLOBS', 'DOM_PARSER'],
  justification: 'Long-running analysis and LLM calls'
});
```

### ✅ C) Added Chrome Storage Guards (`src/offscreen/offscreen.ts`)
```typescript
// Top-level diagnostics
console.log('🔧 [Offscreen] Document loaded at:', location.href);
console.log('🔧 [Offscreen] chrome.storage.local available:', !!chrome?.storage?.local);

// Runtime guard  
if (!chrome || !chrome.storage || !chrome.storage.local) {
  console.error('[Offscreen] chrome.storage.local unavailable. Check manifest "storage" permission and execution context.');
  throw new Error('chrome.storage.local unavailable');
}

// Per-call guards in getState/writeState
if (!chrome?.storage?.local) {
  throw new Error('chrome.storage.local unavailable during writeState');
}
```

### ✅ D) Enhanced Error Handling
- All storage calls wrapped in try/catch
- Detailed error logging with context  
- Graceful fallbacks where possible
- Error states written to storage for popup display

## Expected Test Results

### ✅ **Test 1: Extension Load**
1. Load extension → Should see diagnostics in all consoles
2. No `chrome.storage` undefined errors
3. Offscreen document URL shows `chrome-extension://...` 

### ✅ **Test 2: Start Analysis** 
1. Click "Start Analysis" → Immediate ack in popup
2. Offscreen receives `RUN_ANALYSIS` message
3. Storage entries appear in `chrome.storage.local`
4. Progress updates visible in storage
5. Terminal state `"succeeded"` with results

### ✅ **Test 3: Close/Reopen Popup**
1. Start analysis → close popup → wait → reopen
2. Should instantly show results from storage
3. No duplicate API calls or timeout errors

## Troubleshooting

### ❌ If Still Getting `chrome.storage` Undefined:

**Check Context:** In offscreen console, run `location.href`. Must be `chrome-extension://...`, not `blob:` or `data:`

**Check Permissions:** `chrome://extensions` → CRO Djinn → Details → Permissions should include "Store unlimited amount of client-side data"

**Check Worker:** If using Web Workers, ensure storage calls are in main thread, not worker

**Check Creation:** Background should log "Offscreen document created" successfully

### ❌ If Storage Calls Fail:

**Timeout Issues:** Add timeouts to storage calls:
```typescript
const storagePromise = chrome.storage.local.set(data);
const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Storage timeout')), 5000));
await Promise.race([storagePromise, timeoutPromise]);
```

**Quota Issues:** Check if storage quota exceeded (unlikely but possible)

**Manifest V3 Issues:** Ensure no legacy V2 patterns in manifest

## Success Criteria

✅ **No `chrome.storage` undefined errors**  
✅ **Offscreen console shows `chrome.storage.local available: true`**  
✅ **Background creates offscreen with `chrome.runtime.getURL`**  
✅ **Analysis completes and writes terminal state to storage**  
✅ **Popup rehydrates from storage.local successfully**  

If all diagnostics pass, the friend's fix has successfully resolved the chrome.storage unavailable issue! 🎯

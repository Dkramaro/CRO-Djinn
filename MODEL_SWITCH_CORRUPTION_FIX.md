# Model Switch Corruption Fix

## Issue Summary

You experienced API key corruption after switching model types in the extension settings. The error message indicates:
```
LLM analysis failed: Invalid OpenAI API key format. Key should start with "sk-" and be at least 20 characters long.
```

This occurred even though your API key was correct, indicating the key got corrupted during the model switching process.

## Root Cause Identified

The issue was in the `saveSettings()` function in `src/options/options.ts`. When switching providers or models, the function was:

1. **Overwriting API keys**: When saving settings, it would take the current form values and could overwrite API keys for inactive providers with empty values
2. **Race conditions**: Multiple encryption/decryption operations during provider switching could corrupt keys
3. **No preservation logic**: Switching from OpenAI to Gemini could clear the OpenAI key, and vice versa

## Fixes Implemented

### 1. API Key Preservation Logic

**Before (problematic):**
```typescript
const settings: ExtensionSettings = {
  provider,
  openaiApiKey: this.openaiApiKeyInput?.value.trim() || '',  // Could be empty!
  geminiApiKey: this.geminiApiKeyInput?.value.trim() || '',  // Could be empty!
  // ...
};
```

**After (fixed):**
```typescript
// Get current values from the form, preserving existing keys for non-active providers
const currentSettings = await StorageManager.getSettings();

const settings: ExtensionSettings = {
  provider,
  // Only update the API key for the current provider, preserve others
  openaiApiKey: provider === 'openai' 
    ? (this.openaiApiKeyInput?.value.trim() || '') 
    : (currentSettings.openaiApiKey || ''),
  geminiApiKey: provider === 'gemini' 
    ? (this.geminiApiKeyInput?.value.trim() || '') 
    : (currentSettings.geminiApiKey || ''),
  // ...
};
```

### 2. Built-in Diagnostic Tool

Added a "🔍 Run Diagnostics" button in the options page that:
- Shows the current state of your API keys
- Validates key formats
- Identifies corruption issues
- Offers automatic recovery options
- Provides detailed console logging

### 3. Enhanced Validation & Logging

- Added pre-save validation with detailed logging
- Better error messages that pinpoint the exact issue
- Comprehensive debugging information in the console

## How to Fix Your Current Issue

### Option 1: Use the New Diagnostic Tool (Recommended)

1. **Open Extension Options:**
   - Click the CRO Djinn extension icon
   - Click "⚙️ Settings"

2. **Run Diagnostics:**
   - Scroll to "Privacy & Data Management" section
   - Click "🔍 Run Diagnostics"
   - Review the diagnostic results

3. **Follow the Recommendations:**
   - If corruption is detected, the tool will offer to clear corrupted settings
   - Accept the cleanup and re-enter your API key

### Option 2: Manual Recovery

1. **Clear Corrupted Settings:**
   - In options page, click "Delete All Extension Data"
   - Confirm the action

2. **Re-enter Your API Key:**
   - Enter your correct OpenAI API key (starts with `sk-`)
   - Save settings
   - Test with an analysis

### Option 3: Browser Console Method

1. **Open Browser Console:**
   - Press F12 in the options page
   - Go to Console tab

2. **Check Stored Data:**
   ```javascript
   // See what's actually stored
   chrome.storage.sync.get('extension_settings').then(console.log);
   ```

3. **Clear if Corrupted:**
   ```javascript
   // Clear corrupted settings
   chrome.storage.sync.remove('extension_settings');
   ```

## Prevention Measures Now in Place

### ✅ **Key Preservation**
- Switching providers no longer overwrites inactive provider keys
- Only the active provider's key gets updated during saves

### ✅ **Validation at Every Step**
- API keys are validated before encryption
- Keys are validated after decryption
- Clear error messages for any format issues

### ✅ **Built-in Recovery Tools**
- Diagnostic tool to identify issues
- One-click corruption cleanup
- Detailed logging for troubleshooting

### ✅ **Better Error Handling**
- Graceful fallbacks if encryption fails
- Safe defaults if storage is corrupted
- Clear user-facing error messages

## Testing the Fix

1. **Reload the Extension:**
   - Go to Chrome Extensions (`chrome://extensions/`)
   - Find CRO Djinn and click the reload button

2. **Run Diagnostics:**
   - Open options and click "🔍 Run Diagnostics"
   - Check the results

3. **Test Provider Switching:**
   - Switch between OpenAI and Gemini
   - Verify your keys are preserved
   - Save settings and test analysis

## Debug Information

The new implementation provides extensive logging. Open browser console (F12) in the options page to see:

- **Settings Loading:** Raw and decrypted settings with validation results
- **Settings Saving:** Key preservation logic and encryption details  
- **Provider Switching:** What keys are being preserved vs updated
- **Diagnostic Results:** Complete analysis of stored data

## API Key Format Requirements

**OpenAI Keys:**
- Must start with `sk-`
- Minimum 20 characters
- Example: `sk-abcd1234efgh5678ijkl9012mnop3456`

**Gemini Keys:**
- Must start with `AIza`
- Minimum 30 characters
- Example: `AIzaSyDk7a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p`

## What Changed

1. **`src/options/options.ts`**: Fixed saveSettings() to preserve API keys during provider switching
2. **`src/options/options.html`**: Added diagnostic button
3. **Enhanced logging**: All storage operations now have detailed debugging
4. **Recovery tools**: Built-in diagnostics and cleanup functions

## Support

The new diagnostic tool should resolve most issues automatically. If you continue to have problems:

1. Use the diagnostic tool to get detailed error information
2. Check the browser console for detailed logs
3. Verify your API key format matches the requirements
4. Try the manual recovery steps if automated recovery fails

Your extension should now reliably preserve API keys when switching between providers and models! 🎉

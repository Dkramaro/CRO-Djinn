# Idempotency Implementation - Fixing Duplicate API Calls

This document describes the architectural changes implemented to fix the duplicate API call issue in the CRO Genie extension.

## Problem

The extension was experiencing duplicate API calls when users pressed "Scan Page" due to:
- Multiple contexts (popup, background, offscreen) could independently trigger analysis
- Time-based throttling only masked symptoms, not root causes  
- Service worker wake/sleep cycles could retrigger requests
- Popup mount/unmount cycles could re-emit requests
- Race conditions between different message handlers

## Solution

Implemented a battle-tested idempotency pattern with the following principles:

### 1. Durable Background Job Ownership
- **Background script** is the durable owner that runs jobs to completion regardless of UI state
- Jobs survive popup close/disconnect and service worker restarts  
- **Popup** is a pure stateless subscriber that never affects job execution
- **Offscreen** only responds to background script requests

### 2. Idempotency Keys Instead of Timers  
- Deterministic keys generated from request parameters
- Same input always produces the same key
- Duplicate requests with same key collapse to single execution

### 3. Complete Lifecycle Independence
- Jobs run independently of any UI connection
- Progress notifications and completion notifications restored
- Badge updates show active job count
- Auto-start analysis on extension icon click

### 4. Robust Notification System
- Progress notifications when analysis starts
- Completion notifications with results
- Error notifications for failures
- Badge updates for active job count

## File Changes

### New Files Created

1. **`src/utils/idempotency.ts`**
   - Deterministic key generation from analysis parameters
   - Hash functions for stable request identification
   - Validation utilities

2. **`src/utils/jobManager.ts`**
   - Single source of truth for all analysis jobs
   - In-memory + session storage persistence
   - Atomic get-or-create with promise deduplication

### Files Refactored

3. **`src/background/background.ts`** - MAJOR REFACTOR
   - Removed complex job queue and time-based throttling
   - Uses JobManager for all analysis requests
   - Only this script can call LLM APIs
   - Clean message handling with sequence numbers for debugging

4. **`src/popup/popup.ts`** - MAJOR REFACTOR  
   - Removed all LLM calling logic
   - Removed complex throttling and duplicate detection
   - Simple request → poll status → display results pattern
   - No longer has any time-based throttling

5. **`src/offscreen/offscreen.ts`** - REFACTOR
   - Removed complex message tracking
   - Clean singleton that only responds to background
   - Never self-triggers or calls LLM independently

## How It Works

### Request Flow
1. User clicks "Scan Page" in popup
2. Popup sends `START_ANALYSIS` to background
3. Background generates idempotency key from URL + settings
4. Background checks JobManager for existing job with same key
5. If exists: return existing promise
6. If new: create job and execute analysis exactly once
7. Popup polls for status until completion

### Key Features
- **Deterministic Keys**: Same page + settings = same key
- **Promise Reuse**: Multiple requests for same key share one promise
- **Session Persistence**: Jobs survive service worker restarts
- **Clean Separation**: Each component has single responsibility
- **No Time Windows**: Idempotency is based on content, not timing

## Debugging & Verification

### Console Logs to Monitor
Look for these patterns in the browser console:

```
[JobManager seq=1] REQUEST key=analysis:abc123
[JobManager seq=2] DUPLICATE key=analysis:abc123 - returning existing promise
[BG seq=3] START key=analysis:abc123
```

### What You Should See
- ✅ One `[JobManager] REQUEST` per unique page/settings combination
- ✅ `DUPLICATE` messages for repeated requests
- ✅ One API call per unique analysis key
- ✅ No more "⚠️ DUPLICATE REQUEST BLOCKED" throttling messages

### What You Should NOT See
- ❌ Multiple API calls for the same page without changing settings
- ❌ Time-based throttling warning messages
- ❌ Complex job queue management logs

## Testing Instructions

1. **Single Request Test**:
   - Open a webpage
   - Click "Start Analysis" once
   - Should see one analysis request in logs
   - Should get progress and completion notifications

2. **Duplicate Prevention Test**:
   - Click "Start Analysis" multiple times rapidly
   - Should see first request proceed, others return existing promise
   - Only one API call should be made

3. **Job Durability Test** (CRITICAL):
   - Start analysis, immediately close popup  
   - Analysis should continue running in background
   - Should get completion notification when done
   - Reopen popup - should show completed results
   - No duplicate API calls

4. **Extension Icon Test**:
   - Click extension icon on any webpage
   - Should auto-start analysis with notification
   - Background badge should show "1" during analysis

5. **Settings Change Test**:
   - Complete analysis for a page
   - Change LLM provider in options
   - Re-analyze same page
   - Should trigger new analysis (different key due to different settings)

6. **Service Worker Restart Test**:
   - Start analysis
   - Force service worker restart (chrome://serviceworker-internals)
   - Jobs should survive and complete
   - Popup should reconnect to job status

## Benefits

- **Eliminates duplicate API calls** - Root cause fix, not symptom treatment
- **Reduces API costs** - No more accidental double billing
- **Improves user experience** - Consistent, predictable behavior
- **Simplifies codebase** - Removed complex throttling and queue logic
- **Better reliability** - Works across all MV3 lifecycle events

## Migration Notes

- Old throttling mechanisms removed from popup and background
- Complex job queue replaced with simple JobManager
- Message ID tracking simplified
- All time-based duplicate detection removed
- Session storage used for job persistence

The extension now follows the recommended architecture pattern for Chrome MV3 extensions with proper idempotency guarantees.

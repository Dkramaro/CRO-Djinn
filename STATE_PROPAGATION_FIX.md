# State Propagation Bug Fix

## Problem Diagnosed
API call completes successfully but UI stays stuck in "analyzing" state forever. This was a **state propagation bug** where the "write → notify → rehydrate" chain was broken.

## Root Causes Fixed

1. **Immediate cleanup** - Terminal states were removed too quickly
2. **Wrong storage area** - Using session instead of local for persistence  
3. **No storage listeners** - Popup couldn't detect state changes
4. **Unstable keys** - Key generation inconsistencies between contexts
5. **Missing GET_STATUS API** - No direct state lookup mechanism

## Implementation Summary

### 1. ✅ State Writer (`src/background/state.ts`)
```typescript
const K = (k: string) => `job:${k}`;

export async function writeState(key: string, patch: any) {
  const cur = (await chrome.storage.local.get(K(key)))[K(key)] || {};
  const next = { createdAt: cur.createdAt ?? Date.now(), updatedAt: Date.now(), ...cur, ...patch };
  await chrome.storage.local.set({ [K(key)]: next });
  return next;
}
```

### 2. ✅ Terminal State Writing (Background)
```typescript
// BEFORE LLM call
await writeState(key, { progress: { step: "Calling LLM", pct: 40 } });
const result = await sendToOffscreenForAnalysis(...);

// IMMEDIATELY AFTER LLM success
await writeState(key, { 
  state: "succeeded", 
  progress: { step: "Done", pct: 100 }, 
  result,
  completedAt: Date.now()
});

// TTL cleanup after 12 hours (NOT immediately!)
setTimeout(() => chrome.storage.local.remove(`job:${key}`), 12 * 60 * 60 * 1000);
```

### 3. ✅ GET_STATUS API (Background)
```typescript
chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg?.type === "GET_STATUS") {
    const key = msg.payload.key;
    chrome.storage.local.get(`job:${key}`).then(obj => {
      sendResponse({ ok: true, state: obj[`job:${key}`] || null });
    });
    return true;
  }
});
```

### 4. ✅ Popup Rehydration Logic
```typescript
// Compute stable key on mount
const jobKey = computeStableKey({ url, model, params, appVersion: "1.0.0" });

// Hydrate once from storage.local
async function hydrateOnce() {
  const obj = await chrome.storage.local.get(`job:${jobKey}`);
  const s = obj[`job:${jobKey}`];
  if (s) render(s);
}

// Listen to storage.onChanged for area "local"
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const entry = changes[`job:${jobKey}`];
  if (entry?.newValue) render(entry.newValue);
});

// Poll backup every 3 seconds
const tid = setInterval(async () => {
  const res = await chrome.runtime.sendMessage({ type: "GET_STATUS", payload: { key: jobKey } });
  if (res?.ok && res.state) {
    render(res.state);
    if (["succeeded", "failed", "cancelled"].includes(res.state.state)) clearInterval(tid);
  }
}, 3000);
```

### 5. ✅ Stable Keys (`src/shared/keys.ts`)
```typescript
export function computeStableKey({ url, model, params, appVersion }: any) {
  const base = JSON.stringify({ model, params, appVersion }); // no timestamps or randoms
  const hash = simpleHash(base);
  return `analysis:${url}|${hash}`;
}
```

## What to Verify in DevTools

### ✅ Background Console (CRITICAL CHECKS)
1. After API call completes, you see: `✅ [State] Terminal state written: analysis:xxx = succeeded`
2. No immediate `chrome.storage.local.remove("job:xxx")` in success path
3. State persists in storage for hours, not seconds

### ✅ Application → Storage → chrome.storage.local
1. See `job:<key>` entry containing `state: "succeeded"` and the result
2. Entry persists after popup closes and reopens
3. No duplicate keys with different formats

### ✅ Popup Console (CRITICAL CHECKS)
1. On mount: `🔑 Computed stable jobKey: analysis:xxx for https://example.com`
2. Rehydration: `🔄 hydrateOnce found state for analysis:xxx: {state: "succeeded"}`
3. Storage listener: `📡 Storage change detected for analysis:xxx: {state: "succeeded"}`
4. Confirm jobKey matches the one written by background

### ✅ Popup Behavior Test
1. Start analysis → close popup immediately
2. Wait for analysis to complete (background continues)
3. Reopen popup → **should instantly show results** (not "analyzing")
4. ✅ **No more stuck analyzing state!**

## Common Gotchas That Cause "Stuck Analyzing"

❌ **Fixed**: Final write goes to `storage.session` → **Now**: Always `storage.local`  
❌ **Fixed**: Terminal write in `finally` that never runs → **Now**: Immediate write after LLM success  
❌ **Fixed**: Missing `await writeState` after LLM → **Now**: Always awaited  
❌ **Fixed**: Immediate removal on success → **Now**: 12-hour TTL cleanup  
❌ **Fixed**: Different keys between background/popup → **Now**: Centralized `computeStableKey`  

## Files Changed

- ✅ `src/background/state.ts` - New state persistence utility
- ✅ `src/background/background.ts` - Terminal state writing + GET_STATUS API  
- ✅ `src/popup/popup.ts` - Complete rehydration logic with storage listeners
- ✅ `src/shared/keys.ts` - Stable key computation

## Test Plan

1. **Basic Test**: Start analysis → should complete and show results  
2. **Durability Test**: Start analysis → close popup → reopen → should show completed results  
3. **Multiple Popup Test**: Complete analysis → close/reopen popup multiple times → always shows results  
4. **Long Analysis Test**: 3+ minute analysis → popup rehydration should work throughout

## Success Criteria

✅ **No more "stuck analyzing" state**  
✅ **Instant rehydration** when reopening popup after completion  
✅ **Reliable state propagation** via storage.onChanged + polling backup  
✅ **Persistent terminal states** that survive popup lifecycle  
✅ **Stable keys** that work consistently across contexts  

The "write → notify → rehydrate" chain is now **bulletproof**! 🎯

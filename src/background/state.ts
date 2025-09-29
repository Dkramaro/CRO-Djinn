/**
 * State management for durable job tracking
 * Always writes terminal state to chrome.storage.local for hours
 */

const K = (k: string) => `job:${k}`;

export async function writeState(key: string, patch: any) {
  const cur = (await chrome.storage.local.get(K(key)))[K(key)] || {};
  const next = { 
    createdAt: cur.createdAt ?? Date.now(), 
    updatedAt: Date.now(), 
    ...cur, 
    ...patch 
  };
  
  await chrome.storage.local.set({ [K(key)]: next });
  console.log(`[State] writeState key=${key}`, next);
  return next;
}

export async function readState(key: string) {
  const result = await chrome.storage.local.get(K(key));
  return result[K(key)] || null;
}

export async function removeState(key: string) {
  await chrome.storage.local.remove(K(key));
  console.log(`[State] removeState key=${key}`);
}

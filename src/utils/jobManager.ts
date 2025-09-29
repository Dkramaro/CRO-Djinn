/**
 * JobManager - Single source of truth for analysis requests
 * Implements idempotency and prevents duplicate LLM calls
 */

import { analysisKey, AnalysisKeyInput, generateParamsHash } from './idempotency';

export type JobState = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface Job {
  key: string;
  createdAt: number;
  state: JobState;
  tabId?: number;
  url: string;
  promise: Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  result?: any;
  error?: string;
  metadata?: {
    model: string;
    provider: string;
    paramsHash: string;
    viewport?: string;
    retryCount?: number;
  };
}

/**
 * JobManager ensures only one analysis per unique key is ever running
 * Uses both in-memory state and session storage for persistence across SW restarts
 */
export class JobManager {
  private static instance: JobManager | null = null;
  private inflight = new Map<string, Job>();
  private sequenceCounter = 0; // For instrumentation
  
  constructor() {
    if (JobManager.instance) {
      console.warn('❌ JobManager singleton already exists');
      return JobManager.instance;
    }
    
    console.log('✅ Creating JobManager singleton');
    JobManager.instance = this;
    this.init();
  }
  
  public static getInstance(): JobManager {
    if (!JobManager.instance) {
      new JobManager();
    }
    return JobManager.instance!;
  }
  
  private async init(): Promise<void> {
    // Restore minimal state from session storage on boot
    try {
      const { inflightKeys } = await chrome.storage.session.get("inflightKeys");
      if (inflightKeys && Array.isArray(inflightKeys)) {
        console.log(`Found ${inflightKeys.length} inflight keys from previous session - clearing stale markers`);
        // Don't restore promises (impossible), just clean up storage
        await chrome.storage.session.remove("inflightKeys");
      }
    } catch (error) {
      console.warn('Failed to restore session state:', error);
    }
  }
  
  /**
   * Get existing job or create new one with idempotency guarantee
   * Same key will always return the same promise
   */
  async getOrCreate<T>(keyInput: AnalysisKeyInput, runner: () => Promise<T>): Promise<T> {
    const key = analysisKey(keyInput);
    const sequence = ++this.sequenceCounter;
    
    console.info(`[JobManager seq=${sequence}] REQUEST key=${key}`);
    
    // Check if job already exists
    const existing = this.inflight.get(key);
    if (existing) {
      console.info(`[JobManager seq=${sequence}] DUPLICATE key=${key} - returning existing promise`);
      return existing.promise as Promise<T>;
    }
    
    // Create new job with promise that we can resolve/reject
    let resolve!: (value: T) => void;
    let reject!: (error: any) => void;
    
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    
    const job: Job = {
      key,
      createdAt: Date.now(),
      state: "queued",
      url: keyInput.url,
      promise: promise as Promise<any>,
      resolve: resolve as any,
      reject: reject as any,
      metadata: {
        model: keyInput.model,
        provider: keyInput.model.includes('gpt') ? 'openai' : 'gemini',
        paramsHash: keyInput.paramsHash,
        viewport: keyInput.viewport
      }
    };
    
    // Store in memory and session storage
    this.inflight.set(key, job);
    await this.updateSessionStorage();
    
    console.info(`[JobManager seq=${sequence}] CREATE key=${key} - starting runner`);
    
    // Run the job (async, don't await here)
    this.executeJob(job, runner, sequence);
    
    return promise;
  }
  
  /**
   * Execute a job with proper error handling and cleanup
   */
  private async executeJob<T>(job: Job, runner: () => Promise<T>, sequence: number): Promise<void> {
    try {
      job.state = "running";
      console.info(`[JobManager seq=${sequence}] RUNNING key=${job.key}`);
      
      const result = await runner();
      
      job.state = "succeeded";
      job.result = result;
      console.info(`[JobManager seq=${sequence}] SUCCESS key=${job.key}`);
      
      job.resolve(result);
      
    } catch (error) {
      job.state = "failed";
      job.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JobManager seq=${sequence}] FAILED key=${job.key} error=${job.error}`);
      
      job.reject(error);
      
    } finally {
      // Save job completion status to persistent storage
      await this.saveJobStatus(job);
      
      // Clean up after much longer delay for durability (10 minutes)
      setTimeout(() => {
        this.inflight.delete(job.key);
        this.updateSessionStorage();
        console.info(`[JobManager seq=${sequence}] CLEANUP key=${job.key}`);
      }, 10 * 60 * 1000); // 10 minutes cleanup delay for durability
    }
  }
  
  /**
   * Cancel a job by key
   */
  async cancelJob(key: string): Promise<boolean> {
    const job = this.inflight.get(key);
    if (!job) {
      return false;
    }
    
    if (job.state === "queued" || job.state === "running") {
      job.state = "cancelled";
      job.reject(new Error('Job cancelled by user'));
      this.inflight.delete(key);
      await this.updateSessionStorage();
      console.info(`[JobManager] CANCELLED key=${key}`);
      return true;
    }
    
    return false;
  }
  
  /**
   * Get job status by key
   */
  getJobStatus(key: string): { state: JobState; result?: any; error?: string } | null {
    const job = this.inflight.get(key);
    if (!job) {
      return null;
    }
    
    return {
      state: job.state,
      result: job.result,
      error: job.error
    };
  }
  
  /**
   * Get all active jobs for debugging
   */
  getAllActiveJobs(): Array<{ key: string; state: JobState; url: string; createdAt: number }> {
    return Array.from(this.inflight.values()).map(job => ({
      key: job.key,
      state: job.state,
      url: job.url,
      createdAt: job.createdAt
    }));
  }
  
  /**
   * Update session storage with current inflight keys
   */
  private async updateSessionStorage(): Promise<void> {
    try {
      const inflightKeys = Array.from(this.inflight.keys());
      await chrome.storage.session.set({ inflightKeys });
    } catch (error) {
      console.warn('Failed to update session storage:', error);
    }
  }
  
  /**
   * Save job completion status to persistent storage for durability
   */
  private async saveJobStatus(job: Job): Promise<void> {
    if (job.state === 'succeeded' || job.state === 'failed') {
      try {
        const statusKey = `jobStatus:${job.key}`;
        const jobStatus = {
          key: job.key,
          url: job.url,
          state: job.state,
          completedAt: Date.now(),
          error: job.error,
          metadata: job.metadata
        };
        
        await chrome.storage.local.set({ [statusKey]: jobStatus });
        console.info(`[JobManager] Saved persistent job status: ${job.key} = ${job.state}`);
      } catch (error) {
        console.warn('Failed to save job status:', error);
      }
    }
  }
  
  /**
   * Get job status from persistent storage (for rehydration)
   */
  async getPersistedJobStatus(key: string): Promise<{ state: JobState; error?: string; completedAt?: number } | null> {
    try {
      const statusKey = `jobStatus:${key}`;
      const result = await chrome.storage.local.get(statusKey);
      const status = result[statusKey];
      
      if (status) {
        // Check if status is still valid (within 2 days)
        const age = Date.now() - (status.completedAt || 0);
        const maxAge = 2 * 24 * 60 * 60 * 1000; // 2 days
        
        if (age < maxAge) {
          return {
            state: status.state,
            error: status.error,
            completedAt: status.completedAt
          };
        } else {
          // Clean up expired status
          chrome.storage.local.remove(statusKey);
        }
      }
    } catch (error) {
      console.warn('Failed to get persisted job status:', error);
    }
    
    return null;
  }
  
  /**
   * Find completed job for a URL (for popup rehydration)
   */
  async findCompletedJobForUrl(url: string, settings: any): Promise<{ key: string; status: any } | null> {
    try {
      // Generate the key that would be used for this URL using centralized utilities
      const paramsHash = generateParamsHash(settings);
      const keyInput: AnalysisKeyInput = {
        url,
        model: settings.openaiModel || settings.geminiModel,
        paramsHash,
        viewport: '1920x1080'
      };
      
      const key = analysisKey(keyInput);
      const status = await this.getPersistedJobStatus(key);
      
      if (status && status.state === 'succeeded') {
        return { key, status };
      }
    } catch (error) {
      console.warn('Failed to find completed job for URL:', error);
    }
    
    return null;
  }
  
  
  /**
   * Clean up old jobs to prevent memory leaks
   */
  cleanup(maxAge: number = 2 * 24 * 60 * 60 * 1000): void { // 2 days default
    const cutoff = Date.now() - maxAge;
    let cleaned = 0;
    
    for (const [key, job] of this.inflight.entries()) {
      if (job.createdAt < cutoff && (job.state === "succeeded" || job.state === "failed" || job.state === "cancelled")) {
        this.inflight.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.info(`[JobManager] CLEANUP removed ${cleaned} old jobs`);
      this.updateSessionStorage();
    }
  }
}

/**
 * Global cleanup interval for job manager
 * Run every 5 minutes to clean up old completed jobs
 */
setInterval(() => {
  try {
    const jobManager = JobManager.getInstance();
    jobManager.cleanup();
  } catch (error) {
    console.warn('JobManager cleanup failed:', error);
  }
}, 5 * 60 * 1000); // 5 minutes

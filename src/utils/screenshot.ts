export interface ScreenshotCaptureOptions {
  fullPage?: boolean;
  maxScreenshots?: number;
  scrollDelay?: number;
  progressCallback?: (current: number, total: number) => void;
}

export interface ScreenshotResult {
  screenshots: string[];
  totalCaptured: number;
  totalSize: number;
  compressed: boolean;
}

export class ScreenshotCapture {
  /**
   * Captures a screenshot of the current active tab
   * @returns Promise<string> Base64 encoded screenshot data (without data URL prefix)
   */
  static async captureActiveTab(): Promise<string> {
    try {
      // Get the current active tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]?.id) {
        throw new Error('No active tab found');
      }

      // Capture screenshot of the visible area with retry logic
      const dataUrl = await this.captureWithRetry(tabs[0].windowId, 3);
      if (!dataUrl) {
        throw new Error('Failed to capture screenshot after retries due to quota limits');
      }

      // Remove the data:image/png;base64, prefix to get just the base64 data
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
      
      // Apply 30% compression for better token efficiency
      return await this.compressScreenshot(base64Data, 0.4); // 60% reduction
    } catch (error) {
      console.error('Screenshot capture failed:', error);
      throw new Error(`Failed to capture screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Captures multiple screenshots of the full page by scrolling systematically
   * @param options Configuration options for full page capture
   * @returns Promise<ScreenshotResult> Array of base64 screenshots and metadata
   */
  static async captureFullPage(options: ScreenshotCaptureOptions = {}): Promise<ScreenshotResult> {
    const {
      maxScreenshots = 12,
      scrollDelay = 500,
      progressCallback
    } = options;

    try {
      // Get the current active tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]?.id) {
        throw new Error('No active tab found');
      }

      const tabId = tabs[0].id;
      const windowId = tabs[0].windowId;

      console.log('Starting full page capture for tab:', tabId);

      // Get accurate page dimensions with better detection and scroll preparation
      const pageInfo = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Reset scroll position to top first
          window.scrollTo({ top: 0, behavior: 'instant' });
          
          // Get viewport height
          const vh = window.innerHeight;
          
          // Get total page height using multiple methods for accuracy
          const bodyScrollHeight = document.body.scrollHeight || 0;
          const bodyOffsetHeight = document.body.offsetHeight || 0;
          const docClientHeight = document.documentElement.clientHeight || 0;
          const docScrollHeight = document.documentElement.scrollHeight || 0;
          const docOffsetHeight = document.documentElement.offsetHeight || 0;
          
          const th = Math.max(
            bodyScrollHeight,
            bodyOffsetHeight,
            docScrollHeight,
            docOffsetHeight,
            // Also check the computed height of all elements
            Array.from(document.body.children).reduce((maxHeight, elem) => {
              const rect = elem.getBoundingClientRect();
              return Math.max(maxHeight, rect.bottom + window.pageYOffset);
            }, 0)
          );

          console.log('Page dimension analysis:', {
            viewport: vh,
            bodyScrollHeight,
            bodyOffsetHeight,
            docScrollHeight,
            docOffsetHeight,
            finalHeight: th
          });

          // Ensure consistent scroll behavior for precise positioning
          const originalBehavior = document.documentElement.style.scrollBehavior;
          document.documentElement.style.scrollBehavior = 'auto';
          document.body.style.scrollBehavior = 'auto';

          return {
            viewportHeight: vh,
            totalHeight: th,
            originalBehavior: originalBehavior
          };
        }
      });

      if (!pageInfo || !pageInfo[0] || !pageInfo[0].result) {
        throw new Error('Cannot get page dimensions');
      }

      const { viewportHeight, totalHeight } = pageInfo[0].result;
      
      console.log('Page info:', { viewportHeight, totalHeight });

      // Calculate screenshots needed
      const screenshotsNeeded = Math.min(
        Math.ceil(totalHeight / viewportHeight),
        maxScreenshots
      );

      console.log('Screenshots needed:', screenshotsNeeded);

      const screenshots: string[] = [];
      let totalSize = 0;
      let anyCompressed = false;

      // Scroll to top first
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          window.scrollTo({ top: 0, behavior: 'instant' });
        }
      });

      await this.delay(scrollDelay);

      // Capture screenshots sequentially with improved positioning
      for (let i = 0; i < screenshotsNeeded; i++) {
        console.log(`Capturing screenshot ${i + 1}/${screenshotsNeeded}`);
        progressCallback?.(i + 1, screenshotsNeeded);

        // Calculate scroll position with slight overlap to ensure continuity
        const overlapPixels = 50; // 50px overlap to ensure smooth transitions
        let scrollTop = 0;
        
        if (i === 0) {
          scrollTop = 0; // First screenshot starts at the very top
        } else {
          scrollTop = (i * viewportHeight) - overlapPixels;
        }
        
        // Ensure we don't scroll past the bottom
        const maxScrollTop = Math.max(0, totalHeight - viewportHeight);
        scrollTop = Math.min(scrollTop, maxScrollTop);

        console.log(`Positioning for screenshot ${i + 1}: scrollTop=${scrollTop}, viewportHeight=${viewportHeight}`);

        // Scroll to precise position and verify
        const scrollResult = await chrome.scripting.executeScript({
          target: { tabId },
          func: (targetScrollY, expectedViewportHeight) => {
            // Set scroll position
            window.scrollTo({ top: targetScrollY, behavior: 'instant' });
            
            // Force reflow to ensure positioning is complete
            document.documentElement.offsetHeight;
            
            // Verify position
            const actualScrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const actualViewportHeight = window.innerHeight;
            
            console.log(`Scroll verification: requested=${targetScrollY}, actual=${actualScrollTop}, viewport=${actualViewportHeight}`);
            
            return {
              requestedScrollTop: targetScrollY,
              actualScrollTop,
              viewportHeight: actualViewportHeight,
              success: Math.abs(actualScrollTop - targetScrollY) < 10 // Allow 10px tolerance
            };
          },
          args: [scrollTop, viewportHeight]
        });

        const scrollVerification = scrollResult?.[0]?.result;
        if (!scrollVerification?.success) {
          console.warn(`Scroll positioning may be inaccurate for screenshot ${i + 1}`);
        }

        // Wait for content to settle
        await this.delay(scrollDelay);

        // Capture screenshot with retry logic for quota limits
        const dataUrl = await this.captureWithRetry(windowId, 3);
        if (!dataUrl) {
          console.warn(`Failed to capture screenshot ${i + 1}/${screenshotsNeeded}, skipping`);
          continue;
        }

        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
        
        // Apply compression to all screenshots for token efficiency
        const originalSize = this.getEstimatedSize(base64Data);
        console.log(`Screenshot ${i + 1} original size: ${Math.round(originalSize / 1024)}KB`);
        
        const finalScreenshot = await this.compressScreenshot(base64Data, 0.4); // 60% reduction
        const compressedSize = this.getEstimatedSize(finalScreenshot);
        console.log(`Screenshot ${i + 1} compressed size: ${Math.round(compressedSize / 1024)}KB (${Math.round((1 - compressedSize/originalSize) * 100)}% reduction)`);
        
        anyCompressed = true;

        screenshots.push(finalScreenshot);
        totalSize += this.getEstimatedSize(finalScreenshot);

        // Check if we've captured the full page (with some tolerance)
        const currentScrollTop = scrollVerification?.actualScrollTop || scrollTop;
        const remainingContent = totalHeight - (currentScrollTop + viewportHeight);
        
        console.log(`After screenshot ${i + 1}: scrollTop=${currentScrollTop}, remaining=${remainingContent}px`);
        
        if (remainingContent <= 100) { // Less than 100px remaining
          console.log(`Full page captured at screenshot ${i + 1}, remaining content: ${remainingContent}px`);
          break;
        }

        // Additional delay between screenshots to respect Chrome's quota
        if (i < screenshotsNeeded - 1) {
          await this.delay(1200); // 1.2 second delay between screenshots
        }

        // Check total size limit (increased since we're compressing better)
        if (totalSize > 20 * 1024 * 1024) { // Increased to 20MB since we have better compression
          console.warn(`Stopping at screenshot ${i + 1} due to size limit (${Math.round(totalSize / 1024 / 1024)}MB)`);
          break;
        }
      }

      // Reset scroll to top
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          window.scrollTo({ top: 0, behavior: 'instant' });
        }
      });

      console.log(`Captured ${screenshots.length} screenshots, total size: ${Math.round(totalSize / 1024 / 1024)}MB`);

      return {
        screenshots,
        totalCaptured: screenshots.length,
        totalSize,
        compressed: anyCompressed
      };

    } catch (error) {
      console.error('Full page screenshot capture failed:', error);
      throw new Error(`Screenshot capture failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if screenshot capture is supported and available
   * @returns boolean
   */
  static isSupported(): boolean {
    return typeof chrome?.tabs?.captureVisibleTab === 'function';
  }

  /**
   * Get estimated file size of screenshot (for optimization)
   * @param base64Data Base64 encoded image data
   * @returns number Size in bytes
   */
  static getEstimatedSize(base64Data: string): number {
    // Base64 encoding increases size by ~33%, so decode to get original size
    return Math.floor(base64Data.length * 0.75);
  }

  /**
   * Compress screenshot by specified ratio for token efficiency
   * @param base64Data Original base64 data
   * @param targetRatio Target size ratio (0.4 = 60% compression)
   * @returns Promise<string> Compressed base64 data
   */
  static async compressScreenshot(base64Data: string, targetRatio: number = 0.4): Promise<string> {
    try {
      // For service worker context, check if we have access to DOM
      if (typeof document === 'undefined' || !document.createElement) {
        console.warn('Canvas not available in this context, returning original image');
        return base64Data;
      }

      // Create canvas for compression
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.warn('Canvas context not available, returning original image');
        return base64Data;
      }

      // Create image from base64
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image for compression'));
        img.src = `data:image/png;base64,${base64Data}`;
      });

      console.log(`Original image dimensions: ${img.width}x${img.height}`);

      // Calculate dimensions for target compression - more aggressive reduction
      const dimensionRatio = Math.sqrt(targetRatio);
      const newWidth = Math.floor(img.width * dimensionRatio);
      const newHeight = Math.floor(img.height * dimensionRatio);

      console.log(`Target compressed dimensions: ${newWidth}x${newHeight} (${Math.round(dimensionRatio * 100)}% scale)`);

      // Resize image with better quality settings
      canvas.width = newWidth;
      canvas.height = newHeight;
      
      // Use better image smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, newWidth, newHeight);

      // Convert to JPEG with aggressive compression for token efficiency
      const jpegQuality = 0.6; // Fixed 60% quality for consistent compression
      const compressedDataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
      
      const originalSize = this.getEstimatedSize(base64Data);
      const compressedSize = this.getEstimatedSize(compressedDataUrl.replace(/^data:image\/jpeg;base64,/, ''));
      const compressionRatio = compressedSize / originalSize;
      
      console.log(`Compression results: ${Math.round(originalSize / 1024)}KB → ${Math.round(compressedSize / 1024)}KB (${Math.round((1 - compressionRatio) * 100)}% reduction)`);
      
      return compressedDataUrl.replace(/^data:image\/jpeg;base64,/, '');

    } catch (error) {
      console.warn('Screenshot compression failed, returning original image:', error);
      return base64Data;
    }
  }

  /**
   * Legacy method - compress base64 image if it's too large for API limits
   * @param base64Data Original base64 data
   * @param maxSizeBytes Maximum allowed size in bytes
   * @returns Promise<string> Compressed base64 data
   */
  static async compressIfNeeded(base64Data: string, maxSizeBytes: number = 4 * 1024 * 1024): Promise<string> {
    const currentSize = this.getEstimatedSize(base64Data);
    
    if (currentSize <= maxSizeBytes) {
      // Still apply 30% compression even if under limit for token efficiency
      return await this.compressScreenshot(base64Data, 0.4);
    }

    // For oversized images, calculate needed compression
    const targetRatio = Math.min(0.7, maxSizeBytes / currentSize);
    return await this.compressScreenshot(base64Data, targetRatio);
  }

  /**
   * Helper function to delay execution
   * @param ms Milliseconds to delay
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Capture screenshot with retry logic for quota limits
   */
  private static async captureWithRetry(windowId: number, maxRetries: number = 3): Promise<string | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
          format: 'png',
          quality: 85
        });
        return dataUrl;
      } catch (error) {
        console.warn(`Screenshot capture attempt ${attempt} failed:`, error);
        
        if (error instanceof Error && error.message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
          // Wait exponentially longer for quota errors
          const waitTime = 2000 * Math.pow(2, attempt - 1); // 2s, 4s, 8s
          console.log(`Quota exceeded, waiting ${waitTime}ms before retry ${attempt}/${maxRetries}`);
          await this.delay(waitTime);
          
          if (attempt === maxRetries) {
            console.error('Max retries reached for screenshot capture');
            return null;
          }
        } else {
          // For other errors, fail immediately
          console.error('Non-quota error in screenshot capture:', error);
          return null;
        }
      }
    }
    return null;
  }

}

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

      // Capture screenshot of the visible area
      const dataUrl = await chrome.tabs.captureVisibleTab(tabs[0].windowId, {
        format: 'png',
        quality: 85 // Good quality while keeping file size reasonable
      });

      // Remove the data:image/png;base64, prefix to get just the base64 data
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
      
      return base64Data;
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

      // Simple approach: Get dimensions without injecting complex scripts
      const pageInfo = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const vh = window.innerHeight;
          const th = Math.max(
            document.body.scrollHeight || 0,
            document.body.offsetHeight || 0,
            document.documentElement.clientHeight || 0,
            document.documentElement.scrollHeight || 0,
            document.documentElement.offsetHeight || 0
          );
          
          // Set scroll behavior to instant for precise positioning
          const originalBehavior = document.documentElement.style.scrollBehavior;
          document.documentElement.style.scrollBehavior = 'auto';
          
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

      // Capture screenshots sequentially
      for (let i = 0; i < screenshotsNeeded; i++) {
        console.log(`Capturing screenshot ${i + 1}/${screenshotsNeeded}`);
        progressCallback?.(i + 1, screenshotsNeeded);

        const scrollTop = i * viewportHeight;

        // Scroll to position
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (scrollY) => {
            window.scrollTo({ top: scrollY, behavior: 'instant' });
          },
          args: [scrollTop]
        });

        // Wait for content to load
        await this.delay(scrollDelay);

        // Capture screenshot
        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
          format: 'png',
          quality: 85
        });

        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
        
        // Check size and compress if needed (reduced from 2MB to 1.5MB for 25% more compression)
        const originalSize = this.getEstimatedSize(base64Data);
        let finalScreenshot = base64Data;
        
        const compressionLimit = Math.floor(2 * 1024 * 1024 * 0.75); // 25% more compression
        if (originalSize > compressionLimit) {
          finalScreenshot = await this.compressIfNeeded(base64Data, compressionLimit);
          anyCompressed = true;
        } else {
          // Apply additional 25% compression even if under the limit
          finalScreenshot = await this.compressIfNeeded(base64Data, Math.floor(originalSize * 0.75));
          anyCompressed = true;
        }

        screenshots.push(finalScreenshot);
        totalSize += this.getEstimatedSize(finalScreenshot);

        // Check total size limit
        if (totalSize > 18 * 1024 * 1024) {
          console.warn(`Stopping at screenshot ${i + 1} due to size limit`);
          break;
        }

        // Check if we've reached the bottom
        const scrollCheck = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const currentViewportHeight = window.innerHeight;
            const currentTotalHeight = Math.max(
              document.body.scrollHeight || 0,
              document.documentElement.scrollHeight || 0
            );
            
            return {
              isAtBottom: currentScrollTop + currentViewportHeight >= currentTotalHeight - 50
            };
          }
        });

        if (scrollCheck?.[0]?.result?.isAtBottom) {
          console.log(`Reached bottom at screenshot ${i + 1}`);
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
   * Compress base64 image if it's too large for API limits
   * @param base64Data Original base64 data
   * @param maxSizeBytes Maximum allowed size in bytes
   * @returns Promise<string> Compressed base64 data
   */
  static async compressIfNeeded(base64Data: string, maxSizeBytes: number = 4 * 1024 * 1024): Promise<string> {
    const currentSize = this.getEstimatedSize(base64Data);
    
    if (currentSize <= maxSizeBytes) {
      return base64Data;
    }

    try {
      // Create canvas for compression
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context not available');

      // Create image from base64
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = `data:image/png;base64,${base64Data}`;
      });

      // Calculate compression ratio to meet size limit
      const compressionRatio = Math.sqrt(maxSizeBytes / currentSize);
      const newWidth = Math.floor(img.width * compressionRatio);
      const newHeight = Math.floor(img.height * compressionRatio);

      // Resize image
      canvas.width = newWidth;
      canvas.height = newHeight;
      ctx.drawImage(img, 0, 0, newWidth, newHeight);

      // Convert back to base64 with JPEG compression for better size reduction
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
      return compressedDataUrl.replace(/^data:image\/jpeg;base64,/, '');

    } catch (error) {
      console.warn('Image compression failed, using original:', error);
      return base64Data;
    }
  }

  /**
   * Helper function to delay execution
   * @param ms Milliseconds to delay
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

}

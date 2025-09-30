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
      
      // Apply 35% compression for better API cost efficiency
      return await this.compressScreenshot(base64Data, 0.35); // 65% reduction
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
      maxScreenshots = 20,
      scrollDelay = 200, // Reduced from 500ms to 200ms for faster capture
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

      // Get accurate page dimensions with persistent header detection
      const pageInfo = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Reset scroll position to top first
          window.scrollTo({ top: 0, behavior: 'instant' });
          
          // Get viewport height
          const vh = window.innerHeight;
          
          // Detect persistent headers that reduce visible content area
          const detectPersistentHeaders = () => {
            const fixedElements: Array<{element: Element, height: number, top: number}> = [];
            
            // Find elements with fixed or sticky positioning
            const allElements = document.querySelectorAll('*');
            
            for (const element of allElements) {
              const style = window.getComputedStyle(element);
              const position = style.position;
              
              // Check for fixed or sticky positioning
              if (position === 'fixed' || position === 'sticky') {
                const rect = element.getBoundingClientRect();
                const height = rect.height;
                const top = rect.top;
                
                // Only consider elements that are:
                // 1. Actually visible (height > 0)
                // 2. At the top of the viewport (top <= 50px from top)
                // 3. Have meaningful height (at least 20px)
                if (height > 20 && top <= 50 && rect.bottom > 0) {
                  fixedElements.push({ element, height, top });
                }
              }
            }
            
            // Sort by top position and height to find the most prominent header
            fixedElements.sort((a, b) => {
              if (Math.abs(a.top - b.top) < 10) {
                // If at similar top positions, prefer taller elements
                return b.height - a.height;
              }
              return a.top - b.top;
            });
            
            // Calculate total header height
            let totalHeaderHeight = 0;
            let lastBottom = 0;
            
            for (const fixed of fixedElements) {
              const rect = fixed.element.getBoundingClientRect();
              
              // Only count if this element doesn't overlap significantly with previous ones
              if (rect.top >= lastBottom - 10) {
                totalHeaderHeight += rect.height;
                lastBottom = rect.bottom;
              }
            }
            
            return {
              totalHeaderHeight: Math.min(totalHeaderHeight, vh * 0.3), // Cap at 30% of viewport
              headerElements: fixedElements.length,
              detectedHeaders: fixedElements.map(f => ({
                tag: f.element.tagName,
                height: f.height,
                top: f.top,
                className: f.element.className
              }))
            };
          };
          
          const headerInfo = detectPersistentHeaders();
          
          // Calculate usable viewport height (excluding persistent headers)
          const usableViewportHeight = Math.max(
            vh - headerInfo.totalHeaderHeight,
            vh * 0.7 // Ensure we don't go below 70% of viewport
          );
          
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

          console.log('Page dimension analysis with header detection:', {
            viewport: vh,
            headerHeight: headerInfo.totalHeaderHeight,
            usableViewport: usableViewportHeight,
            headerElements: headerInfo.headerElements,
            detectedHeaders: headerInfo.detectedHeaders,
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
            usableViewportHeight: usableViewportHeight,
            totalHeight: th,
            headerInfo: headerInfo,
            originalBehavior: originalBehavior
          };
        }
      });

      if (!pageInfo || !pageInfo[0] || !pageInfo[0].result) {
        throw new Error('Cannot get page dimensions');
      }

      const { viewportHeight, usableViewportHeight, totalHeight, headerInfo } = pageInfo[0].result;
      
      console.log('Page info with header detection:', { 
        viewportHeight, 
        usableViewportHeight, 
        totalHeight, 
        headerInfo 
      });

      // Use usable viewport height for calculations to avoid content loss
      const effectiveViewportHeight = usableViewportHeight;

      // Calculate screenshots needed using effective viewport height
      const screenshotsNeeded = Math.min(
        Math.ceil(totalHeight / effectiveViewportHeight),
        maxScreenshots
      );

      console.log('Screenshots needed with header compensation:', screenshotsNeeded);

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

      await this.delay(Math.min(scrollDelay, 150)); // Cap initial delay at 150ms for faster start

      // Capture screenshots sequentially with improved positioning
      for (let i = 0; i < screenshotsNeeded; i++) {
        console.log(`Capturing screenshot ${i + 1}/${screenshotsNeeded}`);
        progressCallback?.(i + 1, screenshotsNeeded);

        // Calculate scroll position with slight overlap to ensure continuity
        // Use effective viewport height to account for persistent headers
        const overlapPixels = 50; // 50px overlap to ensure smooth transitions
        let scrollTop = 0;
        
        if (i === 0) {
          scrollTop = 0; // First screenshot starts at the very top
        } else {
          scrollTop = (i * effectiveViewportHeight) - overlapPixels;
        }
        
        // Ensure we don't scroll past the bottom
        const maxScrollTop = Math.max(0, totalHeight - effectiveViewportHeight);
        scrollTop = Math.min(scrollTop, maxScrollTop);

        console.log(`Positioning for screenshot ${i + 1}: scrollTop=${scrollTop}, effectiveViewportHeight=${effectiveViewportHeight}`);

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
          args: [scrollTop, effectiveViewportHeight]
        });

        const scrollVerification = scrollResult?.[0]?.result;
        if (!scrollVerification?.success) {
          console.warn(`Scroll positioning may be inaccurate for screenshot ${i + 1}`);
        }

        // Wait for content to settle - reduced delay for faster capture
        await this.delay(Math.min(scrollDelay, 100)); // Cap wait time at 100ms per screenshot

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
        
        try {
          const finalScreenshot = await this.compressScreenshot(base64Data, 0.35); // 65% reduction for 35% of original size
          const compressedSize = this.getEstimatedSize(finalScreenshot);
          const reductionPct = Math.round((1 - compressedSize/originalSize) * 100);
          console.log(`Screenshot ${i + 1} compressed size: ${Math.round(compressedSize / 1024)}KB (${reductionPct}% reduction)`);
          
          // Use compressed image
          screenshots.push(finalScreenshot);
          totalSize += compressedSize;
          anyCompressed = true;
        } catch (compressionError) {
          console.warn(`Screenshot ${i + 1} compression failed, using original:`, compressionError);
          // Fallback: use original image if compression fails
          screenshots.push(base64Data);
          totalSize += originalSize;
        }

        // Check if we've captured the full page (with some tolerance)
        const currentScrollTop = scrollVerification?.actualScrollTop || scrollTop;
        const remainingContent = totalHeight - (currentScrollTop + effectiveViewportHeight);
        const remainingContentPercentage = remainingContent / effectiveViewportHeight;
        
        console.log(`After screenshot ${i + 1}: scrollTop=${currentScrollTop}, remaining=${remainingContent}px (${Math.round(remainingContentPercentage * 100)}% of viewport)`);
        
        if (remainingContent <= 50) { // Absolute minimum threshold
          console.log(`Full page captured at screenshot ${i + 1}, remaining content: ${remainingContent}px`);
          break;
        }
        
        // Skip last screenshot if remaining content is less than 25% of viewport
        // This saves tokens by avoiding screenshots of mostly empty space (footers, etc.)
        if (remainingContentPercentage < 0.25 && i > 0) {
          console.log(`Skipping final screenshot ${i + 1} - only ${Math.round(remainingContentPercentage * 100)}% of viewport would contain new content (footer/empty space)`);
          break;
        }

        // Reduced delay between screenshots for faster capture while respecting Chrome's quota
        if (i < screenshotsNeeded - 1) {
          await this.delay(600); // Reduced from 1200ms to 600ms for 2x faster capture
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

      // Restore original scroll behavior
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (originalBehavior) => {
          if (originalBehavior) {
            document.documentElement.style.scrollBehavior = originalBehavior;
            document.body.style.scrollBehavior = originalBehavior;
          }
        },
        args: [pageInfo[0].result.originalBehavior]
      });

      console.log(`Full page capture complete: ${screenshots.length} screenshots, total size: ${Math.round(totalSize / 1024 / 1024)}MB`);

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
      // For service worker context, delegate compression to offscreen document
      if (typeof document === 'undefined' || !document.createElement) {
        console.log('Service worker context detected - delegating compression to offscreen document');
        
        try {
          // Send compression request to offscreen document where Canvas is available
          const response = await chrome.runtime.sendMessage({
            type: 'COMPRESS_IMAGE',
            base64Data: base64Data,
            targetRatio: targetRatio
          });
          
          if (response?.ok && response.compressedData) {
            const originalSize = this.getEstimatedSize(base64Data);
            const compressedSize = this.getEstimatedSize(response.compressedData);
            const compressionRatio = compressedSize / originalSize;
            
            console.log(`Compression via offscreen: ${Math.round(originalSize / 1024)}KB → ${Math.round(compressedSize / 1024)}KB (${Math.round((1 - compressionRatio) * 100)}% reduction)`);
            return response.compressedData;
          } else {
            console.warn('Offscreen compression failed, returning original image');
            return base64Data;
          }
        } catch (offscreenError) {
          console.warn('Failed to communicate with offscreen document for compression:', offscreenError);
          return base64Data;
        }
      }

      // Direct compression when Canvas is available (offscreen context)
      return await this.compressImageDirect(base64Data, targetRatio);

    } catch (error) {
      console.warn('Screenshot compression failed, returning original image:', error);
      return base64Data;
    }
  }

  /**
   * Direct image compression using Canvas (only works where DOM is available)
   * @param base64Data Original base64 data
   * @param targetRatio Target size ratio
   * @returns Promise<string> Compressed base64 data
   */
  private static async compressImageDirect(base64Data: string, targetRatio: number): Promise<string> {
    // Create canvas for compression
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas context not available');
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

    // Convert to JPEG with aggressive compression for API cost efficiency
    const jpegQuality = 0.4; // Reduced to 40% quality for better compression
    const compressedDataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
    
    const originalSize = this.getEstimatedSize(base64Data);
    const compressedSize = this.getEstimatedSize(compressedDataUrl.replace(/^data:image\/jpeg;base64,/, ''));
    const compressionRatio = compressedSize / originalSize;
    
    console.log(`Direct compression results: ${Math.round(originalSize / 1024)}KB → ${Math.round(compressedSize / 1024)}KB (${Math.round((1 - compressionRatio) * 100)}% reduction)`);
    
    return compressedDataUrl.replace(/^data:image\/jpeg;base64,/, '');
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
      // Still apply 35% compression even if under limit for API cost efficiency
      return await this.compressScreenshot(base64Data, 0.35);
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
          // Reduced wait time for quota errors to speed up recovery
          const waitTime = 800 * Math.pow(1.5, attempt - 1); // 800ms, 1200ms, 1800ms (faster recovery)
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

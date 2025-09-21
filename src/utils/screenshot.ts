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
}

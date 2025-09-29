/**
 * Notification Manager for CRO Djinn Extension
 * Handles progress indicators, completion notifications, and badge management
 */

export interface NotificationOptions {
  title: string;
  message: string;
  iconUrl?: string;
  type?: chrome.notifications.TemplateType;
  priority?: number;
  buttons?: Array<{ title: string; iconUrl?: string }>;
}

export interface ProgressNotificationOptions extends NotificationOptions {
  progress?: number; // 0-100
  step?: string;
}

export class NotificationManager {
  private static readonly ICON_PATH = 'icons/CRO-Djinn Logo.png';
  private static readonly PROGRESS_NOTIFICATION_ID = 'cro-genie-progress';
  private static readonly COMPLETION_NOTIFICATION_ID = 'cro-genie-complete';
  
  // Badge colors for different states
  private static readonly BADGE_COLORS = {
    scanning: '#1976d2', // Blue
    analyzing: '#ff9800', // Orange
    success: '#4caf50',   // Green
    error: '#f44336'      // Red
  };

  private static activeProgressNotification: string | null = null;
  private static progressTimeout: NodeJS.Timeout | null = null;

  /**
   * Show progress notification with browser action badge
   */
  public static async showProgressNotification(options: ProgressNotificationOptions): Promise<void> {
    try {
      // Update browser action badge
      await this.updateBadge({
        text: '⚡',
        color: this.BADGE_COLORS.analyzing,
        title: `CRO Analysis - ${options.step || 'Processing...'}`
      });

      // Clear any existing progress notification first
      if (this.activeProgressNotification) {
        try {
          await chrome.notifications.clear(this.activeProgressNotification);
        } catch (error) {
          console.warn('Failed to clear existing notification:', error);
        }
      }

      // Create progress notification
      const notificationOptions: chrome.notifications.NotificationOptions = {
        type: options.type || 'basic',
        iconUrl: options.iconUrl || this.ICON_PATH,
        title: options.title,
        message: options.message,
        priority: options.priority || 1,
        requireInteraction: false, // Don't require user interaction for progress
        silent: true // Silent for progress updates
      };

      // Add progress bar if supported and progress provided
      if (options.progress !== undefined && options.type === 'progress') {
        (notificationOptions as any).progress = Math.max(0, Math.min(100, options.progress));
      }

      // Add buttons if provided
      if (options.buttons) {
        (notificationOptions as any).buttons = options.buttons;
      }

      this.activeProgressNotification = this.PROGRESS_NOTIFICATION_ID;
      await chrome.notifications.create(this.PROGRESS_NOTIFICATION_ID, notificationOptions);
      
      // Set timeout to clear progress notification if it runs too long (10 minutes)
      if (this.progressTimeout) {
        clearTimeout(this.progressTimeout);
      }
      
      this.progressTimeout = setTimeout(async () => {
        console.warn('📢 Progress notification timeout - clearing stale notification');
        await this.clearProgressNotification();
      }, 10 * 60 * 1000); // 10 minutes
      
      console.log(`📢 Progress notification shown: ${options.title}`);

    } catch (error) {
      console.warn('Failed to show progress notification:', error);
    }
  }

  /**
   * Update existing progress notification
   */
  public static async updateProgressNotification(options: Partial<ProgressNotificationOptions>): Promise<void> {
    try {
      if (!this.activeProgressNotification) {
        return;
      }

      const updateOptions: chrome.notifications.NotificationOptions = {};
      
      if (options.title) updateOptions.title = options.title;
      if (options.message) updateOptions.message = options.message;
      if (options.progress !== undefined) {
        (updateOptions as any).progress = Math.max(0, Math.min(100, options.progress));
      }

      // Update browser badge if step provided
      if (options.step) {
        await this.updateBadge({
          text: '⚡',
          color: this.BADGE_COLORS.analyzing,
          title: `CRO Analysis - ${options.step}`
        });
      }

      await chrome.notifications.update(this.PROGRESS_NOTIFICATION_ID, updateOptions);
      
      console.log(`📢 Progress notification updated: ${options.message || 'Progress update'}`);

    } catch (error) {
      console.warn('Failed to update progress notification:', error);
    }
  }

  /**
   * Show completion notification and clear progress indicators
   */
  public static async showCompletionNotification(options: NotificationOptions & { success?: boolean; url?: string }): Promise<void> {
    try {
      // Clear progress notification first
      await this.clearProgressNotification();

      // Update badge to success/error state
      const badgeColor = options.success !== false ? this.BADGE_COLORS.success : this.BADGE_COLORS.error;
      const badgeText = options.success !== false ? '✓' : '✗';
      
      await this.updateBadge({
        text: badgeText,
        color: badgeColor,
        title: options.title
      });

      // Create completion notification
      const notificationOptions: chrome.notifications.NotificationOptions = {
        type: options.type || 'basic',
        iconUrl: options.iconUrl || this.ICON_PATH,
        title: options.title,
        message: options.message,
        priority: options.priority || 2,
        requireInteraction: true, // Require interaction for completion
        silent: false // Not silent for completion
      };

      // Add buttons for completion notification
      if (options.success !== false) {
        (notificationOptions as any).buttons = [
          { title: 'View Results', iconUrl: this.ICON_PATH },
          { title: 'Dismiss' }
        ];
      }

      await chrome.notifications.create(this.COMPLETION_NOTIFICATION_ID, notificationOptions);
      
      console.log(`📢 Completion notification shown: ${options.title}`);

      // Auto-clear the badge after 10 seconds
      setTimeout(async () => {
        await this.clearBadge();
      }, 10000);

    } catch (error) {
      console.warn('Failed to show completion notification:', error);
    }
  }

  /**
   * Clear progress notification and reset badge
   */
  public static async clearProgressNotification(): Promise<void> {
    try {
      if (this.activeProgressNotification) {
        await chrome.notifications.clear(this.PROGRESS_NOTIFICATION_ID);
        this.activeProgressNotification = null;
      }
      
      // Clear timeout
      if (this.progressTimeout) {
        clearTimeout(this.progressTimeout);
        this.progressTimeout = null;
      }
      
      console.log('📢 Progress notification cleared');
    } catch (error) {
      console.warn('Failed to clear progress notification:', error);
    }
  }

  /**
   * Clear all notifications
   */
  public static async clearAllNotifications(): Promise<void> {
    try {
      await Promise.all([
        chrome.notifications.clear(this.PROGRESS_NOTIFICATION_ID),
        chrome.notifications.clear(this.COMPLETION_NOTIFICATION_ID)
      ]);
      
      this.activeProgressNotification = null;
      
      // Clear timeout
      if (this.progressTimeout) {
        clearTimeout(this.progressTimeout);
        this.progressTimeout = null;
      }
      
      await this.clearBadge();
      
      console.log('📢 All notifications cleared');
    } catch (error) {
      console.warn('Failed to clear all notifications:', error);
    }
  }

  /**
   * Update browser action badge
   */
  private static async updateBadge(options: { text: string; color: string; title?: string }): Promise<void> {
    try {
      await Promise.all([
        chrome.action.setBadgeText({ text: options.text }),
        chrome.action.setBadgeBackgroundColor({ color: options.color }),
        options.title ? chrome.action.setTitle({ title: options.title }) : Promise.resolve()
      ]);
    } catch (error) {
      console.warn('Failed to update badge:', error);
    }
  }

  /**
   * Clear browser action badge
   */
  private static async clearBadge(): Promise<void> {
    try {
      await Promise.all([
        chrome.action.setBadgeText({ text: '' }),
        chrome.action.setTitle({ title: 'CRO Djinn' })
      ]);
    } catch (error) {
      console.warn('Failed to clear badge:', error);
    }
  }

  /**
   * Handle notification clicks
   */
  public static setupNotificationHandlers(): void {
    // Handle notification clicks
    chrome.notifications.onClicked.addListener((notificationId) => {
      console.log(`📢 Notification clicked: ${notificationId}`);
      
      if (notificationId === this.COMPLETION_NOTIFICATION_ID) {
        // Open popup when completion notification is clicked
        chrome.action.openPopup?.();
      }
      
      // Clear the clicked notification
      chrome.notifications.clear(notificationId);
    });

    // Handle notification button clicks
    chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
      console.log(`📢 Notification button clicked: ${notificationId}, button: ${buttonIndex}`);
      
      if (notificationId === this.COMPLETION_NOTIFICATION_ID) {
        if (buttonIndex === 0) {
          // "View Results" button clicked
          chrome.action.openPopup?.();
        }
        // Button 1 is "Dismiss" - no action needed
        
        // Clear the notification
        chrome.notifications.clear(notificationId);
      }
    });

    // Handle notification closed
    chrome.notifications.onClosed.addListener((notificationId, byUser) => {
      if (notificationId === this.PROGRESS_NOTIFICATION_ID) {
        this.activeProgressNotification = null;
      }
    });

    console.log('📢 Notification handlers set up');
  }

  /**
   * Show error notification
   */
  public static async showErrorNotification(error: string, details?: string): Promise<void> {
    await this.showCompletionNotification({
      title: 'CRO Analysis Failed',
      message: details ? `${error}\n${details}` : error,
      success: false,
      priority: 2
    });
  }

  /**
   * Check if notifications are supported and enabled
   */
  public static async checkNotificationPermission(): Promise<boolean> {
    try {
      // Chrome extensions with notifications permission should have access
      return typeof chrome.notifications !== 'undefined';
    } catch (error) {
      console.warn('Notifications not available:', error);
      return false;
    }
  }
}

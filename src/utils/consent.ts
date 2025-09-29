interface ConsentData {
  domain: string;
  granted: boolean;
  timestamp: number;
}

export class ConsentManager {
  private static readonly CONSENT_KEY_PREFIX = 'consent_';
  private static readonly CONSENT_EXPIRY_DAYS = 30;

  /**
   * Check if user has granted consent for a specific domain
   */
  static async hasConsent(domain: string): Promise<boolean> {
    try {
      const key = this.getConsentKey(domain);
      const result = await chrome.storage.local.get(key);
      const consentData: ConsentData = result[key];
      
      if (!consentData) return false;
      
      // Check if consent has expired (30 days)
      const now = Date.now();
      const expiryTime = consentData.timestamp + (this.CONSENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      
      if (now > expiryTime) {
        // Remove expired consent
        await chrome.storage.local.remove(key);
        return false;
      }
      
      return consentData.granted;
    } catch (error) {
      console.error('Error checking consent:', error);
      return false;
    }
  }

  /**
   * Save user consent for a specific domain
   */
  static async saveConsent(domain: string, granted: boolean): Promise<void> {
    try {
      const key = this.getConsentKey(domain);
      const consentData: ConsentData = {
        domain,
        granted,
        timestamp: Date.now()
      };
      
      await chrome.storage.local.set({ [key]: consentData });
    } catch (error) {
      console.error('Error saving consent:', error);
      throw error;
    }
  }

  /**
   * Show consent dialog to user
   */
  static async showConsentDialog(domain: string): Promise<boolean> {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;

      // Create dialog
      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: white;
        border-radius: 8px;
        padding: 24px;
        max-width: 480px;
        margin: 20px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        text-align: center;
        line-height: 1.5;
      `;

      dialog.innerHTML = `
        <div style="margin-bottom: 16px;">
          <h3 style="margin: 0 0 12px 0; color: #1f2937; font-size: 18px;">
            🔒 Privacy Notice
          </h3>
          <p style="margin: 0; color: #4b5563; font-size: 14px;">
            CRO Djinn wants to analyze this page (<strong>${domain}</strong>) to provide conversion optimization recommendations.
          </p>
        </div>
        
        <div style="background: #f3f4f6; padding: 16px; border-radius: 6px; margin: 16px 0; text-align: left;">
          <p style="margin: 0 0 8px 0; font-weight: 600; color: #374151; font-size: 13px;">
            What data will be collected:
          </p>
          <ul style="margin: 0; padding-left: 20px; color: #6b7280; font-size: 12px;">
            <li>Page content and structure</li>
            <li>Button and form elements</li>
            <li>Page screenshots (if enabled)</li>
          </ul>
          <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 12px;">
            Data is sent to AI services (OpenAI/Google) for analysis and stored locally on your device.
          </p>
        </div>

        <div style="display: flex; gap: 12px; justify-content: center;">
          <button id="consent-deny" style="
            background: #e5e7eb;
            color: #374151;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
          ">
            Don't Analyze
          </button>
          <button id="consent-allow" style="
            background: #3b82f6;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
          ">
            Allow Analysis
          </button>
        </div>
        
        <p style="margin: 16px 0 0 0; color: #9ca3af; font-size: 11px;">
          Consent expires in 30 days. You can manage data in the extension settings.
        </p>
      `;

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // Add click handlers
      const allowBtn = dialog.querySelector('#consent-allow') as HTMLButtonElement;
      const denyBtn = dialog.querySelector('#consent-deny') as HTMLButtonElement;

      allowBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve(true);
      });

      denyBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve(false);
      });

      // Close on overlay click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          document.body.removeChild(overlay);
          resolve(false);
        }
      });

      // Close on escape key
      const escapeHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          document.body.removeChild(overlay);
          document.removeEventListener('keydown', escapeHandler);
          resolve(false);
        }
      };
      document.addEventListener('keydown', escapeHandler);
    });
  }

  /**
   * Clear all consent data
   */
  static async clearAllConsents(): Promise<void> {
    try {
      const items = await chrome.storage.local.get();
      const consentKeys = Object.keys(items).filter(key => 
        key.startsWith(this.CONSENT_KEY_PREFIX)
      );
      
      if (consentKeys.length > 0) {
        await chrome.storage.local.remove(consentKeys);
      }
    } catch (error) {
      console.error('Error clearing consents:', error);
      throw error;
    }
  }

  /**
   * Get all granted consents
   */
  static async getGrantedConsents(): Promise<string[]> {
    try {
      const items = await chrome.storage.local.get();
      const domains: string[] = [];
      
      for (const [key, value] of Object.entries(items)) {
        if (key.startsWith(this.CONSENT_KEY_PREFIX)) {
          const consentData = value as ConsentData;
          if (consentData.granted) {
            domains.push(consentData.domain);
          }
        }
      }
      
      return domains;
    } catch (error) {
      console.error('Error getting granted consents:', error);
      return [];
    }
  }

  private static getConsentKey(domain: string): string {
    return `${this.CONSENT_KEY_PREFIX}${domain}`;
  }

  private static getDomainFromUrl(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
}

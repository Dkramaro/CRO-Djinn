/**
 * Content Script-compatible Consent Manager
 * Uses message passing to background script for storage access
 */

interface ConsentData {
  domain: string;
  granted: boolean;
  timestamp: number;
}

export class ConsentProxy {
  private static readonly CONSENT_KEY_PREFIX = 'consent_';
  private static readonly CONSENT_EXPIRY_DAYS = 30;

  /**
   * Check if user has granted consent for a specific domain
   * Uses background script proxy for storage access
   */
  static async hasConsent(domain: string): Promise<boolean> {
    try {
      const key = this.getConsentKey(domain);
      const response = await chrome.runtime.sendMessage({
        type: "STORAGE_GET",
        key: key
      });
      
      if (!response?.ok) {
        console.warn('Failed to check consent via proxy:', response?.error);
        return false;
      }
      
      const consentData: ConsentData = response.data;
      
      if (!consentData) return false;
      
      // Check if consent has expired (30 days)
      const now = Date.now();
      const expiryTime = consentData.timestamp + (this.CONSENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      
      if (now > expiryTime) {
        // Remove expired consent
        await chrome.runtime.sendMessage({
          type: "STORAGE_REMOVE",
          key: key
        });
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
   * Uses background script proxy for storage access
   */
  static async saveConsent(domain: string, granted: boolean): Promise<void> {
    try {
      const key = this.getConsentKey(domain);
      const consentData: ConsentData = {
        domain,
        granted,
        timestamp: Date.now()
      };
      
      const response = await chrome.runtime.sendMessage({
        type: "STORAGE_SET",
        key: key,
        data: consentData
      });
      
      if (!response?.ok) {
        throw new Error(`Failed to save consent: ${response?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error saving consent:', error);
      throw error;
    }
  }

  /**
   * Show consent dialog to user
   * Returns true if user grants consent, false otherwise
   */
  static async showConsentDialog(domain: string): Promise<boolean> {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.id = 'cro-consent-overlay';
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
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        max-width: 500px;
        margin: 20px;
        overflow: hidden;
        animation: slideIn 0.3s ease-out;
      `;

      dialog.innerHTML = `
        <style>
          @keyframes slideIn {
            from { transform: translateY(-50px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        </style>
        <div style="padding: 24px;">
          <div style="display: flex; align-items: center; margin-bottom: 16px;">
            <div style="width: 40px; height: 40px; background: #1976d2; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-right: 12px;">
              <svg width="24" height="24" fill="white" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <h2 style="margin: 0; font-size: 18px; font-weight: 600; color: #333;">CRO Analysis Consent</h2>
          </div>
          
          <p style="margin: 0 0 16px 0; line-height: 1.5; color: #666;">
            CRO Djinn would like to analyze this page (<strong>${domain}</strong>) to provide conversion optimization insights.
          </p>
          
          <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #333;">We will collect:</h3>
            <ul style="margin: 0; padding-left: 16px; color: #666; font-size: 14px;">
              <li>Page content and structure</li>
              <li>Screenshots of the page layout</li>
              <li>Meta information (title, description)</li>
            </ul>
            <p style="margin: 8px 0 0 0; font-size: 12px; color: #888;">
              Data is processed locally and sent to AI services for analysis only. We do not store personal information.
            </p>
          </div>
          
          <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button id="cro-consent-deny" style="
              padding: 10px 20px;
              border: 1px solid #ddd;
              background: white;
              border-radius: 6px;
              cursor: pointer;
              font-size: 14px;
              font-weight: 500;
              color: #666;
            ">Decline</button>
            <button id="cro-consent-allow" style="
              padding: 10px 20px;
              border: none;
              background: #1976d2;
              color: white;
              border-radius: 6px;
              cursor: pointer;
              font-size: 14px;
              font-weight: 500;
            ">Allow Analysis</button>
          </div>
        </div>
      `;

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // Handle button clicks
      const allowBtn = dialog.querySelector('#cro-consent-allow') as HTMLButtonElement;
      const denyBtn = dialog.querySelector('#cro-consent-deny') as HTMLButtonElement;

      allowBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve(true);
      });

      denyBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve(false);
      });

      // Handle overlay click to close
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          document.body.removeChild(overlay);
          resolve(false);
        }
      });
    });
  }

  private static getConsentKey(domain: string): string {
    return `${this.CONSENT_KEY_PREFIX}${domain.replace(/[^a-zA-Z0-9]/g, '_')}`;
  }
}

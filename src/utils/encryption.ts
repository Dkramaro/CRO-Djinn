/**
 * Simple encryption utility for sensitive data
 * Uses built-in browser crypto APIs for basic protection
 */
export class EncryptionManager {
  private static readonly ALGORITHM = 'AES-GCM';
  private static readonly KEY_LENGTH = 256;
  private static readonly IV_LENGTH = 12;

  /**
   * Generate a encryption key from a password/string
   */
  private static async deriveKey(password: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    // Use a fixed salt for consistency (in production, use random salt per user)
    const salt = encoder.encode('cro-djinn-salt-2024');

    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: this.ALGORITHM, length: this.KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt a string value
   */
  static async encrypt(plaintext: string): Promise<string> {
    try {
      if (!plaintext) return plaintext;

      console.log('Encrypting data, original length:', plaintext.length);
      console.log('Original data preview:', plaintext.substring(0, 10) + '...');

      // Use a combination of extension ID and current hostname as key material
      const keyMaterial = `cro-djinn-${chrome.runtime.id}-encryption-key`;
      const key = await this.deriveKey(keyMaterial);

      const encoder = new TextEncoder();
      const data = encoder.encode(plaintext);

      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));

      const encrypted = await crypto.subtle.encrypt(
        { name: this.ALGORITHM, iv },
        key,
        data
      );

      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);

      // Convert to base64 for storage - FIXED: Avoid spread operator for large arrays
      let binaryString = '';
      for (let i = 0; i < combined.length; i++) {
        binaryString += String.fromCharCode(combined[i]);
      }
      const base64Result = btoa(binaryString);
      
      console.log('Encryption debug:', {
        plaintextLength: plaintext.length,
        dataLength: data.length,
        ivLength: iv.length,
        encryptedLength: encrypted.byteLength,
        combinedLength: combined.length,
        base64Length: base64Result.length
      });
      
      console.log('Encryption successful, base64 result length:', base64Result.length);
      console.log('Base64 result preview:', base64Result.substring(0, 20) + '...');
      
      return base64Result;
    } catch (error) {
      console.error('Encryption failed:', error);
      console.warn('Falling back to storing as plaintext');
      return plaintext; // Fallback to plaintext if encryption fails
    }
  }

  /**
   * Decrypt a string value
   */
  static async decrypt(encryptedData: string): Promise<string> {
    try {
      if (!encryptedData) return encryptedData;

      // Check if data looks encrypted (base64)
      if (!this.isBase64(encryptedData)) {
        console.log('Data is not base64, returning as-is:', encryptedData.substring(0, 20) + '...');
        return encryptedData; // Return as-is if not encrypted
      }

      // Check for reasonable length - encrypted data should be longer than original
      if (encryptedData.length < 20) {
        console.log('Encrypted data too short, returning as-is');
        return encryptedData;
      }

      const keyMaterial = `cro-djinn-${chrome.runtime.id}-encryption-key`;
      const key = await this.deriveKey(keyMaterial);

      // Convert from base64 with better error handling
      let combined: Uint8Array;
      try {
        const binaryString = atob(encryptedData);
        combined = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          combined[i] = binaryString.charCodeAt(i);
        }
      } catch (base64Error) {
        console.warn('Base64 decoding failed:', base64Error);
        return encryptedData;
      }

      // Validate combined data length
      if (combined.length < this.IV_LENGTH + 1) {
        console.warn('Encrypted data too short after base64 decode');
        return encryptedData;
      }

      // Extract IV and encrypted data
      const iv = combined.slice(0, this.IV_LENGTH);
      const encrypted = combined.slice(this.IV_LENGTH);

      console.log('Decryption debug:', {
        encryptedDataLength: encryptedData.length,
        combinedLength: combined.length,
        ivLength: iv.length,
        encryptedLength: encrypted.length
      });

      const decrypted = await crypto.subtle.decrypt(
        { name: this.ALGORITHM, iv },
        key,
        encrypted
      );

      const decoder = new TextDecoder();
      const result = decoder.decode(decrypted);
      
      // CRITICAL: Ensure result is actually a string
      if (typeof result !== 'string') {
        console.error('🔐 FATAL: TextDecoder returned non-string:', typeof result, result);
        throw new Error(`Decryption produced invalid type: ${typeof result}`);
      }
      
      // Ensure result is not empty or corrupted
      if (!result || result === '[object Object]') {
        console.error('🔐 FATAL: Decryption produced corrupted result:', result);
        throw new Error('Decryption produced corrupted or empty result');
      }
      
      console.log('Decryption successful, result length:', result.length);
      console.log('Decrypted result preview:', result.substring(0, 10) + '...');
      console.log('Decrypted result type check:', typeof result);
      
      return result;
    } catch (error) {
      console.error('🔐 CRITICAL: Decryption failed completely:', error);
      console.error('🔐 This likely means the API key is corrupted and needs to be re-entered');
      
      // Don't return encrypted data as it will fail API validation
      // Return empty string to force user to re-enter their key
      console.warn('🔐 Returning empty string - user must re-enter API key');
      return '';
    }
  }

  /**
   * Check if a string is base64 encoded
   */
  private static isBase64(str: string): boolean {
    try {
      return btoa(atob(str)) === str;
    } catch {
      return false;
    }
  }

  /**
   * Encrypt sensitive fields in settings object
   */
  static async encryptSettings(settings: any): Promise<any> {
    const encrypted = { ...settings };
    
    if (encrypted.openaiApiKey) {
      encrypted.openaiApiKey = await this.encrypt(encrypted.openaiApiKey);
    }
    
    if (encrypted.geminiApiKey) {
      encrypted.geminiApiKey = await this.encrypt(encrypted.geminiApiKey);
    }

    return encrypted;
  }

  /**
   * Decrypt sensitive fields in settings object
   */
  static async decryptSettings(settings: any): Promise<any> {
    const decrypted = { ...settings };
    
    console.log('🔐 Decrypting settings, input types:', {
      openaiKeyType: typeof decrypted.openaiApiKey,
      geminiKeyType: typeof decrypted.geminiApiKey,
      openaiKeyValue: decrypted.openaiApiKey,
      geminiKeyValue: decrypted.geminiApiKey
    });
    
    if (decrypted.openaiApiKey) {
      // CRITICAL FIX: Handle [object Object] corruption
      if (typeof decrypted.openaiApiKey !== 'string') {
        console.error('🔐 CORRUPTION DETECTED: OpenAI API key is not a string:', {
          type: typeof decrypted.openaiApiKey,
          value: decrypted.openaiApiKey,
          stringified: String(decrypted.openaiApiKey)
        });
        
        // If it's an object that stringifies to "[object Object]", clear it completely
        const stringified = String(decrypted.openaiApiKey);
        if (stringified === '[object Object]') {
          console.error('🔐 FATAL: API key corrupted to [object Object], clearing it');
          decrypted.openaiApiKey = '';
        } else {
          decrypted.openaiApiKey = stringified;
        }
      }
      
      if (decrypted.openaiApiKey) {
        decrypted.openaiApiKey = await this.decrypt(decrypted.openaiApiKey);
        
        // Ensure output is string and not corrupted
        if (typeof decrypted.openaiApiKey !== 'string') {
          console.warn('🔐 OpenAI decryption returned non-string, converting:', typeof decrypted.openaiApiKey);
          const stringified = String(decrypted.openaiApiKey);
          if (stringified === '[object Object]') {
            console.error('🔐 FATAL: Decryption produced [object Object], clearing it');
            decrypted.openaiApiKey = '';
          } else {
            decrypted.openaiApiKey = stringified;
          }
        }
      }
    }
    
    if (decrypted.geminiApiKey) {
      // CRITICAL FIX: Handle [object Object] corruption  
      if (typeof decrypted.geminiApiKey !== 'string') {
        console.error('🔐 CORRUPTION DETECTED: Gemini API key is not a string:', {
          type: typeof decrypted.geminiApiKey,
          value: decrypted.geminiApiKey,
          stringified: String(decrypted.geminiApiKey)
        });
        
        // If it's an object that stringifies to "[object Object]", clear it completely
        const stringified = String(decrypted.geminiApiKey);
        if (stringified === '[object Object]') {
          console.error('🔐 FATAL: API key corrupted to [object Object], clearing it');
          decrypted.geminiApiKey = '';
        } else {
          decrypted.geminiApiKey = stringified;
        }
      }
      
      if (decrypted.geminiApiKey) {
        decrypted.geminiApiKey = await this.decrypt(decrypted.geminiApiKey);
        
        // Ensure output is string and not corrupted
        if (typeof decrypted.geminiApiKey !== 'string') {
          console.warn('🔐 Gemini decryption returned non-string, converting:', typeof decrypted.geminiApiKey);
          const stringified = String(decrypted.geminiApiKey);
          if (stringified === '[object Object]') {
            console.error('🔐 FATAL: Decryption produced [object Object], clearing it');
            decrypted.geminiApiKey = '';
          } else {
            decrypted.geminiApiKey = stringified;
          }
        }
      }
    }

    console.log('🔐 Decryption complete, output types:', {
      openaiKeyType: typeof decrypted.openaiApiKey,
      geminiKeyType: typeof decrypted.geminiApiKey,
      openaiKeyLength: decrypted.openaiApiKey?.length || 0,
      geminiKeyLength: decrypted.geminiApiKey?.length || 0
    });

    return decrypted;
  }
}

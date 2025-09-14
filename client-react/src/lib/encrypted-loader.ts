import sodium from 'libsodium-wrappers';
import type { Loader, LoaderCallbacks, LoaderContext, LoaderStats, LoaderConfiguration, HlsConfig } from 'hls.js';

// Global state to share between loader instances
class EncryptionState {
  decryptionKey: Uint8Array | null = null;
  sodium: typeof sodium | null = null;
  segmentNonces = new Map<string, string>();

  async initialize() {
    if (!this.sodium) {
      await sodium.ready;
      this.sodium = sodium;
    }
  }
}

const encryptionState = new EncryptionState();

export class EncryptedSegmentLoader implements Loader<LoaderContext> {
  context: LoaderContext | null = null;
  stats: LoaderStats = {
    aborted: false,
    loaded: 0,
    retry: 0,
    total: 0,
    chunkCount: 0,
    bwEstimate: 0,
    loading: { start: 0, first: 0, end: 0 },
    parsing: { start: 0, end: 0 },
    buffering: { start: 0, first: 0, end: 0 }
  };

  constructor(config: HlsConfig) {
    // HLS.js expects a constructor that takes HlsConfig
  }

  static async initialize() {
    await encryptionState.initialize();
  }

  parseEncryptionKey(m3u8Content: string): Uint8Array {
    const keyMatch = m3u8Content.match(/#EXT-X-CUSTOM-KEY:.*URI="data:text\/plain;base64,([^"]+)"/);
    
    if (keyMatch) {
      try {
        // libsodium's from_base64 is sometimes strict, so use browser's atob as fallback
        const keyString = keyMatch[1].trim();
        
        if (encryptionState.sodium) {
          try {
            return encryptionState.sodium.from_base64(keyString);
          } catch {
            // Fallback to browser's atob if libsodium fails
            const binaryString = atob(keyString);
            const decoded = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              decoded[i] = binaryString.charCodeAt(i);
            }
            return decoded;
          }
        }
      } catch (error) {
        console.error('Failed to decode base64 encryption key:', error);
        throw new Error('Invalid base64 key format');
      }
    }
    throw new Error('Encryption key not found in playlist');
  }

  parseSegmentNonces(m3u8Content: string): Map<string, string> {
    const lines = m3u8Content.split('\n');
    const nonces = new Map<string, string>();
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('#EXT-X-SEGMENT-NONCE:')) {
        const nonce = line.split(':')[1];
        // Next non-comment line should be the segment URL
        for (let j = i + 1; j < lines.length; j++) {
          if (!lines[j].startsWith('#') && lines[j].trim()) {
            nonces.set(lines[j].trim(), nonce);
            break;
          }
        }
      }
    }
    
    return nonces;
  }

  decryptSegment(encryptedData: ArrayBuffer, key: Uint8Array, nonce: string): ArrayBuffer {
    if (!encryptionState.sodium) throw new Error('Sodium not initialized');
    
    try {
      let nonceBuffer: Uint8Array;
      
      try {
        nonceBuffer = encryptionState.sodium.from_base64(nonce);
      } catch {
        // Fallback to browser's atob for nonce decoding
        const binaryString = atob(nonce);
        nonceBuffer = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          nonceBuffer[i] = binaryString.charCodeAt(i);
        }
      }
      
      const encryptedArray = new Uint8Array(encryptedData);
      
      if (key.length !== 32) {
        throw new Error(`Invalid key size: expected 32 bytes, got ${key.length}`);
      }
      if (nonceBuffer.length !== 12) {
        throw new Error(`Invalid nonce size: expected 12 bytes, got ${nonceBuffer.length}`);
      }
      
      const decrypted = encryptionState.sodium.crypto_aead_chacha20poly1305_ietf_decrypt(
        null, // nsec
        encryptedArray,
        null, // additional data
        nonceBuffer,
        key
      );
      
      return decrypted.buffer as ArrayBuffer;
    } catch (error) {
      console.error(`❌ Decryption failed:`, error);
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  cleanM3U8ForHls(m3u8Content: string, baseUrl?: string): string {
    // Remove custom encryption tags that HLS.js doesn't understand
    // but keep all standard HLS tags, and resolve segment URLs if needed
    const lines = m3u8Content.split('\n');
    const cleanedLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (!line) continue;
      
      // Skip custom encryption tags
      if (line.startsWith('#EXT-X-CUSTOM-KEY:') || 
          line.startsWith('#EXT-X-SEGMENT-NONCE:')) {
        continue;
      }
      
      // Handle segment URLs - convert relative to absolute if needed
      if (!line.startsWith('#') && line.endsWith('.enc') && baseUrl) {
        // If baseUrl is a blob URL and we have a relative segment path,
        // we need to convert it to the actual server URL
        if (baseUrl.startsWith('blob:') && !line.startsWith('http') && !line.startsWith('/')) {
          // Convert to full server URL using current window location
          const serverUrl = `${window.location.protocol}//${window.location.host}/output/my-encrypted-video/${line}`;
          cleanedLines.push(serverUrl);
          continue;
        }
      }
      
      // Keep all other lines including standard HLS tags and segment URLs
      cleanedLines.push(line);
    }
    
    return cleanedLines.join('\n');
  }

  load(
    context: LoaderContext,
    _config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>
  ): void {
    this.context = context;
    this.stats = {
      aborted: false,
      loaded: 0,
      retry: 0,
      total: 0,
      chunkCount: 0,
      bwEstimate: 0,
      loading: { start: Date.now(), first: 0, end: 0 },
      parsing: { start: 0, end: 0 },
      buffering: { start: 0, first: 0, end: 0 }
    };

    const { url } = context;
    
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    
    // Set response type based on what HLS.js expects
    if (context.responseType === 'text') {
      xhr.responseType = 'text';
    } else {
      xhr.responseType = 'arraybuffer';
    }
    
    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          // Handle text responses (M3U8 manifests)
          if (xhr.responseType === 'text') {
            const textData = xhr.response;
            
            try {
              encryptionState.decryptionKey = this.parseEncryptionKey(textData);
              encryptionState.segmentNonces = this.parseSegmentNonces(textData);
              
              // Clean M3U8 content for HLS.js compatibility (remove custom tags and resolve URLs)
              const cleanedM3U8 = this.cleanM3U8ForHls(textData, url);
              
              this.stats.loaded = textData.length;
              this.stats.total = textData.length;
              this.stats.loading.end = Date.now();
              
              callbacks.onSuccess({
                url: url,
                data: cleanedM3U8
              }, this.stats, context, xhr);
              
            } catch (keyError) {
              console.warn('No encryption key found, treating as regular M3U8:', keyError instanceof Error ? keyError.message : 'Unknown error');
              
              this.stats.loaded = textData.length;
              this.stats.total = textData.length;
              this.stats.loading.end = Date.now();
              
              // For non-encrypted M3U8, pass through as-is
              callbacks.onSuccess({
                url: url,
                data: textData
              }, this.stats, context, xhr);
            }
            
          // Handle binary responses (segments)
          } else if (url.endsWith('.enc')) {
            const filename = url.split('/').pop();
            console.log(`🔐 Decrypting ${filename}`);
            
            const nonce = filename ? encryptionState.segmentNonces.get(filename) : null;
            
            if (!nonce) {
              throw new Error(`Nonce not found for segment: ${filename}`);
            }
            
            if (!encryptionState.decryptionKey) {
              throw new Error('Decryption key not available');
            }
            
            const decryptedData = this.decryptSegment(
              xhr.response,
              encryptionState.decryptionKey,
              nonce
            );
            
            console.log(`✅ Decrypted ${filename} (${decryptedData.byteLength} bytes)`);
            
            this.stats.loaded = xhr.response.byteLength;
            this.stats.total = xhr.response.byteLength;
            this.stats.loading.end = Date.now();
            
            callbacks.onSuccess({
              url: url,
              data: decryptedData
            }, this.stats, context, xhr);
            
          } else {
            // Handle other arraybuffer files
            this.stats.loaded = xhr.response.byteLength;
            this.stats.total = xhr.response.byteLength;
            this.stats.loading.end = Date.now();
            
            callbacks.onSuccess({
              url: url,
              data: xhr.response
            }, this.stats, context, xhr);
          }
        } catch (error) {
          console.error(`❌ Error loading ${url}:`, error);
          callbacks.onError({ 
            code: xhr.status, 
            text: error instanceof Error ? error.message : 'Unknown error' 
          }, context, xhr);
        }
      } else {
        callbacks.onError({ 
          code: xhr.status, 
          text: xhr.statusText 
        }, context, xhr);
      }
    };
    
    xhr.onerror = () => {
      callbacks.onError({ 
        code: xhr.status, 
        text: 'Network Error' 
      }, context, xhr);
    };
    
    xhr.send();
  }

  abort(): void {
    // Abort loading
  }

  destroy(): void {
    // Note: We don't clear global state here as other instances might be using it
  }
}
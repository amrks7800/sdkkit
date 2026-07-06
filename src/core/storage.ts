/**
 * Platform-agnostic storage adapter interface (AsyncStorage, localStorage, etc.).
 */
export interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/**
 * Configuration options for the TokenManager.
 */
export interface TokenManagerConfig {
  storage: StorageAdapter;
  /**
   * Storage key for saving the auth token.
   * @default "sdk_auth_token"
   */
  storageKey?: string;
}

/**
 * Handles secure storage, retrieval, and in-memory caching of authentication tokens.
 */
export class TokenManager {
  private cache: string | null = null;
  private readonly storage: StorageAdapter;
  private readonly key: string;

  constructor(config: TokenManagerConfig) {
    this.storage = config.storage;
    this.key = config.storageKey ?? "sdk_auth_token";
  }

  /**
   * Retrieves the current token, using the memory cache if available.
   */
  public async getToken(): Promise<string | null> {
    if (this.cache !== null) {
      return this.cache;
    }
    const token = await this.storage.getItem(this.key);
    this.cache = token;
    return token;
  }

  /**
   * Saves a new token to both the memory cache and persistent storage.
   */
  public async setToken(token: string): Promise<void> {
    this.cache = token;
    await this.storage.setItem(this.key, token);
  }

  /**
   * Removes the token from both memory cache and persistent storage.
   */
  public async clearToken(): Promise<void> {
    this.cache = null;
    await this.storage.removeItem(this.key);
  }

  /**
   * Invalidates the in-memory cache, forcing the next lookup to query the persistent storage.
   */
  public invalidateCache(): void {
    this.cache = null;
  }
}

/**
 * Subscription Execution Cache
 * 
 * Deduplicates subscription execution by caching results and distributing
 * to multiple clients with identical subscriptions.
 * 
 * SECURITY CRITICAL: This cache includes user authentication context in cache keys
 * to prevent data leakage between users. Different users may see different results
 * for the same query due to:
 * 
 * - Private posts/content access
 * - User-specific permissions and capabilities  
 * - Role-based access control (RBAC)
 * - User-specific customizations
 * - Draft/pending content visibility
 * - User-owned content filtering
 * 
 * Cache Key Format: {queryHash}_{userIndicator}
 * Examples:
 * - a1b2c3d4e5f6g7h8_anon (anonymous user)
 * - a1b2c3d4e5f6g7h8_u123 (authenticated user ID 123)
 * - a1b2c3d4e5f6g7h8_uauth (authenticated user, ID unknown)
 * 
 * Performance Benefits:
 * - Reduces redundant GraphQL executions
 * - Shares results between clients with identical context
 * - Caches expensive database queries
 * - Prevents execution storms during high-traffic events
 */

import type { Logger } from 'pino';
import { createHash } from 'node:crypto';

export interface CacheableSubscription {
  query: string;
  variables: Record<string, any>;
  operationName?: string;
  userContext?: {
    userId?: string | number;
    userRoles?: string[];
    capabilities?: string[];
    isAuthenticated: boolean;
  };
}

export interface ExecutionResult {
  data: any;
  errors?: any[];
  timestamp: number;
}

export interface PendingExecution {
  promise: Promise<ExecutionResult>;
  subscribers: Set<string>; // subscription IDs waiting for this result
}

/**
 * Cache for subscription execution results with deduplication
 */
export class SubscriptionExecutionCache {
  private cache = new Map<string, ExecutionResult>();
  private pendingExecutions = new Map<string, PendingExecution>();
  private readonly ttlMs: number;
  private readonly logger: Logger;

  constructor(ttlMs: number = 5000, logger: Logger) {
    this.ttlMs = ttlMs;
    this.logger = logger;
    
    // Clean up expired cache entries every 30 seconds
    setInterval(() => this.cleanup(), 30000);
  }

  /**
   * Generate a cache key for a subscription including user context
   * 
   * CRITICAL: User context is included to prevent data leakage between users.
   * Different users may see different results for the same query due to:
   * - Private posts/content
   * - User-specific permissions
   * - Role-based access control
   * - User-specific customizations
   */
  private generateCacheKey(subscription: CacheableSubscription): string {
    const payload = {
      query: subscription.query.replace(/\s+/g, ' ').trim(), // normalize whitespace
      variables: subscription.variables || {},
      operationName: subscription.operationName || null,
      // Include user context for security isolation
      userContext: this.normalizeUserContext(subscription.userContext)
    };
    
    const hash = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex')
      .substring(0, 16); // Use first 16 chars for readability
      
    // Add user indicator to cache key for debugging
    const userIndicator = subscription.userContext?.isAuthenticated 
      ? `u${subscription.userContext.userId || 'auth'}` 
      : 'anon';
      
    return `${hash}_${userIndicator}`;
  }

  /**
   * Normalize user context for consistent cache keys
   */
  private normalizeUserContext(userContext?: CacheableSubscription['userContext']): any {
    if (!userContext) {
      return { isAuthenticated: false };
    }

    return {
      userId: userContext.userId || null,
      userRoles: userContext.userRoles ? [...userContext.userRoles].sort() : [],
      capabilities: userContext.capabilities ? [...userContext.capabilities].sort() : [],
      isAuthenticated: userContext.isAuthenticated
    };
  }

  /**
   * Execute subscription with deduplication
   * 
   * If the same subscription is already being executed, wait for that result.
   * If a recent result exists in cache, return it immediately.
   */
  async executeWithDeduplication(
    subscription: CacheableSubscription,
    subscriptionId: string,
    executor: () => Promise<ExecutionResult>
  ): Promise<ExecutionResult> {
    const cacheKey = this.generateCacheKey(subscription);
    
    this.logger.debug({ 
      cacheKey, 
      subscriptionId,
      query: subscription.query.substring(0, 100) + '...'
    }, 'Checking subscription execution cache');

    // 1. Check if we have a recent cached result
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult && (Date.now() - cachedResult.timestamp) < this.ttlMs) {
      this.logger.debug({ 
        cacheKey, 
        subscriptionId,
        age: Date.now() - cachedResult.timestamp 
      }, 'Returning cached subscription result');
      return cachedResult;
    }

    // 2. Check if this subscription is already being executed
    const pendingExecution = this.pendingExecutions.get(cacheKey);
    if (pendingExecution) {
      this.logger.info({ 
        cacheKey, 
        subscriptionId,
        existingSubscribers: pendingExecution.subscribers.size
      }, 'Joining pending subscription execution');
      
      pendingExecution.subscribers.add(subscriptionId);
      
      try {
        const result = await pendingExecution.promise;
        this.logger.debug({ 
          cacheKey, 
          subscriptionId,
          totalSubscribers: pendingExecution.subscribers.size
        }, 'Received deduplicated subscription result');
        return result;
      } finally {
        pendingExecution.subscribers.delete(subscriptionId);
      }
    }

    // 3. No cached result and not pending - execute now
    this.logger.info({ 
      cacheKey, 
      subscriptionId 
    }, 'Executing new subscription (cache miss)');

    const subscribers = new Set([subscriptionId]);
    const executionPromise = this.executeAndCache(cacheKey, executor);
    
    // Track this as a pending execution
    this.pendingExecutions.set(cacheKey, {
      promise: executionPromise,
      subscribers
    });

    try {
      const result = await executionPromise;
      this.logger.info({ 
        cacheKey, 
        subscriptionId,
        executionTime: Date.now() - result.timestamp,
        subscriberCount: subscribers.size
      }, 'Subscription execution completed');
      return result;
    } finally {
      // Clean up pending execution
      this.pendingExecutions.delete(cacheKey);
    }
  }

  /**
   * Execute and cache the result
   */
  private async executeAndCache(
    cacheKey: string, 
    executor: () => Promise<ExecutionResult>
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    try {
      const result = await executor();
      
      // Add execution timestamp
      const cachedResult: ExecutionResult = {
        ...result,
        timestamp: startTime
      };
      
      // Cache the result
      this.cache.set(cacheKey, cachedResult);
      
      this.logger.debug({ 
        cacheKey,
        executionTime: Date.now() - startTime,
        hasErrors: !!result.errors?.length
      }, 'Cached subscription execution result');
      
      return cachedResult;
      
    } catch (error) {
      this.logger.error({ error, cacheKey }, 'Subscription execution failed');
      
      // Cache error result to prevent immediate retry storms
      const errorResult: ExecutionResult = {
        data: null,
        errors: [{
          message: error instanceof Error ? error.message : 'Execution failed',
          extensions: { code: 'EXECUTION_ERROR' }
        }],
        timestamp: startTime
      };
      
      this.cache.set(cacheKey, errorResult);
      return errorResult;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    cacheSize: number;
    pendingExecutions: number;
    cacheHitRate?: number;
    userContextBreakdown: {
      authenticated: number;
      anonymous: number;
      uniqueUsers: number;
    };
  } {
    // Analyze cache entries by user context
    const userContextBreakdown = this.analyzeUserContexts();
    
    return {
      cacheSize: this.cache.size,
      pendingExecutions: this.pendingExecutions.size,
      userContextBreakdown
    };
  }

  /**
   * Analyze cache entries by user authentication status
   */
  private analyzeUserContexts(): {
    authenticated: number;
    anonymous: number;
    uniqueUsers: number;
  } {
    const uniqueUsers = new Set<string>();
    let authenticated = 0;
    let anonymous = 0;
    
    for (const key of this.cache.keys()) {
      if (key.endsWith('_anon')) {
        anonymous++;
      } else {
        authenticated++;
        // Extract user ID from key for unique user count
        const match = key.match(/_u(\d+|auth)$/);
        if (match) {
          uniqueUsers.add(match[1] || 'unknown');
        }
      }
    }
    
    return {
      authenticated,
      anonymous,
      uniqueUsers: uniqueUsers.size
    };
  }

  /**
   * Security audit: Check for potential data leakage
   * Returns warnings if cache keys might be sharing data inappropriately
   */
  securityAudit(): {
    warnings: string[];
    recommendations: string[];
  } {
    const warnings: string[] = [];
    const recommendations: string[] = [];
    
    // Check for suspicious patterns
    const cacheKeys = Array.from(this.cache.keys());
    const queryHashes = new Set<string>();
    const duplicateQueries: string[] = [];
    
    for (const key of cacheKeys) {
      const queryHash = key.split('_')[0];
      if (queryHashes.has(queryHash!)) {
        duplicateQueries.push(queryHash!);
      }
      queryHashes.add(queryHash!);
    }
    
    if (duplicateQueries.length > 0) {
      warnings.push(`Found ${duplicateQueries.length} queries cached for multiple user contexts`);
      recommendations.push('Verify that user-specific data is properly isolated');
    }
    
    const stats = this.getStats();
    if (stats.userContextBreakdown.authenticated > 0 && stats.userContextBreakdown.anonymous > 0) {
      recommendations.push('Mixed authenticated/anonymous cache detected - ensure proper access control');
    }
    
    if (stats.cacheSize > 1000) {
      warnings.push('Large cache size detected - consider shorter TTL or more aggressive cleanup');
    }
    
    return { warnings, recommendations };
  }

  /**
   * Clear expired cache entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, result] of this.cache.entries()) {
      if (now - result.timestamp > this.ttlMs) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      this.logger.debug({ 
        cleanedCount, 
        remainingEntries: this.cache.size 
      }, 'Cleaned up expired cache entries');
    }
  }

  /**
   * Clear all cache entries (for testing/debugging)
   */
  clear(): void {
    this.cache.clear();
    this.pendingExecutions.clear();
    this.logger.debug('Cleared subscription execution cache');
  }

  /**
   * Get detailed cache information for debugging
   */
  getCacheInfo(): Array<{
    key: string;
    timestamp: number;
    age: number;
    hasErrors: boolean;
  }> {
    const now = Date.now();
    return Array.from(this.cache.entries()).map(([key, result]) => ({
      key,
      timestamp: result.timestamp,
      age: now - result.timestamp,
      hasErrors: !!result.errors?.length
    }));
  }
}

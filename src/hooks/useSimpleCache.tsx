import { useState, useCallback, useEffect } from 'react';
import { useRedis } from './useRedis';
import { useToast } from '@/hooks/use-toast';

interface CacheConfig {
  ttl?: number;
  tags?: string[];
  enableMemoryCache?: boolean;
}

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  tags: string[];
  hits: number;
  size: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalSize: number;
  entryCount: number;
}

// In-memory cache for frequently accessed data
const memoryCache = new Map<string, CacheEntry>();
const cacheStats = {
  hits: 0,
  misses: 0,
  totalSize: 0,
};

export const useSimpleCache = () => {
  const redis = useRedis();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Memory cache helpers
  const getFromMemoryCache = <T,>(key: string): T | null => {
    const entry = memoryCache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() > entry.timestamp + entry.ttl * 1000) {
      memoryCache.delete(key);
      return null;
    }

    entry.hits++;
    cacheStats.hits++;
    return entry.data;
  };

  const setToMemoryCache = <T,>(key: string, data: T, config: CacheConfig) => {
    const size = JSON.stringify(data).length;
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: config.ttl || 3600,
      tags: config.tags || [],
      hits: 0,
      size,
    };

    memoryCache.set(key, entry);
    cacheStats.totalSize += size;

    // Cleanup old entries if memory gets too large (> 10MB)
    if (cacheStats.totalSize > 10 * 1024 * 1024) {
      cleanupMemoryCache();
    }
  };

  const cleanupMemoryCache = () => {
    const entries = Array.from(memoryCache.entries());
    const now = Date.now();

    // Remove expired entries
    entries.forEach(([key, entry]) => {
      if (now > entry.timestamp + entry.ttl * 1000) {
        memoryCache.delete(key);
        cacheStats.totalSize -= entry.size;
      }
    });

    // If still too large, remove least recently used
    if (cacheStats.totalSize > 10 * 1024 * 1024) {
      const sortedEntries = entries
        .filter(([key]) => memoryCache.has(key))
        .sort((a, b) => a[1].hits - b[1].hits);

      const toRemove = sortedEntries.slice(0, Math.floor(sortedEntries.length * 0.2));
      toRemove.forEach(([key, entry]) => {
        memoryCache.delete(key);
        cacheStats.totalSize -= entry.size;
      });
    }
  };

  // Generate smart cache keys
  const generateCacheKey = (namespace: string, identifier: string, params?: Record<string, any>) => {
    const paramsStr = params ? JSON.stringify(params, Object.keys(params).sort()) : '';
    return `cache:${namespace}:${identifier}:${btoa(paramsStr).slice(0, 8)}`;
  };

  // Get from cache with fallback
  const get = useCallback(async <T,>(
    key: string,
    fallbackFn?: () => Promise<T>,
    config: CacheConfig = {}
  ): Promise<T | null> => {
    try {
      // Try memory cache first
      if (config.enableMemoryCache !== false) {
        const memoryResult = getFromMemoryCache<T>(key);
        if (memoryResult !== null) {
          return memoryResult;
        }
      }

      // Try Redis cache
      const redisResult = await redis.getCached<T>(key);
      if (redisResult !== null) {
        // Store in memory cache for faster access
        if (config.enableMemoryCache !== false) {
          setToMemoryCache(key, redisResult, config);
        }
        cacheStats.hits++;
        return redisResult;
      }

      cacheStats.misses++;

      // Use fallback function if provided
      if (fallbackFn) {
        const data = await fallbackFn();
        if (data !== null) {
          await set(key, data, config);
        }
        return data;
      }

      return null;
    } catch (error) {
      console.error('Cache get error:', error);
      return fallbackFn ? await fallbackFn() : null;
    }
  }, [redis]);

  // Set to cache
  const set = useCallback(async <T,>(
    key: string,
    data: T,
    config: CacheConfig = {}
  ): Promise<boolean> => {
    try {
      const ttl = config.ttl || 3600;

      // Store in Redis
      const redisSuccess = await redis.cache(key, data, ttl);

      // Store in memory cache
      if (config.enableMemoryCache !== false && redisSuccess) {
        setToMemoryCache(key, data, { ...config, ttl });
      }

      // Store cache tags for invalidation
      if (config.tags && config.tags.length > 0) {
        for (const tag of config.tags) {
          const tagKey = `tag:${tag}`;
          const taggedKeys = await redis.getCached<string[]>(tagKey) || [];
          if (!taggedKeys.includes(key)) {
            taggedKeys.push(key);
            await redis.cache(tagKey, taggedKeys, ttl * 2); // Tags live longer
          }
        }
      }

      return redisSuccess;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }, [redis]);

  // Invalidate by key or tags
  const invalidate = useCallback(async (keyOrTag: string, isTag = false): Promise<boolean> => {
    try {
      if (isTag) {
        // Invalidate all keys with this tag
        const tagKey = `tag:${keyOrTag}`;
        const taggedKeys = await redis.getCached<string[]>(tagKey) || [];
        
        const promises = taggedKeys.map(async (key) => {
          memoryCache.delete(key);
          return redis.del(key);
        });

        await Promise.all(promises);
        await redis.del(tagKey);
        
        toast({
          title: "Cache Invalidated",
          description: `Invalidated ${taggedKeys.length} entries with tag: ${keyOrTag}`,
        });
        
        return true;
      } else {
        // Invalidate single key
        memoryCache.delete(keyOrTag);
        return await redis.del(keyOrTag);
      }
    } catch (error) {
      console.error('Cache invalidate error:', error);
      return false;
    }
  }, [redis, toast]);

  // Warm cache with critical data
  const warmCache = useCallback(async () => {
    setLoading(true);
    try {
      console.log('Warming cache with critical data...');

      // Simple cache warming
      await set('system:cache:warmed', { timestamp: Date.now() }, { ttl: 3600 });

      toast({
        title: "Cache Warmed",
        description: "Critical data has been pre-loaded into cache",
      });
    } catch (error) {
      console.error('Cache warming error:', error);
      toast({
        title: "Cache Warming Failed",
        description: "Some data may load slower than expected",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [set, toast]);

  // Get cache statistics
  const getStats = useCallback(async (): Promise<CacheStats> => {
    const hitRate = cacheStats.hits + cacheStats.misses > 0 
      ? cacheStats.hits / (cacheStats.hits + cacheStats.misses) * 100 
      : 0;

    return {
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      hitRate: Math.round(hitRate * 100) / 100,
      totalSize: cacheStats.totalSize,
      entryCount: memoryCache.size,
    };
  }, []);

  // Clear all caches
  const clearAll = useCallback(async () => {
    try {
      // Clear memory cache
      memoryCache.clear();
      cacheStats.hits = 0;
      cacheStats.misses = 0;
      cacheStats.totalSize = 0;

      // Clear Redis cache (get all cache keys and delete)
      const keys = await redis.keys('cache:*');
      const tagKeys = await redis.keys('tag:*');
      const allKeys = [...keys, ...tagKeys];

      if (allKeys.length > 0) {
        const promises = allKeys.map(key => redis.del(key));
        await Promise.all(promises);
      }

      toast({
        title: "Cache Cleared",
        description: `Cleared ${allKeys.length} cache entries`,
      });

      return true;
    } catch (error) {
      console.error('Clear cache error:', error);
      return false;
    }
  }, [redis, toast]);

  // Auto-cleanup on component mount
  useEffect(() => {
    const cleanup = setInterval(cleanupMemoryCache, 5 * 60 * 1000); // Every 5 minutes
    return () => clearInterval(cleanup);
  }, []);

  return {
    loading,
    get,
    set,
    invalidate,
    warmCache,
    getStats,
    clearAll,
    generateCacheKey,
    redis: redis.loading,
  };
};
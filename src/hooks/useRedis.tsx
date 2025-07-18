import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface RedisResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface SetOptions {
  ttl?: number; // Time to live in seconds
}

export const useRedis = () => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleRedisOperation = async <T,>(
    functionName: string,
    payload: any
  ): Promise<T | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: payload,
      });

      if (error) {
        console.error(`Redis ${functionName} error:`, error);
        toast({
          title: "Redis Error",
          description: error.message || `Failed to execute ${functionName}`,
          variant: "destructive",
        });
        return null;
      }

      if (!data.success) {
        console.error(`Redis ${functionName} failed:`, data.error);
        toast({
          title: "Redis Error",
          description: data.error || `Operation ${functionName} failed`,
          variant: "destructive",
        });
        return null;
      }

      return data;
    } catch (err) {
      console.error(`Redis ${functionName} exception:`, err);
      toast({
        title: "Redis Error",
        description: `Unexpected error during ${functionName}`,
        variant: "destructive",
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Get a value from Redis
  const get = async (key: string): Promise<any> => {
    const result = await handleRedisOperation<{ data: any }>('redis-get', { key });
    return result?.data;
  };

  // Set a value in Redis
  const set = async (
    key: string, 
    value: any, 
    options: SetOptions = {}
  ): Promise<boolean> => {
    const result = await handleRedisOperation<{ success: boolean }>('redis-set', {
      key,
      value,
      ttl: options.ttl,
    });
    return result?.success || false;
  };

  // Delete a key from Redis
  const del = async (key: string): Promise<boolean> => {
    const result = await handleRedisOperation<{ deleted: boolean }>('redis-delete', { key });
    return result?.deleted || false;
  };

  // Get all keys matching a pattern
  const keys = async (pattern: string = '*'): Promise<string[]> => {
    const result = await handleRedisOperation<{ keys: string[] }>('redis-keys', { pattern });
    return result?.keys || [];
  };

  // Increment a numeric value
  const incr = async (key: string): Promise<number | null> => {
    const currentValue = await get(key);
    const newValue = (parseInt(currentValue) || 0) + 1;
    const success = await set(key, newValue);
    return success ? newValue : null;
  };

  // Decrement a numeric value
  const decr = async (key: string): Promise<number | null> => {
    const currentValue = await get(key);
    const newValue = Math.max((parseInt(currentValue) || 0) - 1, 0);
    const success = await set(key, newValue);
    return success ? newValue : null;
  };

  // Cache data with automatic JSON serialization
  const cache = async <T,>(
    key: string,
    data: T,
    ttlSeconds: number = 3600
  ): Promise<boolean> => {
    return await set(key, data, { ttl: ttlSeconds });
  };

  // Get cached data with automatic JSON parsing
  const getCached = async <T,>(key: string): Promise<T | null> => {
    const data = await get(key);
    try {
      return data ? JSON.parse(data) : null;
    } catch {
      return data;
    }
  };

  // Session storage helpers
  const setSession = async (
    sessionId: string, 
    sessionData: any, 
    ttlSeconds: number = 86400 // 24 hours default
  ): Promise<boolean> => {
    return await set(`session:${sessionId}`, sessionData, { ttl: ttlSeconds });
  };

  const getSession = async (sessionId: string): Promise<any> => {
    return await get(`session:${sessionId}`);
  };

  const deleteSession = async (sessionId: string): Promise<boolean> => {
    return await del(`session:${sessionId}`);
  };

  // Rate limiting helpers
  const checkRateLimit = async (
    identifier: string,
    limit: number,
    windowSeconds: number
  ): Promise<{ allowed: boolean; remaining: number }> => {
    const key = `rate_limit:${identifier}`;
    const current = await incr(key);
    
    if (current === 1) {
      // First request in window, set expiration
      await set(key, current, { ttl: windowSeconds });
    }

    const remaining = Math.max(limit - (current || 0), 0);
    const allowed = (current || 0) <= limit;

    return { allowed, remaining };
  };

  return {
    loading,
    get,
    set,
    del,
    keys,
    incr,
    decr,
    cache,
    getCached,
    setSession,
    getSession,
    deleteSession,
    checkRateLimit,
  };
};
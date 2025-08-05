import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSimpleCache } from '@/hooks/useSimpleCache';
import { useRedis } from '@/hooks/useRedis';
import { useToast } from '@/hooks/use-toast';
import { 
  RefreshCw, 
  Trash2, 
  BarChart3, 
  Database, 
  Zap,
  Timer,
  TrendingUp,
  Server
} from 'lucide-react';

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalSize: number;
  entryCount: number;
}

export const CacheManager: React.FC = () => {
  const cache = useSimpleCache();
  const redis = useRedis();
  const { toast } = useToast();
  
  const [stats, setStats] = useState<CacheStats>({
    hits: 0,
    misses: 0,
    hitRate: 0,
    totalSize: 0,
    entryCount: 0,
  });
  
  const [redisKeys, setRedisKeys] = useState<string[]>([]);
  const [testKey, setTestKey] = useState('test:performance');
  const [testValue, setTestValue] = useState('{"data": "performance test"}');
  const [testResults, setTestResults] = useState<any>(null);

  const loadStats = async () => {
    const currentStats = await cache.getStats();
    setStats(currentStats);
    
    const keys = await redis.keys('cache:*');
    setRedisKeys(keys);
  };

  const handleWarmCache = async () => {
    await cache.warmCache();
    await loadStats();
  };

  const handleClearCache = async () => {
    await cache.clearAll();
    await loadStats();
  };

  const handleInvalidateTag = async (tag: string) => {
    await cache.invalidate(tag, true);
    await loadStats();
    toast({
      title: "Tag Invalidated",
      description: `All entries with tag "${tag}" have been cleared`,
    });
  };

  const runPerformanceTest = async () => {
    const iterations = 100;
    const results = {
      memoryCache: 0,
      redisCache: 0,
      directSet: 0,
    };

    // Test direct Redis operations
    const start1 = Date.now();
    for (let i = 0; i < iterations; i++) {
      await redis.set(`${testKey}:${i}`, testValue);
    }
    results.directSet = Date.now() - start1;

    // Test cache operations
    const start2 = Date.now();
    for (let i = 0; i < iterations; i++) {
      await cache.set(`${testKey}:cache:${i}`, JSON.parse(testValue), { ttl: 3600 });
    }
    results.redisCache = Date.now() - start2;

    // Test memory cache hits
    const start3 = Date.now();
    for (let i = 0; i < iterations; i++) {
      await cache.get(`${testKey}:cache:${i}`);
    }
    results.memoryCache = Date.now() - start3;

    setTestResults(results);
    
    // Cleanup test keys
    const testKeys = await redis.keys(`${testKey}:*`);
    await Promise.all(testKeys.map(key => redis.del(key)));
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cache Manager</h2>
          <p className="text-muted-foreground">
            Monitor and manage your application's caching system
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadStats} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={handleWarmCache} variant="outline" size="sm">
            <Zap className="h-4 w-4 mr-2" />
            Warm Cache
          </Button>
          <Button onClick={handleClearCache} variant="destructive" size="sm">
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hit Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.hitRate}%</div>
            <Progress value={stats.hitRate} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cache Hits</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.hits.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {stats.misses.toLocaleString()} misses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(stats.totalSize)}</div>
            <p className="text-xs text-muted-foreground">
              {stats.entryCount} entries
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Redis Keys</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{redisKeys.length}</div>
            <p className="text-xs text-muted-foreground">
              Active cache keys
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="invalidation">Cache Invalidation</TabsTrigger>
          <TabsTrigger value="performance">Performance Tests</TabsTrigger>
          <TabsTrigger value="keys">Redis Keys</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Cache Performance</CardTitle>
                <CardDescription>
                  Multi-level caching with memory and Redis
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Memory Cache</span>
                  <Badge variant="secondary">Active</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Redis Cache</span>
                  <Badge variant={redis.loading ? "destructive" : "secondary"}>
                    {redis.loading ? "Loading" : "Active"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Auto Cleanup</span>
                  <Badge variant="secondary">Enabled</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Tag-based Invalidation</span>
                  <Badge variant="secondary">Enabled</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cache Configuration</CardTitle>
                <CardDescription>
                  Current caching strategies and TTL settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Venues Cache TTL</span>
                    <span>30 minutes</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Events Cache TTL</span>
                    <span>15 minutes</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Tags Cache TTL</span>
                    <span>1 hour</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Memory Limit</span>
                    <span>10 MB</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="invalidation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tag-based Cache Invalidation</CardTitle>
              <CardDescription>
                Invalidate cached data by tags for efficient updates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {['venues', 'events', 'tags', 'users', 'groups', 'marketplace'].map((tag) => (
                  <div key={tag} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium capitalize">{tag}</div>
                      <div className="text-sm text-muted-foreground">
                        Clear all {tag} cache
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleInvalidateTag(tag)}
                    >
                      Clear
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance Benchmarks</CardTitle>
              <CardDescription>
                Test cache performance with different strategies
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="test-key">Test Key</Label>
                  <Input
                    id="test-key"
                    value={testKey}
                    onChange={(e) => setTestKey(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="test-value">Test Value (JSON)</Label>
                  <Input
                    id="test-value"
                    value={testValue}
                    onChange={(e) => setTestValue(e.target.value)}
                  />
                </div>
              </div>
              
              <Button onClick={runPerformanceTest} disabled={cache.loading}>
                <Timer className="h-4 w-4 mr-2" />
                Run Performance Test
              </Button>

              {testResults && (
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Direct Redis</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{testResults.directSet}ms</div>
                      <p className="text-xs text-muted-foreground">100 operations</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Advanced Cache</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{testResults.redisCache}ms</div>
                      <p className="text-xs text-muted-foreground">100 operations</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Memory Cache</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{testResults.memoryCache}ms</div>
                      <p className="text-xs text-muted-foreground">100 reads</p>
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="keys" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Redis Cache Keys</CardTitle>
              <CardDescription>
                All active cache keys in Redis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {redisKeys.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    No cache keys found
                  </p>
                ) : (
                  redisKeys.map((key) => (
                    <div key={key} className="flex items-center justify-between p-2 border rounded">
                      <code className="text-sm bg-muted px-2 py-1 rounded">{key}</code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cache.invalidate(key)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
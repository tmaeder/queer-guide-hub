import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Database, Trash2, RefreshCw } from 'lucide-react';
import { useRedis } from '@/hooks/useRedis';
import { useToast } from '@/hooks/use-toast';

export const RedisDemo = () => {
  const {
    loading,
    get,
    set,
    del,
    keys,
    cache,
    getCached,
    checkRateLimit
  } = useRedis();
  const { toast } = useToast();

  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [ttl, setTtl] = useState<number>(3600);
  const [result, setResult] = useState<any>(null);
  const [allKeys, setAllKeys] = useState<string[]>([]);
  const [rateLimitResult, setRateLimitResult] = useState<any>(null);

  // Demo: Basic Redis operations
  const handleGet = async () => {
    if (!key) {
      toast({
        title: "Error",
        description: "Please enter a key",
        variant: "destructive",
      });
      return;
    }

    const data = await get(key);
    setResult(data);

    if (data !== null) {
      toast({
        title: "Success",
        description: `Retrieved value for key: ${key}`,
      });
    } else {
      toast({
        title: "Not Found",
        description: `No value found for key: ${key}`,
        variant: "destructive",
      });
    }
  };

  const handleSet = async () => {
    if (!key || !value) {
      toast({
        title: "Error",
        description: "Please enter both key and value",
        variant: "destructive",
      });
      return;
    }

    try {
      const data = JSON.parse(value);
      const success = await set(key, data, { ttl });

      if (success) {
        toast({
          title: "Success",
          description: `Set key: ${key} with TTL: ${ttl}s`,
        });
        await loadAllKeys();
      }
    } catch (e) {
      // If not valid JSON, store as string
      const success = await set(key, value, { ttl });

      if (success) {
        toast({
          title: "Success",
          description: `Set key: ${key} with TTL: ${ttl}s`,
        });
        await loadAllKeys();
      }
    }
  };

  const handleDelete = async () => {
    if (!key) {
      toast({
        title: "Error",
        description: "Please enter a key",
        variant: "destructive",
      });
      return;
    }

    const deleted = await del(key);

    if (deleted) {
      toast({
        title: "Success",
        description: `Deleted key: ${key}`,
      });
      setResult(null);
      await loadAllKeys();
    } else {
      toast({
        title: "Not Found",
        description: `Key not found: ${key}`,
        variant: "destructive",
      });
    }
  };

  const loadAllKeys = async () => {
    const keysList = await keys('*');
    setAllKeys(keysList);
  };

  // Demo: Cache functionality
  const handleCacheDemo = async () => {
    const cacheKey = 'demo:user_data';
    const userData = {
      id: 1,
      name: 'John Doe',
      email: 'john@example.com',
      preferences: {
        theme: 'dark',
        notifications: true
      }
    };

    await cache(cacheKey, userData, 300); // Cache for 5 minutes

    toast({
      title: "Cache Demo",
      description: "Cached user data for 5 minutes",
    });

    // Retrieve cached data
    const cachedData = await getCached(cacheKey);
    setResult(cachedData);
    await loadAllKeys();
  };

  // Demo: Rate limiting
  const handleRateLimitDemo = async () => {
    const identifier = 'user:demo';
    const limit = 5;
    const windowSeconds = 60;

    const rateLimitCheck = await checkRateLimit(identifier, limit, windowSeconds);
    setRateLimitResult(rateLimitCheck);

    if (rateLimitCheck.allowed) {
      toast({
        title: "Rate Limit Check",
        description: `Request allowed. ${rateLimitCheck.remaining} remaining`,
      });
    } else {
      toast({
        title: "Rate Limit Exceeded",
        description: "Too many requests. Please try again later.",
        variant: "destructive",
      });
    }
  };

  // Load keys on component mount
  useEffect(() => {
    loadAllKeys();
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Card>
        <CardHeader>
          <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Database style={{ height: 20, width: 20 }} />
            Redis Operations Demo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Label htmlFor="key">Key</Label>
                <Input
                  id="key"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="Enter Redis key"
                />
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Label htmlFor="ttl">TTL (seconds)</Label>
                <Input
                  id="ttl"
                  type="number"
                  value={ttl}
                  onChange={(e) => setTtl(parseInt(e.target.value) || 3600)}
                  placeholder="3600"
                />
              </Box>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label htmlFor="value">Value (JSON or String)</Label>
              <Textarea
                id="value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder='{"name": "John", "age": 30} or simple string'
                rows={3}
              />
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Button onClick={handleSet} disabled={loading}>
                {loading && <Loader2 style={{ marginRight: 8, height: 16, width: 16, animation: 'spin 1s linear infinite' }} />}
                Set
              </Button>
              <Button onClick={handleGet} variant="outline" disabled={loading}>
                Get
              </Button>
              <Button onClick={handleDelete} variant="destructive" disabled={loading}>
                <Trash2 style={{ marginRight: 8, height: 16, width: 16 }} />
                Delete
              </Button>
              <Button onClick={loadAllKeys} variant="outline" disabled={loading}>
                <RefreshCw style={{ marginRight: 8, height: 16, width: 16 }} />
                Refresh Keys
              </Button>
            </Box>

            {result !== null && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Label>Result:</Label>
                <Box
                  component="pre"
                  sx={{
                    bgcolor: 'action.hover',
                    p: 2,
                    borderRadius: 1,
                    fontSize: '0.875rem',
                    overflow: 'auto',
                    maxHeight: 160,
                  }}
                >
                  {JSON.stringify(result, null, 2)}
                </Box>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Demo Functions</CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Button onClick={handleCacheDemo} variant="outline" disabled={loading}>
                Cache Demo
              </Button>
              <Button onClick={handleRateLimitDemo} variant="outline" disabled={loading}>
                Rate Limit Demo
              </Button>
            </Box>

            {rateLimitResult && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Label>Rate Limit Status:</Label>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Badge variant={rateLimitResult.allowed ? "default" : "destructive"}>
                    {rateLimitResult.allowed ? "Allowed" : "Blocked"}
                  </Badge>
                  <Badge variant="outline">
                    {rateLimitResult.remaining} remaining
                  </Badge>
                </Box>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Keys ({allKeys.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {allKeys.length > 0 ? (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {allKeys.map((k) => (
                <Badge
                  key={k}
                  variant="outline"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setKey(k)}
                >
                  {k}
                </Badge>
              ))}
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>No keys found</Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

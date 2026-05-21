import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useChatGPTConnection } from '@/hooks/useChatGPTConnection';
import { CheckCircle, XCircle, RefreshCw, Plug, Unplug, Zap, AlertTriangle } from 'lucide-react';

export const ChatGPTConnection = () => {
  const { status, loading, testing, connect, disconnect, testConnection, refresh } =
    useChatGPTConnection();

  const isConnected = status?.connected;
  const usingFallback = status?.using_fallback;
  const hasFallback = status?.fallback_available;

  const formatExpiry = (expiresAt?: string) => {
    if (!expiresAt) return null;
    const date = new Date(expiresAt);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    if (diffMs < 0) return 'Expired';
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <Card>
      <CardHeader>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={20} />
              ChatGPT / OpenAI Connection
            </CardTitle>
            <CardDescription>
              Connect ChatGPT via OAuth for AI-powered content enrichment during imports and
              scraping.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}
            />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'hsl(var(--muted-foreground))' }}>
            <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Loading connection status...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Status display */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {isConnected ? (
                <>
                  <CheckCircle size={20} className="text-foreground" />
                  <span style={{ fontWeight: 500, color: 'hsl(var(--foreground))' }}>Connected via OAuth</span>
                  {status?.expires_at && (
                    <Badge variant="secondary">Expires in {formatExpiry(status.expires_at)}</Badge>
                  )}
                  {status?.has_refresh_token && (
                    <Badge variant="outline">Auto-refresh enabled</Badge>
                  )}
                </>
              ) : usingFallback ? (
                <>
                  <AlertTriangle size={20} style={{ color: 'hsl(var(--foreground) / 0.55)' }} />
                  <span style={{ fontWeight: 500, color: 'hsl(var(--foreground) / 0.55)' }}>Using API Key Fallback</span>
                  <Badge variant="secondary">ENV: OPENAI_API_KEY</Badge>
                </>
              ) : (
                <>
                  <XCircle size={20} className="text-destructive" />
                  <span style={{ fontWeight: 500, color: 'hsl(var(--destructive))' }}>Not Connected</span>
                  {hasFallback && <Badge variant="outline">API key fallback available</Badge>}
                </>
              )}
            </div>

            {/* Organization info */}
            {status?.organization_id && (
              <div style={{ fontSize: '14px', color: 'hsl(var(--muted-foreground))' }}>
                Organization: {status.organization_id}
              </div>
            )}

            {/* Description of what AI enrichment does */}
            <div style={{ fontSize: '13px', color: 'hsl(var(--muted-foreground))', lineHeight: '1.5' }}>
              When connected, ChatGPT automatically enriches imported venues with LGBTQ+ contextual
              descriptions, classifies events, generates personality bios, and adds relevant tags
              during imports and scraping.
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {isConnected ? (
                <>
                  <Button variant="outline" size="sm" onClick={testConnection} disabled={testing}>
                    {testing ? (
                      <RefreshCw size={14} style={{ marginRight: 6,
                          animation: 'spin 1s linear infinite' }}
                      />
                    ) : (
                      <Zap size={14} className="mr-1.5" />
                    )}
                    {testing ? 'Testing...' : 'Test Connection'}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={disconnect}>
                    <Unplug size={14} className="mr-1.5" />
                    Disconnect
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" onClick={connect}>
                    <Plug size={14} className="mr-1.5" />
                    Connect ChatGPT
                  </Button>
                  {usingFallback && (
                    <Button variant="outline" size="sm" onClick={testConnection} disabled={testing}>
                      {testing ? (
                        <RefreshCw size={14} style={{ marginRight: 6,
                            animation: 'spin 1s linear infinite' }}
                        />
                      ) : (
                        <Zap size={14} className="mr-1.5" />
                      )}
                      {testing ? 'Testing...' : 'Test API Key'}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

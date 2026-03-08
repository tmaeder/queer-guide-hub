import React from 'react';
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
              <Zap style={{ width: 20, height: 20 }} />
              ChatGPT / OpenAI Connection
            </CardTitle>
            <CardDescription>
              Connect ChatGPT via OAuth for AI-powered content enrichment during imports and
              scraping.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw
              style={{
                width: 16,
                height: 16,
                animation: loading ? 'spin 1s linear infinite' : 'none',
              }}
            />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6b7280' }}>
            <RefreshCw style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
            Loading connection status...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Status display */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {isConnected ? (
                <>
                  <CheckCircle style={{ width: 20, height: 20, color: '#22c55e' }} />
                  <span style={{ fontWeight: 500, color: '#22c55e' }}>Connected via OAuth</span>
                  {status?.expires_at && (
                    <Badge variant="secondary">Expires in {formatExpiry(status.expires_at)}</Badge>
                  )}
                  {status?.has_refresh_token && (
                    <Badge variant="outline">Auto-refresh enabled</Badge>
                  )}
                </>
              ) : usingFallback ? (
                <>
                  <AlertTriangle style={{ width: 20, height: 20, color: '#f59e0b' }} />
                  <span style={{ fontWeight: 500, color: '#f59e0b' }}>Using API Key Fallback</span>
                  <Badge variant="secondary">ENV: OPENAI_API_KEY</Badge>
                </>
              ) : (
                <>
                  <XCircle style={{ width: 20, height: 20, color: '#ef4444' }} />
                  <span style={{ fontWeight: 500, color: '#ef4444' }}>Not Connected</span>
                  {hasFallback && <Badge variant="outline">API key fallback available</Badge>}
                </>
              )}
            </div>

            {/* Organization info */}
            {status?.organization_id && (
              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                Organization: {status.organization_id}
              </div>
            )}

            {/* Description of what AI enrichment does */}
            <div style={{ fontSize: '13px', color: '#9ca3af', lineHeight: '1.5' }}>
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
                      <RefreshCw
                        style={{
                          width: 14,
                          height: 14,
                          marginRight: 6,
                          animation: 'spin 1s linear infinite',
                        }}
                      />
                    ) : (
                      <Zap style={{ width: 14, height: 14, marginRight: 6 }} />
                    )}
                    {testing ? 'Testing...' : 'Test Connection'}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={disconnect}>
                    <Unplug style={{ width: 14, height: 14, marginRight: 6 }} />
                    Disconnect
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" onClick={connect}>
                    <Plug style={{ width: 14, height: 14, marginRight: 6 }} />
                    Connect ChatGPT
                  </Button>
                  {usingFallback && (
                    <Button variant="outline" size="sm" onClick={testConnection} disabled={testing}>
                      {testing ? (
                        <RefreshCw
                          style={{
                            width: 14,
                            height: 14,
                            marginRight: 6,
                            animation: 'spin 1s linear infinite',
                          }}
                        />
                      ) : (
                        <Zap style={{ width: 14, height: 14, marginRight: 6 }} />
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

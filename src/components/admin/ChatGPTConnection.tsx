import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useChatGPTConnection } from '@/hooks/useChatGPTConnection';
import { CheckCircle, XCircle, RefreshCw, Plug, Unplug, Zap, AlertTriangle } from 'lucide-react';
import { TrackLoader } from '@/components/transit/TrackLoader';

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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap size={20} />
              ChatGPT / OpenAI Connection
            </CardTitle>
            <CardDescription>
              Connect ChatGPT via OAuth for AI-powered content enrichment during imports and
              scraping.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Refresh connection status"
            onClick={refresh}
            disabled={loading}
            loading={loading}
          >
            <RefreshCw size={16} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrackLoader size={16} label="Loading connection status" />
            <span className="sr-only">Loading connection status</span>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Status display */}
            <div className="flex items-center gap-4">
              {isConnected ? (
                <>
                  <CheckCircle size={20} className="text-foreground" />
                  <span className="font-medium text-foreground">Connected via OAuth</span>
                  {status?.expires_at && (
                    <Badge variant="secondary">Expires in {formatExpiry(status.expires_at)}</Badge>
                  )}
                  {status?.has_refresh_token && (
                    <Badge variant="outline">Auto-refresh enabled</Badge>
                  )}
                </>
              ) : usingFallback ? (
                <>
                  <AlertTriangle size={20} className="text-muted-foreground" />
                  <span className="font-medium text-muted-foreground">Using API Key Fallback</span>
                  <Badge variant="secondary">ENV: OPENAI_API_KEY</Badge>
                </>
              ) : (
                <>
                  <XCircle size={20} className="text-destructive" />
                  <span className="font-medium text-destructive">Not Connected</span>
                  {hasFallback && <Badge variant="outline">API key fallback available</Badge>}
                </>
              )}
            </div>

            {/* Organization info */}
            {status?.organization_id && (
              <div className="text-sm text-muted-foreground">
                Organization: {status.organization_id}
              </div>
            )}

            {/* Description of what AI enrichment does */}
            <div className="text-13 leading-relaxed text-muted-foreground">
              When connected, ChatGPT automatically enriches imported venues with LGBTQ+ contextual
              descriptions, classifies events, generates personality bios, and adds relevant tags
              during imports and scraping.
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {isConnected ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={testConnection}
                    disabled={testing}
                    loading={testing}
                  >
                    <Zap size={14} className="mr-1.5" />
                    Test connection
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={testConnection}
                      disabled={testing}
                      loading={testing}
                    >
                      <Zap size={14} className="mr-1.5" />
                      Test API key
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

import { useState } from 'react';
import {
  ChevronUp,
  Clock,
  Monitor,
  AlertTriangle,
  Wifi,
  Camera,
  ExternalLink,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { timeAgo } from '@/utils/timezone';

interface ContextData {
  url?: string;
  user_agent?: string;
  viewport?: { width: number; height: number };
  color_scheme?: string;
  errors?: Array<{ message: string; stack?: string }>;
  network_failures?: Array<{ status: number; method: string; url: string }>;
}

interface Props {
  ctx: ContextData;
  screenshotUrl: string | null;
  voteCount: number;
  submittedAt: string;
}

export function DrawerContextPanel({ ctx, screenshotUrl, voteCount, submittedAt }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [errorsOpen, setErrorsOpen] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const hasContent =
    voteCount > 0 ||
    ctx.viewport ||
    ctx.color_scheme ||
    ctx.url ||
    ctx.user_agent ||
    screenshotUrl ||
    (ctx.errors && ctx.errors.length > 0) ||
    (ctx.network_failures && ctx.network_failures.length > 0);

  if (!hasContent) return null;

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center w-full cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        style={{ gap: 4, paddingTop: 6, paddingBottom: 6 }}
      >
        {expanded ? (
          <ChevronDown size={14} />
        ) : (
          <ChevronRight size={14} />
        )}
        Context & metadata
      </button>

      <CollapsibleContent className="space-y-4 pb-4">
        <div className="grid grid-cols-2 gap-3 bg-muted" style={{ padding: 10, borderRadius: 'var(--radius-badge)' }}>
          <MetaItem icon={ChevronUp} label="Votes" value={String(voteCount)} />
          <MetaItem icon={Clock} label="Submitted" value={timeAgo(submittedAt)} />
          {ctx.viewport && (
            <MetaItem
              icon={Monitor}
              label="Viewport"
              value={`${ctx.viewport.width}×${ctx.viewport.height}`}
            />
          )}
          {ctx.color_scheme && (
            <MetaItem icon={Monitor} label="Theme" value={ctx.color_scheme} />
          )}
        </div>

        {ctx.url && (
          <div>
            <span className="text-xs font-semibold block mb-1">Page URL</span>
            <div
              className="flex items-center bg-muted"
              style={{
                gap: 6,
                padding: 8,
                borderRadius: 'var(--radius-badge)',
                fontFamily: 'monospace',
                fontSize: '0.7rem',
              }}
            >
              <a
                href={ctx.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'inherit',
                  textDecoration: 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {ctx.url}
              </a>
              <ExternalLink size={11} className="shrink-0" />
            </div>
          </div>
        )}

        {ctx.user_agent && (
          <div>
            <span className="text-xs font-semibold block mb-1">User Agent</span>
            <span
              className="block bg-muted"
              style={{
                padding: 8,
                borderRadius: 'var(--radius-badge)',
                fontFamily: 'monospace',
                fontSize: '0.65rem',
                wordBreak: 'break-all',
              }}
            >
              {ctx.user_agent}
            </span>
          </div>
        )}

        {screenshotUrl && (
          <div>
            <span className="text-xs font-semibold flex items-center mb-1" style={{ gap: 4 }}>
              <Camera size={12} /> Screenshot
            </span>
            <div
              onClick={() => setLightboxOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setLightboxOpen(true);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="Open screenshot in lightbox"
              style={{
                borderRadius: 'var(--radius-badge)',
                overflow: 'hidden',
                border: '1px solid hsl(var(--border))',
                cursor: 'pointer',
              }}
            >
              <img
                src={screenshotUrl}
                alt="Page screenshot"
                style={{ width: '100%', display: 'block', maxHeight: 280, objectFit: 'cover' }}
              />
            </div>
            <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
              <DialogContent
                className="max-w-[90vw] max-h-[90vh] p-2 bg-black border-none"
                style={{ width: 'fit-content' }}
              >
                <img
                  src={screenshotUrl}
                  alt="Page screenshot"
                  style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain' }}
                />
              </DialogContent>
            </Dialog>
          </div>
        )}

        {ctx.errors && ctx.errors.length > 0 && (
          <Collapsible open={errorsOpen} onOpenChange={setErrorsOpen}>
            <button
              type="button"
              onClick={() => setErrorsOpen(!errorsOpen)}
              className="flex items-center cursor-pointer"
              style={{ gap: 4, paddingTop: 4, paddingBottom: 4 }}
            >
              {errorsOpen ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              <AlertTriangle size={12} style={{ color: 'hsl(var(--destructive))' }} />
              <span className="text-xs font-semibold">
                Console errors ({ctx.errors.length})
              </span>
            </button>
            <CollapsibleContent>
              <div
                className="bg-muted"
                style={{
                  padding: 8,
                  borderRadius: 'var(--radius-badge)',
                  fontFamily: 'monospace',
                  fontSize: '0.65rem',
                  maxHeight: 240,
                  overflowY: 'auto',
                }}
              >
                {ctx.errors.map((err, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: 8,
                      paddingBottom: 8,
                      borderBottom: '1px solid hsl(var(--border))',
                    }}
                  >
                    <span className="block" style={{ color: 'hsl(var(--destructive))', fontSize: '0.65rem' }}>
                      {err.message}
                    </span>
                    {err.stack && (
                      <span
                        className="block text-muted-foreground"
                        style={{ fontSize: '0.6rem', marginTop: 2, whiteSpace: 'pre-wrap' }}
                      >
                        {err.stack.split('\n').slice(0, 3).join('\n')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {ctx.network_failures && ctx.network_failures.length > 0 && (
          <Collapsible open={networkOpen} onOpenChange={setNetworkOpen}>
            <button
              type="button"
              onClick={() => setNetworkOpen(!networkOpen)}
              className="flex items-center cursor-pointer"
              style={{ gap: 4, paddingTop: 4, paddingBottom: 4 }}
            >
              {networkOpen ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              <Wifi size={12} style={{ color: 'hsl(var(--foreground) / 0.55)' }} />
              <span className="text-xs font-semibold">
                Network failures ({ctx.network_failures.length})
              </span>
            </button>
            <CollapsibleContent>
              <div
                className="bg-muted"
                style={{
                  padding: 8,
                  borderRadius: 'var(--radius-badge)',
                  fontFamily: 'monospace',
                  fontSize: '0.65rem',
                  maxHeight: 240,
                  overflowY: 'auto',
                }}
              >
                {ctx.network_failures.map((nf, i) => (
                  <div key={i} style={{ marginBottom: 4 }}>
                    <span className="block" style={{ fontSize: '0.65rem' }}>
                      <span style={{ color: 'hsl(var(--foreground) / 0.55)', fontWeight: 700 }}>{nf.status}</span>{' '}
                      {nf.method} {nf.url}
                    </span>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center" style={{ gap: 6 }}>
      <Icon style={{ width: 13, height: 13, color: 'var(--muted-foreground)', flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <span className="block text-muted-foreground" style={{ fontSize: '0.6rem', lineHeight: 1 }}>
          {label}
        </span>
        <span className="block font-semibold" style={{ fontSize: '0.75rem' }}>
          {value}
        </span>
      </div>
    </div>
  );
}

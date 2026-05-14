
interface LoadingProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
}

const dotPixels = { sm: 6, md: 8, lg: 12 } as const;
const spinnerPixels = { sm: 16, md: 24, lg: 32 } as const;

export function Loading({ size = "md", text }: LoadingProps) {
  const d = dotPixels[size];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: d,
              height: d,
              borderRadius: '50%',
              backgroundColor: 'currentColor',
              animation: 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>
      {text && (
        <p style={{ fontSize: '0.875rem', color: 'hsl(var(--muted-foreground))', margin: 0 }}>
          {text}
        </p>
      )}
    </div>
  );
}

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingSpinner({ size = "md" }: LoadingSpinnerProps) {
  const s = spinnerPixels[size];

  return (
    <div
      style={{
        width: s,
        height: s,
        borderRadius: '50%',
        border: '2px solid hsl(var(--border))',
        borderTopColor: 'currentColor',
        animation: 'spin 1s linear infinite',
      }}
    />
  );
}

interface PageLoadingProps {
  text?: string;
}

export function PageLoading({ text = "Loading..." }: PageLoadingProps) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Main loading animation */}
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: 'currentColor',
                  animation: 'bounce 0.8s ease-in-out infinite',
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>{text}</h2>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <LoadingSpinner size="sm" />
            <span style={{ fontSize: '0.875rem', color: 'hsl(var(--muted-foreground))', marginLeft: 8 }}>Please wait</span>
          </div>
        </div>
      </div>

      {/* Keyframes injected via style tag */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

interface InlineLoadingProps {
  text?: string;
  size?: "sm" | "md";
}

export function InlineLoading({ text = "Loading...", size = "md" }: InlineLoadingProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '32px 0' }}>
      <LoadingSpinner size={size} />
      <span style={{
        color: 'hsl(var(--muted-foreground))',
        fontSize: size === "sm" ? '0.875rem' : '1rem',
      }}>
        {text}
      </span>
    </div>
  );
}

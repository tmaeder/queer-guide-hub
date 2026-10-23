import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
interface Report {
  as_of: string;
  window_days: number;
  welcome_activation: {
    accepted_accounts: number;
    closed_windows: number;
    outcome_accounts: number;
    open_windows: number;
    observation_days: number;
  };
  verified_app_events: { event_type: string; state: string; observations: number }[];
  journey_states: { journey_id: string; version: number; status: string; runs: number }[];
  journey_steps: {
    journey_id: string;
    version: number;
    kind: string;
    outcome: string;
    steps: number;
  }[];
}
export function EmailMeasurement() {
  const [data, setData] = useState<Report | null>(null),
    [error, setError] = useState(false);
  const request = useRef(0);
  async function load() {
    const sequence = ++request.current;
    setError(false);
    try {
      const r = await supabase.functions.invoke('email-admin?resource=measurement', {
        method: 'GET',
      });
      if (sequence !== request.current) return;
      if (r.error || !r.data?.welcome_activation || !Array.isArray(r.data.verified_app_events))
        throw new Error('measurement');
      setData(r.data);
    } catch {
      if (sequence === request.current) setError(true);
    }
  }
  useEffect(() => {
    const pending = request;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetch observed measurements on mount.
    void load();
    return () => {
      ++pending.current;
    };
  }, []);
  return (
    <section className="space-y-8 py-6" aria-label="Email measurement">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-sans text-title font-bold">Observed app outcomes</h2>
        <Button variant="outline" onClick={() => void load()}>
          Refresh measurements
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Reports use saved provider receipts and server-captured product events. An action after a
        message is an observation, not evidence that the email caused it. Purchases, causal lift and
        automatic winners are not inferred.
      </p>
      {error && (
        <p role="alert">
          Measurements could not load. Previously observed results remain visible; refresh to retry.
        </p>
      )}
      {!data && !error && <p role="status">Loading measurements…</p>}
      {data && (
        <>
          <p className="text-sm text-muted-foreground">
            Last {data.window_days} days · Observed {new Date(data.as_of).toLocaleString()}
          </p>
          <section
            className="space-y-4 border-t border-border pt-6"
            aria-label="Welcome activation observations"
          >
            <h3 className="font-semibold">Username claims after welcome acceptance</h3>
            <p className="text-sm">
              {data.welcome_activation.outcome_accounts} accounts claimed a username during{' '}
              {data.welcome_activation.closed_windows} completed{' '}
              {data.welcome_activation.observation_days}-day observation windows.
            </p>
            <p className="text-sm text-muted-foreground">
              {data.welcome_activation.accepted_accounts} accounts have a provider-accepted welcome
              in this period; {data.welcome_activation.open_windows} observation windows remain
              open. Open windows are excluded from the completed-window outcome count. Acceptance
              does not establish inbox placement.
            </p>
          </section>
          <section
            className="space-y-4 border-t border-border pt-6"
            aria-label="Verified product event counts"
          >
            <h3 className="font-semibold">Server-captured product events</h3>
            {!data.verified_app_events.length ? (
              <p className="text-sm">No retained events in this window.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {data.verified_app_events.map((e) => (
                  <li
                    key={`${e.event_type}:${e.state}`}
                    className="flex flex-wrap justify-between gap-4 py-4"
                  >
                    <span>
                      {e.event_type} · {e.state}
                    </span>
                    <strong>{e.observations}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="space-y-4 border-t border-border pt-6" aria-label="Journey report">
            <h3 className="font-semibold">Journey runs and steps</h3>
            {!data.journey_states.length ? (
              <p className="text-sm">No journey runs in this window.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {data.journey_states.map((r) => (
                  <li key={`${r.journey_id}:${r.version}:${r.status}`} className="space-y-2 py-4">
                    <p className="break-all">
                      Journey {r.journey_id} · Version {r.version}
                    </p>
                    <p>
                      {r.status} · {r.runs} runs
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <details>
              <summary className="cursor-pointer text-sm font-semibold">
                Observed step outcomes
              </summary>
              {!data.journey_steps.length ? (
                <p className="mt-4 text-sm">No completed steps in this window.</p>
              ) : (
                <ul className="mt-4 divide-y divide-border text-sm">
                  {data.journey_steps.map((s, i) => (
                    <li key={`${s.journey_id}:${s.version}:${i}`} className="space-y-2 py-4">
                      <p className="break-all">
                        Journey {s.journey_id} · Version {s.version}
                      </p>
                      <p>
                        {s.kind} · {s.outcome} · {s.steps} steps
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </section>
        </>
      )}
    </section>
  );
}

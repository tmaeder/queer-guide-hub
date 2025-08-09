import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Loads Google Maps JS API securely via Supabase Edge Function
export function useSecureGoogleMaps(libraries: string[] = ["places"]) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const inflightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).google?.maps) {
      setLoaded(true);
      setLoading(false);
      return;
    }

    if (inflightRef.current) {
      inflightRef.current.then(() => {
        setLoaded(true);
        setLoading(false);
      }).catch((e) => {
        setError(String(e));
        setLoading(false);
      });
      return;
    }

    inflightRef.current = (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("secure-google-maps-key", { method: "GET" });
        if (error) throw error;
        const key = (data as any)?.key;
        if (!key) throw new Error("Google Maps key missing");

        // Avoid duplicate script injection
        const existing = document.querySelector<HTMLScriptElement>("script[data-google-maps-loader='true']");
        if (existing) {
          await new Promise<void>((resolve, reject) => {
            if ((window as any).google?.maps) return resolve();
            existing.addEventListener("load", () => resolve());
            existing.addEventListener("error", () => reject(new Error("Google Maps script failed to load")));
          });
          return;
        }

        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=${libraries.join(",")}&v=weekly`;
        script.async = true;
        script.defer = true;
        script.setAttribute("data-google-maps-loader", "true");

        const loadPromise = new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Google Maps script failed to load"));
        });

        document.head.appendChild(script);
        await loadPromise;
      } catch (e: any) {
        throw e;
      }
    })();

    inflightRef.current
      .then(() => {
        setLoaded(true);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e?.message || e));
        setLoading(false);
      });
  }, [libraries.join(",")]);

  return { loaded, loading, error };
}

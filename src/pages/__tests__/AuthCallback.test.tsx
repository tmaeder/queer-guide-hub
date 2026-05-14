import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const setSession = vi.fn();
const exchangeCodeForSession = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      setSession: (...args: unknown[]) => setSession(...args),
      exchangeCodeForSession: (...args: unknown[]) => exchangeCodeForSession(...args),
    },
  },
}));

import AuthCallback from "../AuthCallback";

function setLocation(search = "", hash = "") {
  delete (window as { location?: unknown }).location;
  (window as unknown as { location: Location }).location = {
    search,
    hash,
    href: `https://queer.guide/auth/callback${search}${hash}`,
    origin: "https://queer.guide",
    assign: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn(),
  } as unknown as Location;
}

describe("AuthCallback", () => {
  beforeEach(() => {
    setSession.mockReset().mockResolvedValue({ error: null });
    exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("errors when neither code nor token is present", async () => {
    setLocation("");
    render(<AuthCallback />);
    await waitFor(() => expect(screen.getByText(/Sign-in failed/i)).toBeInTheDocument());
    expect(screen.getByText(/missing auth code/i)).toBeInTheDocument();
  });

  it("calls setSession on implicit-flow hash tokens", async () => {
    setLocation("", "#access_token=AAA&refresh_token=BBB&expires_in=3600");
    render(<AuthCallback />);
    await waitFor(() => expect(setSession).toHaveBeenCalledTimes(1));
    expect(setSession).toHaveBeenCalledWith({ access_token: "AAA", refresh_token: "BBB" });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("calls exchangeCodeForSession on PKCE ?code=", async () => {
    setLocation("?code=CCC");
    render(<AuthCallback />);
    await waitFor(() => expect(exchangeCodeForSession).toHaveBeenCalledWith("CCC"));
    expect(setSession).not.toHaveBeenCalled();
  });

  it("surfaces error_description from Supabase", async () => {
    setLocation("?error_description=user%20not%20found");
    render(<AuthCallback />);
    await waitFor(() => expect(screen.getByText(/user not found/i)).toBeInTheDocument());
  });

  it("falls back to manual when ext flag is set but extension is not installed", async () => {
    setLocation("?ext=fake-id&code=CCC");
    // chrome.runtime.sendMessage missing → bridge returns false → manual
    render(<AuthCallback />);
    await waitFor(() => expect(screen.getByText(/Almost there/i)).toBeInTheDocument());
  });
});

type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: unknown }>;
export type EmailQuota = "allowed" | "limited" | "unavailable";

/** Use the project's atomic limiter; email sending must fail closed on faults. */
export async function takeEmailQuota(
  rpc: Rpc,
  verifiedUserId: string,
): Promise<EmailQuota> {
  if (!verifiedUserId) return "unavailable";
  try {
    const { data, error } = await rpc("rate_limit_hit", {
      p_key: `send-templated-email|${verifiedUserId}`,
      p_window: 3600,
      p_max: 100,
    });
    if (error || typeof data !== "boolean") {
      console.error("Email sending limiter unavailable", error);
      return "unavailable";
    }
    return data ? "allowed" : "limited";
  } catch (error) {
    console.error("Email sending limiter unavailable", error);
    return "unavailable";
  }
}

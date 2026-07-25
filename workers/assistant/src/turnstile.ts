/**
 * Cloudflare Turnstile server-side verification.
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 *
 * Fail-closed when a secret IS configured: a missing/invalid token is rejected.
 * Fail-OPEN when TURNSTILE_SECRET is unset — lets the endpoint keep working
 * before the widget + secret are provisioned, so this can ship ahead of the
 * frontend change without an outage. Once the secret is set, tokens are required.
 */
export async function verifyTurnstile(
	secret: string | undefined,
	token: string | undefined,
	remoteip?: string,
): Promise<{ ok: boolean; skipped: boolean }> {
	if (!secret) return { ok: true, skipped: true }; // not provisioned yet
	if (!token) return { ok: false, skipped: false };
	try {
		const form = new FormData();
		form.append("secret", secret);
		form.append("response", token);
		if (remoteip) form.append("remoteip", remoteip);
		const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
			method: "POST",
			body: form,
		});
		const data = (await res.json()) as { success?: boolean };
		return { ok: data.success === true, skipped: false };
	} catch {
		// Network blip verifying — do not hand a free 70B call to a possible bot.
		return { ok: false, skipped: false };
	}
}

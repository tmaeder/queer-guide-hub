/**
 * OAuth authorize UI (the defaultHandler for workers-oauth-provider).
 *
 * MCP clients run the standard OAuth 2.1 dance against this worker. The login
 * itself is an email one-time-code against Supabase GoTrue — works for every
 * queer.guide account (password, passkey or magic-link), since they all share
 * the same email identity. On success we hand the user's Supabase session to
 * the OAuth provider as grant `props`, which the MCP write tools then use.
 *
 * Two steps, both on POST /authorize:
 *   step=email → send the OTP
 *   step=code  → verify it, then completeAuthorization()
 */

import type { OAuthHelpers, AuthRequest } from "@cloudflare/workers-oauth-provider";
import type { Env } from "./types";
import { sendOtp, verifyOtp } from "./supabase";

type AuthEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };

const enc = (req: AuthRequest): string => btoa(JSON.stringify(req));
const dec = (s: string): AuthRequest => JSON.parse(atob(s)) as AuthRequest;

const esc = (s: string): string =>
	s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, body: string): Response {
	const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · queer.guide</title>
<style>
  :root{color-scheme:light dark}
  *{box-sizing:border-box}
  body{font:16px/1.5 -apple-system,system-ui,Inter,sans-serif;margin:0;min-height:100vh;
    display:grid;place-items:center;background:#fff;color:#0a0a0a}
  @media(prefers-color-scheme:dark){body{background:#0a0a0a;color:#fafafa}}
  .card{width:min(92vw,380px);padding:32px;border:1px solid #8884;border-radius:16px}
  h1{font-size:22px;margin:0 0 4px}
  p{margin:0 0 24px;opacity:.7;font-size:14px}
  label{display:block;font-size:13px;margin:0 0 8px}
  input{width:100%;padding:12px;font-size:16px;border:1px solid #8886;border-radius:8px;
    background:transparent;color:inherit;margin:0 0 16px}
  button{width:100%;padding:12px;font-size:16px;border:0;border-radius:8px;cursor:pointer;
    background:#0a0a0a;color:#fff}
  @media(prefers-color-scheme:dark){button{background:#fafafa;color:#0a0a0a}}
  .err{color:#b00020;font-size:13px;margin:0 0 16px}
  @media(prefers-color-scheme:dark){.err{color:#ff6b6b}}
</style></head><body><div class="card">${body}</div></body></html>`;
	return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function emailForm(state: string, error?: string): Response {
	return page(
		"Connect",
		`<h1>Connect queer.guide</h1>
     <p>Sign in to let your AI assistant act on your account.</p>
     ${error ? `<div class="err">${esc(error)}</div>` : ""}
     <form method="post" action="/authorize">
       <input type="hidden" name="step" value="email">
       <input type="hidden" name="state" value="${esc(state)}">
       <label for="email">Email</label>
       <input id="email" name="email" type="email" required autofocus placeholder="you@example.com">
       <button type="submit">Send code</button>
     </form>`,
	);
}

function codeForm(state: string, email: string, error?: string): Response {
	return page(
		"Enter code",
		`<h1>Check your email</h1>
     <p>We sent a one-time code to ${esc(email)}.</p>
     ${error ? `<div class="err">${esc(error)}</div>` : ""}
     <form method="post" action="/authorize">
       <input type="hidden" name="step" value="code">
       <input type="hidden" name="state" value="${esc(state)}">
       <input type="hidden" name="email" value="${esc(email)}">
       <label for="code">One-time code</label>
       <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" required autofocus placeholder="123456">
       <button type="submit">Sign in</button>
     </form>`,
	);
}

export const AuthApp = {
	async fetch(request: Request, env: AuthEnv): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/authorize" && request.method === "GET") {
			let oauthReq: AuthRequest;
			try {
				oauthReq = await env.OAUTH_PROVIDER.parseAuthRequest(request);
			} catch {
				return new Response("invalid authorization request", { status: 400 });
			}
			return emailForm(enc(oauthReq));
		}

		if (url.pathname === "/authorize" && request.method === "POST") {
			const form = await request.formData();
			const step = String(form.get("step") ?? "");
			const state = String(form.get("state") ?? "");
			let oauthReq: AuthRequest;
			try {
				oauthReq = dec(state);
			} catch {
				return new Response("invalid state", { status: 400 });
			}

			if (step === "email") {
				const email = String(form.get("email") ?? "").trim();
				if (!email) return emailForm(state, "Enter your email.");
				try {
					await sendOtp(env, email);
				} catch {
					// GoTrue returns 4xx for unknown accounts; keep the message generic.
					return codeForm(state, email, "If that account exists, a code is on its way.");
				}
				return codeForm(state, email);
			}

			if (step === "code") {
				const email = String(form.get("email") ?? "").trim();
				const code = String(form.get("code") ?? "").trim();
				let session;
				try {
					session = await verifyOtp(env, email, code);
				} catch {
					return codeForm(state, email, "That code didn't work. Try again.");
				}
				if (!session.user?.id) return codeForm(state, email, "Sign-in failed. Try again.");

				const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
					request: oauthReq,
					userId: session.user.id,
					scope: oauthReq.scope ?? [],
					metadata: { email: session.user.email ?? email },
					props: {
						userId: session.user.id,
						email: session.user.email ?? email,
						supabaseAccessToken: session.access_token,
						supabaseRefreshToken: session.refresh_token,
					},
				});
				return Response.redirect(redirectTo, 302);
			}

			return new Response("bad request", { status: 400 });
		}

		if (url.pathname === "/health") {
			return Response.json({ ok: true });
		}

		return new Response("not found", { status: 404 });
	},
};

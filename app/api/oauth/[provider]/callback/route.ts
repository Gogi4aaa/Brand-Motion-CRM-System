import { NextResponse, type NextRequest } from "next/server";
import { OAUTH, isConfigured, redirectBase, type ChannelProvider } from "@/lib/oauth";

// GET /api/oauth/<provider>/callback?code=...&state=<clientId>
// Exchanges the auth code for tokens and records the connection.
//
// SCAFFOLD: the token exchange + secure storage is intentionally left as a
// server-only TODO — it must run with the service-role key and store encrypted
// tokens (never the anon-readable client_connections table). It activates once
// the OAuth env vars are set and the app is deployed.
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const p = provider as ChannelProvider;
  if (!OAUTH[p]) return NextResponse.json({ error: "unknown provider" }, { status: 404 });

  const clientId = req.nextUrl.searchParams.get("state") || "";
  const code = req.nextUrl.searchParams.get("code");

  if (!isConfigured(p) || !code) {
    return NextResponse.redirect(new URL(`/clients/${clientId}?connect=unconfigured`, req.url));
  }

  // TODO (real flow, server-side only):
  //   1. POST OAUTH[p].tokenUrl with code + redirect_uri + app id/secret → tokens.
  //   2. Meta: exchange short-lived → long-lived / system-user token; fetch the
  //      Page + linked IG business account ids. TikTok: fetch open_id/creator info.
  //   3. Encrypt tokens and store server-side (service role); upsert
  //      client_connections { connected: true, account_label } for display.
  void redirectBase();

  return NextResponse.redirect(new URL(`/clients/${clientId}?connect=ok`, req.url));
}

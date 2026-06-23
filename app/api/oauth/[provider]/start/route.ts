import { NextResponse, type NextRequest } from "next/server";
import { OAUTH, isConfigured, buildAuthUrl, type ChannelProvider } from "@/lib/oauth";

// GET /api/oauth/<provider>/start?client=<clientId>
// Redirects to the provider's consent screen. Inert until the app's OAuth env
// vars are set and the app is deployed on HTTPS.
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const p = provider as ChannelProvider;
  if (!OAUTH[p]) return NextResponse.json({ error: "unknown provider" }, { status: 404 });

  const client = req.nextUrl.searchParams.get("client") || "";
  if (!isConfigured(p)) {
    // Not wired yet — send the admin back with a notice instead of erroring.
    return NextResponse.redirect(new URL(`/clients/${client}?connect=unconfigured`, req.url));
  }
  return NextResponse.redirect(buildAuthUrl(p, client));
}

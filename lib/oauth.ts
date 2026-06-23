// OAuth provider config for per-client channel connections (organic posting).
// SCAFFOLD: real flows activate only when the env vars below are set AND the app
// is deployed on HTTPS (OAuth callbacks require a public https redirect URI).
// Tokens returned by the callback must be stored server-side, encrypted
// (service-role), NOT in the client-readable client_connections table.

export type ChannelProvider = "meta" | "tiktok";

interface ProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  // Organic-posting scopes (Pages + Instagram for Meta; video upload/publish for TikTok).
  scopes: string[];
  idEnv: string;
  secretEnv: string;
  docs: string;
}

export const OAUTH: Record<ChannelProvider, ProviderConfig> = {
  meta: {
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    scopes: [
      "pages_show_list",
      "pages_manage_posts",
      "pages_read_engagement",
      "instagram_basic",
      "instagram_content_publish",
      "business_management",
    ],
    idEnv: "META_APP_ID",
    secretEnv: "META_APP_SECRET",
    docs: "https://developers.facebook.com/docs/instagram-platform/content-publishing",
  },
  tiktok: {
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["user.info.basic", "video.upload", "video.publish"],
    idEnv: "TIKTOK_CLIENT_KEY",
    secretEnv: "TIKTOK_CLIENT_SECRET",
    docs: "https://developers.tiktok.com/doc/content-posting-api-get-started",
  },
};

export const redirectBase = () => process.env.OAUTH_REDIRECT_BASE || "";

export function isConfigured(provider: ChannelProvider): boolean {
  const c = OAUTH[provider];
  return Boolean(process.env[c.idEnv] && process.env[c.secretEnv] && redirectBase());
}

// Build the provider's authorize URL. `state` carries the CRM client id so the
// callback knows which client to attach the connection to.
export function buildAuthUrl(provider: ChannelProvider, state: string): string {
  const c = OAUTH[provider];
  const appId = process.env[c.idEnv]!;
  const redirectUri = `${redirectBase()}/api/oauth/${provider}/callback`;
  if (provider === "meta") {
    const p = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, scope: c.scopes.join(","), response_type: "code", state });
    return `${c.authorizeUrl}?${p.toString()}`;
  }
  // tiktok
  const p = new URLSearchParams({ client_key: appId, redirect_uri: redirectUri, scope: c.scopes.join(","), response_type: "code", state });
  return `${c.authorizeUrl}?${p.toString()}`;
}

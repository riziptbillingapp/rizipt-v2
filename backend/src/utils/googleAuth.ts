export interface GoogleIdTokenClaims {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  aud: string;
  iss: string;
  exp: number;
}

export function buildGoogleAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function exchangeCodeForTokens(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{ id_token: string; access_token: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${text}`);
  }
  return res.json();
}

// Simple in-isolate cache for Google's public keys — Workers isolates stay warm
// across requests, so this avoids refetching the JWKS on every login.
let jwksCache: { keys: any[]; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

async function getGoogleJwks(): Promise<any[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!res.ok) throw new Error("Could not fetch Google JWKS");
  const data = await res.json<{ keys: any[] }>();
  jwksCache = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

function base64UrlToUint8Array(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(b64url.length + ((4 - (b64url.length % 4)) % 4), "=");
  const str = atob(b64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

/**
 * Verifies a Google ID token's RS256 signature against Google's published
 * JWKS, and checks audience/issuer/expiry. Throws on any failure — callers
 * should treat a thrown error as "reject this login".
 */
export async function verifyGoogleIdToken(idToken: string, expectedAudience: string): Promise<GoogleIdTokenClaims> {
  const [headerB64, payloadB64, sigB64] = idToken.split(".");
  if (!headerB64 || !payloadB64 || !sigB64) throw new Error("Malformed ID token");

  const header = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(headerB64)));
  const claims = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(payloadB64))) as GoogleIdTokenClaims;

  const keys = await getGoogleJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("No matching Google signing key found");

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, base64UrlToUint8Array(sigB64), signedData);
  if (!valid) throw new Error("Invalid ID token signature");

  if (claims.aud !== expectedAudience) throw new Error("ID token audience mismatch");
  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") {
    throw new Error("ID token issuer mismatch");
  }
  if (claims.exp < Math.floor(Date.now() / 1000)) throw new Error("ID token expired");
  if (!claims.email_verified) throw new Error("Google email not verified");

  return claims;
}

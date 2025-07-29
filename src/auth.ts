import buildGetJwks from "get-jwks";
import { createVerifier, DecodedJwt } from "fast-jwt";
import { IncomingMessage } from "http";

const ALLOWED_EMAILS = new Set<string>(
  process.env.ALLOWED_EMAIL_ADDRESSES?.split(',')
    .map(email => email.trim())
    .filter(email => email.length > 0) || []
);

// 1. Initialize JWKS retriever (cache only)
const jwks = buildGetJwks({ max: 100, ttl: 60_000, providerDiscovery: true });

// 3. Create verifier with key-fetcher inline
const verifyWithPromise = createVerifier({
  key: async function (decoded: DecodedJwt) {
    const { header } = decoded;
    const publicKey = await jwks.getPublicKey({
      kid: header.kid,
      alg: header.alg,
      domain: process.env.AUTH_ISSUER!,
    });
    return publicKey;
  },
  algorithms: ["RS256"],
  cache: true,
  allowedIss: process.env.AUTH_ISSUER,
  allowedAud: process.env.MCP_AUDIENCE,
});

export async function authenticate(request: IncomingMessage) {
  const authHeader = request.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    console.log("missing bearer token");
    throw new Response(null, {
      status: 401,
      statusText: "Missing Bearer token",
    });
  }
  const token = authHeader.substring(7);

  let payload;
  try {
    payload = await verifyWithPromise(token);
  } catch (err) {
    console.error("Invalid token", err);
    throw new Response(null, { status: 401, statusText: "Invalid token" });
  }

  const email = payload.email;
  if (!email) {
    console.warn("Token missing email claim");
    throw new Response(null, {
      status: 400,
      statusText: "Token missing email",
    });
  }

  if (!ALLOWED_EMAILS.has(email)) {
    console.warn(`Unauthorized access attempt by ${email}`);
    throw new Response(null, { status: 403, statusText: "Forbidden" });
  }

  console.log(`Authenticated user: ${email}`);
  return { user: payload.preferred_username };
}

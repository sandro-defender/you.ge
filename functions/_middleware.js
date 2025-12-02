export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Directories you want to protect
  const protectedDirs = [
    "/admin",
    "/dashboard",
    "/secret",
    "/you.ge/admin",
    "/bar",
    "/private"
  ];

  // Check if current path starts with any protected directory
  if (!protectedDirs.some(dir => url.pathname.startsWith(dir))) {
    return context.next(); // page is NOT protected → allow
  }

  // --- AUTH CHECK BELOW ---

  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/auth_token=([^;]+)/);

  if (!match) {
    return Response.redirect("/login", 302);
  }

  const token = match[1];
  const [payload, signatureB64] = token.split(".");
  const signature = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SECRET_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(payload)
  );

  if (!valid) {
    return Response.redirect("/login", 302);
  }

  return context.next(); // Authorized
}
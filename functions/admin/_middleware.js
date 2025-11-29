export async function onRequest(context) {
    const request = context.request;
    const url = new URL(request.url);
    const password = context.env.admin_password;
    const SECRET_KEY = context.env.SESSION_SECRET || "change-this-secret-key"; // Add this as a Pages secret

    const SESSION_COOKIE = "admin_session";
    const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

    // Generate HMAC-based session token
    async function generateSessionToken() {
        const timestamp = Date.now().toString();
        const data = `admin-${timestamp}`;

        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode(SECRET_KEY),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
        );

        const signature = await crypto.subtle.sign(
            "HMAC",
            key,
            encoder.encode(data)
        );

        const hashArray = Array.from(new Uint8Array(signature));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        return `${timestamp}.${hashHex}`;
    }

    // Verify session token
    async function verifySessionToken(token) {
        if (!token || !token.includes('.')) return false;

        const [timestamp, signature] = token.split('.');
        const data = `admin-${timestamp}`;

        // Check if token is expired (7 days)
        const tokenAge = Date.now() - parseInt(timestamp);
        if (tokenAge > COOKIE_MAX_AGE * 1000) return false;

        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode(SECRET_KEY),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
        );

        const expectedSignature = await crypto.subtle.sign(
            "HMAC",
            key,
            encoder.encode(data)
        );

        const expectedHashArray = Array.from(new Uint8Array(expectedSignature));
        const expectedHashHex = expectedHashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        return signature === expectedHashHex;
    }

    // --- Handle Logout ---
    if (url.pathname === "/admin/logout") {
        return new Response("", {
            status: 302,
            headers: {
                "Location": "/admin/login",
                "Set-Cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
            }
        });
    }

    // --- Check if session token is valid ---
    const cookies = request.headers.get("Cookie") || "";
    let isLoggedIn = false;

    if (cookies) {
        const cookieMap = new Map(cookies.split(';').map(c => {
            const parts = c.trim().split('=');
            return [parts[0], parts.slice(1).join('=')];
        }));

        const token = cookieMap.get(SESSION_COOKIE);
        if (token) {
            isLoggedIn = await verifySessionToken(token);
        }
    }

    if (isLoggedIn) {
        if (url.pathname === "/admin/login") {
            return new Response("", {
                status: 302,
                headers: { "Location": "/admin" }
            });
        }
        return context.next();
    }

    // --- Handle login POST ---
    if (url.pathname === "/admin/login" && request.method === "POST") {
        const form = await request.formData();
        const inputPass = form.get("password");

        if (inputPass === password) {
            const token = await generateSessionToken();

            return new Response("", {
                status: 302,
                headers: {
                    "Location": "/admin",
                    "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Strict`
                }
            });
        }

        return new Response("Wrong password", { status: 403 });
    }

    // --- Redirect to login ---
    if (url.pathname.startsWith("/admin") && url.pathname !== "/admin/login") {
        return new Response("", {
            status: 302,
            headers: { "Location": "/admin/login" }
        });
    }

    return context.next();
}
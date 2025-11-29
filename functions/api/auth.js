export async function onRequest(context) {
    const request = context.request;
    const password = context.env.admin_password;
    const SECRET_KEY = context.env.SESSION_SECRET || "change-this-secret-key";
    const SESSION_COOKIE = "admin_session";
    const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

    // Add CORS headers
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle OPTIONS preflight
    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    async function verifySessionToken(token) {
        if (!token || !token.includes('.')) return false;

        const [timestamp, signature] = token.split('.');
        const tokenAge = Date.now() - parseInt(timestamp);
        if (tokenAge > COOKIE_MAX_AGE * 1000) return false;

        const data = `admin-${timestamp}`;
        const encoder = new TextEncoder();

        try {
            const key = await crypto.subtle.importKey(
                "raw", encoder.encode(SECRET_KEY),
                { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
            );

            const expectedSignature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
            const expectedHashArray = Array.from(new Uint8Array(expectedSignature));
            const expectedHashHex = expectedHashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            return signature === expectedHashHex;
        } catch (e) {
            return false;
        }
    }

    async function generateSessionToken() {
        const timestamp = Date.now().toString();
        const data = `admin-${timestamp}`;
        const encoder = new TextEncoder();

        const key = await crypto.subtle.importKey(
            "raw", encoder.encode(SECRET_KEY),
            { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
        );

        const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
        const hashArray = Array.from(new Uint8Array(signature));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        return `${timestamp}.${hashHex}`;
    }

    // Handle POST (login)
    if (request.method === "POST") {
        try {
            const data = await request.json();

            if (data.password === password) {
                const token = await generateSessionToken();

                return new Response(JSON.stringify({ success: true }), {
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                        "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`
                    }
                });
            }

            return new Response(JSON.stringify({ success: false, error: "Wrong password" }), {
                status: 403,
                headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json"
                }
            });
        } catch (e) {
            return new Response(JSON.stringify({ success: false, error: "Invalid request" }), {
                status: 400,
                headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json"
                }
            });
        }
    }

    // Handle GET (check auth)
    if (request.method === "GET") {
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

        return new Response(JSON.stringify({ authenticated: isLoggedIn }), {
            headers: {
                ...corsHeaders,
                "Content-Type": "application/json"
            }
        });
    }

    // Method not allowed
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
        }
    });
}
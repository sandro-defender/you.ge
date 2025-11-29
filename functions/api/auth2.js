export async function onRequest(context) {
    const request = context.request;
    const adminPassword = context.env.admin_password;
    const userPassword = context.env.user_password;
    const SECRET_KEY = context.env.SESSION_SECRET || "change-this-secret-key";
    const SESSION_COOKIE = "admin_session";
    const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    async function verifySessionToken(token) {
        if (!token || !token.includes('.')) return null;

        const [timestamp, signature, role] = token.split('.');
        const tokenAge = Date.now() - parseInt(timestamp);
        if (tokenAge > COOKIE_MAX_AGE * 1000) return null;

        const data = `${role}-${timestamp}`;
        const encoder = new TextEncoder();

        try {
            const key = await crypto.subtle.importKey(
                "raw", encoder.encode(SECRET_KEY),
                { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
            );

            const expectedSignature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
            const expectedHashArray = Array.from(new Uint8Array(expectedSignature));
            const expectedHashHex = expectedHashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            if (signature === expectedHashHex) {
                return role;
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    async function generateSessionToken(role) {
        const timestamp = Date.now().toString();
        const data = `${role}-${timestamp}`;
        const encoder = new TextEncoder();

        const key = await crypto.subtle.importKey(
            "raw", encoder.encode(SECRET_KEY),
            { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
        );

        const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
        const hashArray = Array.from(new Uint8Array(signature));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        return `${timestamp}.${hashHex}.${role}`;
    }

    // Handle POST (login)
    if (request.method === "POST") {
        try {
            const data = await request.json();
            const inputPassword = data.password;

            let role = null;

            // Check which password matches
            if (inputPassword === adminPassword) {
                role = "admin";
            } else if (inputPassword === userPassword) {
                role = "user";
            }

            if (role) {
                const token = await generateSessionToken(role);

                return new Response(JSON.stringify({
                    success: true,
                    role: role
                }), {
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
        let role = null;

        if (cookies) {
            const cookieMap = new Map(cookies.split(';').map(c => {
                const parts = c.trim().split('=');
                return [parts[0], parts.slice(1).join('=')];
            }));

            const token = cookieMap.get(SESSION_COOKIE);
            if (token) {
                role = await verifySessionToken(token);
            }
        }

        return new Response(JSON.stringify({
            authenticated: role !== null,
            role: role
        }), {
            headers: {
                ...corsHeaders,
                "Content-Type": "application/json"
            }
        });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
        }
    });
}
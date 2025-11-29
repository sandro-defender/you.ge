export async function onRequest(context) {
    const request = context.request;
    const url = new URL(request.url);
    const password = context.env.admin_password;

    const SESSION_COOKIE = "admin_session";
    const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

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

    // --- Check if session cookie is valid ---
    const cookies = request.headers.get("Cookie") || "";
    if (cookies.includes(`${SESSION_COOKIE}=${password}`)) {
        // If already logged in and trying to go to login page, redirect to admin
        if (url.pathname === "/admin/login") {
            return new Response("", {
                status: 302,
                headers: { "Location": "/admin" }
            });
        }
        return context.next(); // Allow access
    }

    // --- Handle login POST ---
    if (url.pathname === "/admin/login" && request.method === "POST") {
        const form = await request.formData();
        const inputPass = form.get("password");

        if (inputPass === password) {
            return new Response("", {
                status: 302,
                headers: {
                    "Location": "/admin",
                    "Set-Cookie": `${SESSION_COOKIE}=${password}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Strict`
                }
            });
        }

        return new Response("Wrong password", { status: 403 });
    }

    // --- If no session and not on login page: redirect to login ---
    if (url.pathname.startsWith("/admin") && url.pathname !== "/admin/login") {
        return new Response("", {
            status: 302,
            headers: { "Location": "/admin/login" }
        });
    }

    return context.next();
}
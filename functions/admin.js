export async function onRequest(context) {
    const request = context.request;
    const url = new URL(request.url);
    const password = context.env.admin_password;

    const SESSION_COOKIE = "admin_session";
    const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

    // --- Check if session cookie is valid ---
    const cookies = request.headers.get("Cookie") || "";
    if (cookies.includes(`${SESSION_COOKIE}=${password}`)) {
        return context.next(); // Already logged in
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

    // --- If no session: serve login page ---
    if (url.pathname.startsWith("/admin")) {
        return fetch("https://you.ge/admin/login.html");
    }

    return context.next();
}
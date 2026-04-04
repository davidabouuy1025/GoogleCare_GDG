export default {
    async fetch(request) {
        // Handle CORS preflight
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "https://your-project-id.web.app",
                    "Access-Control-Allow-Methods": "POST",
                    "Access-Control-Allow-Headers": "Content-Type",
                }
            });
        }

        const body = await request.json();

        const response = await fetch("https://my-proxy.googlecare-proxy.workers.dev/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": API_KEY,           // injected from secret, never in code
                "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify(body)
        });

        const data = await response.text();

        return new Response(data, {
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "https://your-project-id.web.app"
            }
        });
    }
};
import { defineConfig } from "nitro";
// nitro.config.ts
export default defineConfig({
	routeRules: {
		"/api/**": {
			proxy: {
				to: `${process.env.VITE_BACKEND_URL || "http://localhost:3001"}/api/**`,
				cookieDomainRewrite: import.meta.env.BASE_URL,
				cookiePathRewrite: "/",
				onResponse(event, response) {
					console.log("[proxy]", event.method, event.path, response.status);
				},
			},
		},
	},
  // serverDir:"./server"
});

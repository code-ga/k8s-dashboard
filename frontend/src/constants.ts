export const BACKEND_URL =
	import.meta.env.BACKEND_URL || import.meta.env.DEV
		? "http://localhost:3001"
		: "https://k8s-dashboard.onrender.com";
export const FRONTEND_URL =
	import.meta.env.VITE_APP_URL || "http://localhost:3000";
console.log(FRONTEND_URL);

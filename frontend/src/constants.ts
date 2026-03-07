import { logger } from "./lib/logger";
export const BACKEND_URL =
	import.meta.env.VITE_BACKEND_URL ||
	(import.meta.env.DEV
		? "http://localhost:3001"
		: "https://the-bridge-backend.nbth.id.vn");
export const FRONTEND_URL =
	import.meta.env.VITE_APP_URL || "http://localhost:3000";
logger.info(FRONTEND_URL);

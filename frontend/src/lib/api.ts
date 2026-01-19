import type { App } from "@api/index";
import { BACKEND_URL } from "@/constants";
import { treaty } from "@elysiajs/eden";

export const api = treaty<App>(BACKEND_URL, {
	fetch: {
		credentials: "include",
	},
});

export type Api = App;
export type { databaseTypes } from "@api/index";
export type { requestTypes } from "@api/index";

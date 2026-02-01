import type { App, databaseTypes } from "@k8s-dashboard/backend";
import { BACKEND_URL } from "@/constants";
import { treaty } from "@elysiajs/eden";
import type { TSchema, Static } from "@sinclair/typebox";

export const api = treaty<App>(BACKEND_URL, {
	fetch: {
		credentials: "include",
	},
});

export type SchemaStatic<P extends Record<string, TSchema>> = {
	[T in keyof P]: Static<P[T]>;
};

export type { databaseTypes } from "@api/index";
export type { requestTypes } from "@api/index";
export type SchemaType = {
	[T in keyof databaseTypes.databaseTypes]: SchemaStatic<
		databaseTypes.databaseTypes[T]
	>;
};

export type Api = App;

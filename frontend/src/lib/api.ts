import { treaty } from "@elysiajs/eden";
import type { App, databaseTypes } from "@k8s-dashboard/backend";
import type { Static, TSchema } from "@sinclair/typebox";
import { BACKEND_URL } from "@/constants";

export const api = treaty<App>(BACKEND_URL, {
	fetch: {
		credentials: "include",
		redirect: "follow",
	},
});

export type SchemaStatic<P extends Record<string, TSchema>> = {
	[T in keyof P]: Static<P[T]>;
};

export type { databaseTypes, requestTypes } from "@k8s-dashboard/backend";
export type SchemaType = {
	[T in keyof databaseTypes.databaseTypes]: SchemaStatic<
		databaseTypes.databaseTypes[T]
	>;
};

export type Api = App;

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

/**
 * Safely extracts an error message from an Eden (treaty) response error.
 */
export function getEdenErrorMessage(error: any): string {
	if (!error) return "An unknown error occurred";
	const value = error.value;
	if (typeof value === "string") return value;
	console.log(error);
	if (error.type === "validation") {
		const errorValue = error as {
			type: "validation";
			on: string;
			summary?: string;
			message?: string;
			found: unknown;
			property?: string;
			expected?: string;
		};
		const errorMessage =
			errorValue.message ||
			`${errorValue.property || "Field"} is invalid: expected ${errorValue.expected}, but found ${JSON.stringify(errorValue.found)}` ||
			errorValue.summary ||
			"A validation error occurred.";
		return errorMessage;
	}
	if (error.status === 422) {
		const errorValue = error.value as {
			type: "validation";
			on: string;
			summary?: string;
			message?: string;
			found: unknown;
			property?: string;
			expected?: string;
		};
		const errorMessage =
			errorValue.message ||
			`${errorValue.property || "Field"} is invalid: expected ${errorValue.expected}, but found ${JSON.stringify(errorValue.found)}` ||
			errorValue.summary ||
			"A validation error occurred.";
		return errorMessage;
	}
	if (value && typeof value === "object" && "message" in value) {
		return (value as { message: string }).message;
	}
	return JSON.stringify(value || error.message || error);
}

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

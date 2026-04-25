import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Recursively replaces all empty strings in an object with undefined.
 * Handles nested objects and arrays.
 */
export function replaceEmptyStringsWithUndefined<T>(obj: T): T {
	if (obj === null || obj === undefined) {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => replaceEmptyStringsWithUndefined(item)) as T;
	}

	if (typeof obj === "object") {
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(obj)) {
			const processedValue =
				typeof value === "string" && value.trim() === ""
					? undefined
					: replaceEmptyStringsWithUndefined(value);
			if (processedValue !== undefined) {
				result[key] = processedValue;
			}
		}
		return result as T;
	}

	return obj;
}

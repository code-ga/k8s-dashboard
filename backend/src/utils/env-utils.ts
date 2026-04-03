import { decrypt } from "./crypto";
import { logger } from "./logger";

/**
 * Decrypts and parses environment variables, supporting both new array format
 * and legacy record format for backward compatibility.
 */
export function decryptEnvVars(
	encrypted: string | null | undefined,
	label: string,
): Array<{ name: string; value?: string; valueFrom?: any }> {
	if (!encrypted) return [];
	try {
		const decrypted = decrypt(encrypted);
		if (!decrypted) return [];
		
		const parsed = JSON.parse(decrypted);
		if (Array.isArray(parsed)) {
			return parsed;
		}
		// Backward compatibility: convert map to array
		if (typeof parsed === "object" && parsed !== null) {
			return Object.entries(parsed).map(([name, value]) => ({
				name,
				value: value as string,
			}));
		}
		return [];
	} catch (e) {
		logger.error(`Failed to decrypt/parse env vars for ${label}`, e);
		return [];
	}
}

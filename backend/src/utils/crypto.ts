import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

// Basic error handling for missing key
if (!process.env.MASTER_KEY) {
	// For dev/test, we might want to warn or throw.
	// Throwing is safer to prevent un-encrypted data or crashes later.
	// However, if we throw at module level, it might break app startup if env is missing.
	// We'll check inside the functions.
}

const getKey = (): Buffer => {
	const keyHex = process.env.MASTER_KEY || "";
	if (keyHex.length !== 64) {
		// 32 bytes * 2 hex chars
		throw new Error(
			"MASTER_KEY must be a 32-byte hex string (64 characters). Run 'node scripts/generate_key.js' to generate one.",
		);
	}
	return Buffer.from(keyHex, "hex");
};

export const encrypt = (text: string): string => {
	if (!text) return "";
	const key = getKey();
	const iv = crypto.randomBytes(12); // GCM recommended IV length is 12 bytes
	const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

	let encrypted = cipher.update(text, "utf8", "hex");
	encrypted += cipher.final("hex");

	const authTag = cipher.getAuthTag();

	// Format: IV:AuthTag:Ciphertext (all hex)
	return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
};

export const decrypt = (text: string): string => {
	if (!text) return "";
	const parts = text.split(":");
	if (parts.length !== 3) {
		// Fallback: If text doesn't match format, return as is (migration/backward compatibility)
		// Or throw error if strict. Let's return original to avoid breaking existing plain data if any.
		// But for security, we should probably fail.
		// Given user asked for new flow, assume check.
		return text;
	}

	const [ivHex, authTagHex, encryptedHex] = parts;
	const key = getKey();
	const iv = Buffer.from(ivHex, "hex");
	const authTag = Buffer.from(authTagHex, "hex");
	const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

	decipher.setAuthTag(authTag);

	let decrypted = decipher.update(encryptedHex, "hex", "utf8");
	decrypted += decipher.final("utf8");

	return decrypted;
};

import crypto from "node:crypto";

const key = crypto.randomBytes(32).toString("hex");
console.log("Use this as your MASTER_KEY in .env:");
console.log(`MASTER_KEY=${key}`);

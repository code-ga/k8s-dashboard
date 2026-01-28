import type { TSchema, Static } from "elysia";
import { schema } from "./schema";
import { spreads } from "./speard";

export const dbSchemaTypes = spreads(schema, "select");

export type SchemaStatic<P extends Record<string, TSchema>> = {
	[T in keyof P]: Static<P[T]>;
};
export type SchemaType = {
	[T in keyof databaseTypes]: SchemaStatic<databaseTypes[T]>;
};

export type databaseTypes = typeof dbSchemaTypes;

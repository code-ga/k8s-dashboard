import { type Static, type TSchema, Type, Type as t } from "@sinclair/typebox";

export const baseResponseSchema = <T extends TSchema>(dataSchema: T) => {
	return t.Object({
		success: t.Boolean(),
		message: t.Optional(t.String()),
		data: dataSchema,
		timestamp: Type.Transform(Type.Optional(Type.Number()))
			.Decode((value) => value ?? Date.now()) // Set dynamic default on decode
			.Encode((value) => value),
		status: t.Optional(
			t.Number({
				default: 200,
			}),
		),
	});
};

export type BaseResponse<T extends TSchema> = Static<
	ReturnType<typeof baseResponseSchema<T>>
>;

export const paginatedResponseSchema = <T extends TSchema>(dataSchema: T) => {
	return baseResponseSchema(
		t.Object({
			items: t.Array(dataSchema),
			total: t.Number(),
			page: t.Number(),
			pageSize: t.Number(),
			totalPages: t.Number(),
		}),
	);
};

export type PaginatedResponse<T extends TSchema> = Static<
	ReturnType<typeof paginatedResponseSchema<T>>
>;

export const errorResponseSchema = t.Object({
	success: t.Boolean({ default: false }),
	message: t.String(),
	timestamp: Type.Transform(Type.Optional(Type.Number()))
		.Decode((value) => value ?? Date.now()) // Set dynamic default on decode
		.Encode((value) => value),
	status: t.Optional(
		t.Number({
			default: 500,
		}),
	),
});
export type ErrorResponse = Static<typeof errorResponseSchema>;

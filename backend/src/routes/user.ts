import Elysia from "elysia";
import { authenticationMiddleware } from "../middleware/auth";
import { t } from "elysia";
import { dbSchemaTypes } from "../database/type";
import { schema } from "../database/schema";
import { db } from "../database";
import { eq } from "drizzle-orm";

export const userRouter = new Elysia({prefix: "/user"})
.use(authenticationMiddleware)
.patch("/set-role", async(ctx) => {
  const {userId, role} = ctx.body;
  if (userId === ctx.user.id && role !== "admin") {
    return ctx.status(400, {
      success: false,
      message: "You cannot set your own role to admin",
      timestamp: Date.now(),
    });
  }
  const userRole = await db.update(schema.userRole).set({
    role: role,
  }).where(eq(schema.userRole.userId, userId)).returning();
  if (!userRole || !userRole[0]) {
    return ctx.status(404, {
      success: false,
      message: "User not found",
      timestamp: Date.now(),
    });
  }
  return ctx.status(200, {
    success: true,
    message: "User role updated successfully",
    data: userRole[0],
    timestamp: Date.now(),
  });
}, {
	body: t.Object({
		userId: dbSchemaTypes.userRole.userId,
		role: dbSchemaTypes.userRole.role,
	}),
  adminAuth: "admin",
  userAuth:true,
})

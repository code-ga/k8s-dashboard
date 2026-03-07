import { logger } from "../utils/logger";
import { eq } from "drizzle-orm";
import Elysia, { type Context } from "elysia";
import type { Prettify, RouteSchema } from "elysia/types";
import type { ElysiaWS } from "elysia/ws";
import { EventEmitter } from "events";
import {
	type Command,
	type CommandResponse,
	ServerPayload,
	type StreamData,
} from "../../pb-generated/agent-backend/websocket";
import { db } from "../database";
import { agentCommands } from "../database/schema";

interface EventMap extends Record<string, any[]> {
	"agent/connected": [{ agentId: string }];
	"agent/disconnected": [{ agentId: string }];
	"command/completed": [{ commandId: string; response: CommandResponse }];
	"command/failed": [{ commandId: string; error: string }];
}

export class AgentManager extends EventEmitter<EventMap> {
	instanceId: string;
	private connections: Map<
		number,
		Prettify<ElysiaWS<Omit<Context, "body">, RouteSchema>>
	> = new Map();
	private pendingCommands: Map<
		string,
		{
			resolve: (value: CommandResponse) => void;
			reject: (reason?: unknown) => void;
			timeout?: ReturnType<typeof setTimeout>; // Make timeout optional for rehydrated commands
		}
	> = new Map();
	private streamSessions: Map<
		string,
		{
			userWs: Prettify<ElysiaWS<Omit<Context, "body">, RouteSchema>>;
			agentId: number;
		}
	> = new Map();

	pendingCommandIntervalId: NodeJS.Timeout;

	constructor() {
		super();
		this.instanceId = crypto.randomUUID();
		logger.info(`AgentManager initialized with instanceId: ${this.instanceId}`);
		this.pendingCommandIntervalId = this.pendingCommandInterval();
	}

	async registerConnection(
		agentId: number,
		ws: Prettify<ElysiaWS<Omit<Context, "body">, RouteSchema>>,
	) {
		this.connections.set(agentId, ws);
		logger.info(`Agent ${agentId} registered`);
		await this.processPendingCommands(agentId);
	}

	removeConnection(agentId: number) {
		this.connections.delete(agentId);
		logger.info(`Agent ${agentId} disconnected`);
	}

	private pendingCommandInterval() {
		// Periodically check for pending commands every minute
		return setInterval(async () => {
			for (const agentId of this.connections.keys()) {
				await this.processPendingCommands(agentId);
			}
		}, 60000); // 60 seconds
	}

	async processPendingCommands(agentId: number) {
		logger.info(`Processing pending commands for agent ${agentId}...`);
		const pendingDbCommands = await db.query.agentCommands.findMany({
			where: {
				agentId,
				status: "pending",
			},
			orderBy: {
				createdAt: "asc",
			},
			limit: 3,
		});

		while (pendingDbCommands.length > 0) {
			const dbCmd = pendingDbCommands.shift();
			if (!dbCmd) break;

			logger.info(`Sending command ${dbCmd.id} to agent ${agentId}`);

			const command = dbCmd.payload as Command;
			// Ensure ID matches
			command.id = dbCmd.id;

			// We don't await the result of send here to process all in order,
			// but we do fire and forget the send logic which might fail if connection drops
			this._sendPayload(agentId, command, dbCmd.id).catch((err) => {
				logger.error(`Failed to send pending command ${dbCmd.id}:`, err);
			});
		}
	}

	async sendCommand(
		agentId: number,
		clusterId: number,
		command: Command,
	): Promise<CommandResponse> {
		if (!command.id) {
			const commandId = crypto.randomUUID();
			command.id = commandId;
		}

		// Persist 'pending' command
		await db
			.insert(agentCommands)
			.values({
				id: command.id,
				agentId,
				clusterId,
				type: command.type.toString(),
				payload: command,
				status: "pending",
			})
			.returning();
		logger.info(`Command ${command.id} sent to agent ${agentId}`);

		return this._sendPayload(agentId, command, command.id);
	}

	// Helper to send payload and manage in-memory pending state
	private async _sendPayload(
		agentId: number,
		command: Command,
		commandId: string,
	): Promise<CommandResponse> {
		const ws = this.connections.get(agentId);

		if (!ws) {
			logger.info(
				`Agent ${agentId} not connected, command ${commandId} queued.`,
			);
			// Validate payload to ensure it matches Command expectations if needed,
			// but primarily return a 'Queued' response.
			return {
				id: commandId,
				success: true,
				data: "Command queued (Agent disconnected)",
				error: "",
				type: command.type,
			} as CommandResponse;
		}

		logger.info("Sending payload:", command);
		const payload = ServerPayload.encode({ command }).finish();

		// Update to 'sent'
		await db
			.update(agentCommands)
			.set({ status: "sent", updatedAt: new Date() })
			.where(eq(agentCommands.id, commandId));

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(async () => {
				if (this.pendingCommands.has(commandId)) {
					this.pendingCommands.delete(commandId);
					await db
						.update(agentCommands)
						.set({
							status: "timeout",
							updatedAt: new Date(),
						})
						.where(eq(agentCommands.id, commandId));
					reject(new Error("Command timed out"));
				}
			}, 30000); // 30s timeout

			this.pendingCommands.set(commandId, { resolve, reject, timeout });

			try {
				const buffer = Buffer.from(payload);
				ws.send(buffer);
			} catch (error: any) {
				clearTimeout(timeout);
				this.pendingCommands.delete(commandId);

				// Mark as failed immediately
				db.update(agentCommands)
					.set({
						status: "failed",
						updatedAt: new Date(),
						errorMessage: error.message || "Failed to send",
					})
					.where(eq(agentCommands.id, commandId))
					.then(() => {})
					.catch(console.error);

				reject(error);
			}
		});
	}

	// batchCommands method modified to remove maxRetries
	async batchCommands(agentId: number, clusterId: number, commands: Command[]) {
		const updates = commands.map((cmd) => {
			const commandId = crypto.randomUUID();
			cmd.id = commandId;
			return {
				id: commandId,
				agentId,
				clusterId,
				type: cmd.type.toString(),
				payload: cmd,
				status: "pending" as const, // Explicit cast for Drizzle enum
			};
		});

		if (updates.length > 0) {
			await db.insert(agentCommands).values(updates);
		}

		// Trigger processing
		// this.processPendingCommands(agentId).catch(console.error);

		return updates.map((u) => u.id);
	}

	async handleCommandResponse(response: CommandResponse) {
		const pending = this.pendingCommands.get(response.id);

		const status: "success" | "failed" = response.success
			? "success"
			: "failed";

		// Update DB
		await db
			.update(agentCommands)
			.set({
				status,
				result: response,
				errorMessage: response.error,
				updatedAt: new Date(),
			})
			.where(eq(agentCommands.id, response.id));

		// Emit events
		if (response.success) {
			this.emit("command/completed", { commandId: response.id, response });
		} else {
			this.emit("command/failed", {
				commandId: response.id,
				error: response.error || "Unknown error",
			});
		}

		if (pending) {
			if (pending.timeout) clearTimeout(pending.timeout);
			this.pendingCommands.delete(response.id);
			if (response.success) {
				pending.resolve(response);
			} else {
				pending.reject(new Error(response.error || "Unknown agent error"));
			}
		} else {
			logger.warn(
				`Received response for command ID: ${response.id} but no pending request found (possibly timed out or server restarted)`,
				{ responseId: response.id, success: response.success }
			);
		}
	}

	// For manual polling or logs
	async getCommandLog(agentId: number, limit = 50) {
		return db.query.agentCommands.findMany({
			where: {
				agentId,
			},
			orderBy: {
				createdAt: "desc",
			},
			limit,
		});
	}

	getConnection(agentId: number) {
		return this.connections.get(agentId);
	}

	async startStream(
		agentId: number,
		clusterId: number,
		commandType: number,
		payloadStr: string,
		userWs: Prettify<ElysiaWS<Omit<Context, "body">, RouteSchema>>,
	): Promise<string> {
		const streamId = crypto.randomUUID();
		this.streamSessions.set(streamId, { userWs, agentId });

		try {
			// Send the command to start the stream. Agent should acknowledge with CommandResponse.
			// streamId is passed as the Command ID so we can correlate.
			await this.sendCommand(agentId, clusterId, {
				id: streamId,
				type: commandType,
				payload: payloadStr,
				targetName: "",
				targetNamespace: "",
			});
			return streamId;
		} catch (error) {
			logger.error("Failed to start stream:", error);
			this.streamSessions.delete(streamId);
			throw error;
		}
	}

	async stopStream(streamId: string) {
		const session = this.streamSessions.get(streamId);
		logger.info(`Stopping stream ${streamId} for agent ${session?.agentId}`);
		if (session) {
			// Notify agent to close stream
			await this.sendStreamDataToAgent(session.agentId, {
				streamId,
				data: new Uint8Array(0),
				isError: false,
				closed: true,
				type: 0, // DATA
				rows: 0,
				cols: 0,
			});
			this.streamSessions.delete(streamId);
		}
	}

	handleStreamData(data: StreamData) {
		const session = this.streamSessions.get(data.streamId);
		// logger.info(
		// 	`Handling stream data for streamId: ${data.streamId} `,
		// 	data,
		// 	" session found: ",
		// 	session,
		// );
		if (!session) return;

		if (data.closed) {
			// Stream closed by agent (e.g. process exited)
			// Close user connection? Or just send a message?
			// Usually we close the user WS.
			// Check if userWs is open first? Elysia/Bun handles this?
			try {
				session.userWs.close();
			} catch (e) {
				// ignore
			}
			this.streamSessions.delete(data.streamId);
			return;
		}

		if (data.data && data.data.length > 0) {
			try {
				logger.info(
					`Forwarding stream data to user for streamId: ${data.streamId}`,
				);
				const buffer = Buffer.from(data.data);
				session.userWs.send(buffer);
			} catch (e) {
				logger.error("Failed to send data to user", e);
				this.stopStream(data.streamId);
			}
		}
	}

	async sendStreamDataToAgent(agentId: number, data: StreamData) {
		const ws = this.connections.get(agentId);
		if (ws) {
			const payload = ServerPayload.encode({ streamData: data }).finish();
			const buffer = Buffer.from(payload);
			ws.send(buffer);
		}
	}

	// Helper method for sending resize events from frontend to agent
	async sendResizeEvent(streamId: string, rows: number, cols: number) {
		const session = this.streamSessions.get(streamId);
		if (session) {
			await this.sendStreamDataToAgent(session.agentId, {
				streamId,
				data: new Uint8Array(0),
				isError: false,
				closed: false,
				type: 1, // RESIZE
				rows,
				cols,
			});
		}
	}
}

export const agentManager = new AgentManager();

export const agentManagerService = new Elysia({
	name: "service/agent-manager",
}).decorate("agentManager", agentManager);

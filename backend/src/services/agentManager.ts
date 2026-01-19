import Elysia, { type Context } from "elysia";
import { EventEmitter } from "events";
import {
	type Command,
	type CommandResponse,
	ServerPayload,
} from "../../pb-generated/agent-backend/websocket";
import type { ElysiaWS } from "elysia/ws";
import type { Prettify, RouteSchema } from "elysia/types";

interface EventMap extends Record<string, any[]> {
	"agent/connected": [{ agentId: string }];
	"agent/disconnected": [{ agentId: string }];
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
			reject: (reason?: any) => void;
			timeout: Timer;
		}
	> = new Map();

	constructor() {
		super();
		this.instanceId = crypto.randomUUID();
		console.log(`AgentManager initialized with instanceId: ${this.instanceId}`);
	}

	registerConnection(
		agentId: number,
		ws: Prettify<ElysiaWS<Omit<Context, "body">, RouteSchema>>,
	) {
		this.connections.set(agentId, ws);
		console.log(`Agent ${agentId} registered`);
	}

	removeConnection(agentId: number) {
		this.connections.delete(agentId);
		console.log(`Agent ${agentId} disconnected`);
	}

	async sendCommand(
		agentId: number,
		command: Command,
	): Promise<CommandResponse> {
		const ws = this.connections.get(agentId);
		if (!ws) {
			throw new Error(`Agent ${agentId} not connected`);
		}

		const commandId = crypto.randomUUID();
		command.id = commandId;

		const payload = ServerPayload.encode({ command }).finish();

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				if (this.pendingCommands.has(commandId)) {
					this.pendingCommands.delete(commandId);
					reject(new Error("Command timed out"));
				}
			}, 30000); // 30s timeout

			this.pendingCommands.set(commandId, { resolve, reject, timeout });

			try {
				ws.send(payload);
			} catch (error) {
				clearTimeout(timeout);
				this.pendingCommands.delete(commandId);
				reject(error);
			}
		});
	}

	handleCommandResponse(response: CommandResponse) {
		const pending = this.pendingCommands.get(response.id);
		if (pending) {
			clearTimeout(pending.timeout);
			this.pendingCommands.delete(response.id);
			if (response.success) {
				pending.resolve(response);
			} else {
				pending.reject(new Error(response.error || "Unknown agent error"));
			}
		} else {
			console.warn(`Received response for unknown command ID: ${response.id}`);
		}
	}

	getConnection(agentId: number) {
		return this.connections.get(agentId);
	}
}

export const agentManagerService = new Elysia({
	name: "service/agent-manager",
}).decorate("agentManager", new AgentManager());

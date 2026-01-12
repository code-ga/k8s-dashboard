import Elysia from "elysia";
import { EventEmitter } from "events";

interface EventMap extends Record<string, any[]> {
	"agent/connected": [{ agentId: string }];
	"agent/disconnected": [{ agentId: string }];
}

export class AgentManager extends EventEmitter<EventMap> {
	instanceId: string;
	private connections: Map<number, any> = new Map();
	private pendingCommands: Map<
		string,
		{ resolve: (value: any) => void; reject: (reason?: any) => void }
	> = new Map();

	constructor() {
		super();
		this.instanceId = crypto.randomUUID();
		console.log(`AgentManager initialized with instanceId: ${this.instanceId}`);
	}

	registerConnection(agentId: number, ws: any) {
		this.connections.set(agentId, ws);
		console.log(`Agent ${agentId} registered`);
	}

	removeConnection(agentId: number) {
		this.connections.delete(agentId);
		console.log(`Agent ${agentId} disconnected`);
	}

	async sendCommand(agentId: number, commandType: string, payload: any) {
		const ws = this.connections.get(agentId);
		if (!ws) {
			throw new Error(`Agent ${agentId} not connected`);
		}

		const commandId = crypto.randomUUID();
		const command = {
			id: commandId,
			type: commandType,
			payload: JSON.stringify(payload),
		};

		// In a real implementation, we would encode this using Protobuf
		// For now, we'll assume the handleMessage in agent.ts will do the encoding
		// OR we expose a method on the 'ws' object to send encoded data?
		// Better: return the command object and let the route handler send it?
		// No, we want to await the response here.

		// We need to hook into the message handler to resolve this promise using commandId.
		// For now, let's just implement the 'send' part and simple Ack.
		// Detailed request/response matching requires more logic in agent.ts
        
        // Let's rely on agent.ts to use this manager to send stuff.
        // Actually, if we want `nodes.ts` to call `agentManager.getNodeToken()`,
        // `agentManager` needs to hold the WS and SEND.
        
        // NOTE: We will implement a simplified version where we just return the command to be sent 
        // if this was synchronous, but since it's async/event-based, we need a way to send.

        // Assuming `ws` has a `.send()` method.
        // We will need the Protobuf definitions here to encode if we do it here.
        // To avoid circular deps or complex imports, let's emit an event or expects `ws` to be smart?
        
        // Alternative: Pass the command to `ws.send()`.
        // But we need to encode it into `ServerPayload`.
        
        // Let's simply expose `getConnection(agentId)` so services can use it?
        // No, encapsulation is better.
        
        // Let's try to assume agent.ts handles the actual socket "send" invocation if we return it?
        // No, `nodes.ts` calls `agentManager`.
        
        // Let's add `sendPayload(agentId, buffer)`
        ws.send(payload); // payload should be Uint8Array (ServerPayload)
	}
    
    getConnection(agentId: number) {
        return this.connections.get(agentId);
    }
}

export const agentManagerService = new Elysia({
	name: "service/agent-manager",
}).decorate("agentManager", new AgentManager());

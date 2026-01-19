import Elysia from "elysia";
import { db } from "../database";
import { schema } from "../database/schema";
import type { AppState } from "../database/schema";
import { eq } from "drizzle-orm";

export class AppStateService {
	instanceId: string;
	appState!: AppState;
	constructor() {
		this.instanceId = crypto.randomUUID();
		console.log(`AppState initialized with instanceId: ${this.instanceId}`);
		this.loadAppState();
	}

	async loadAppState() {
		const appState = await db.select().from(schema.AppState).limit(1);
		if (!appState || appState.length === 0 || !appState[0]) {
			// create new app state
			await db.insert(schema.AppState).values({
				state: {
					createNewAdmin: true,
				},
			});
			this.appState = {
				createNewAdmin: true,
			};
			return;
		}
		this.appState = appState[0].state;
	}

	async updateAppState(appState: Partial<AppState>) {
		await db
			.update(schema.AppState)
			.set({
				state: {
					...this.appState,
					...appState,
				},
			})
			.where(eq(schema.AppState.id, 1));
		this.appState = {
			...this.appState,
			...appState,
		};
	}

	async deleteAppState() {
		await db.delete(schema.AppState).where(eq(schema.AppState.id, 1));
		await this.loadAppState();
	}

	async createAppState() {
		await db.insert(schema.AppState).values({
			state: {
				createNewAdmin: false,
			},
		});
		await this.loadAppState();
	}

	async resetAppState() {
		await db.delete(schema.AppState).where(eq(schema.AppState.id, 1));
		await this.createAppState();
	}

	async getAppState() {
		return this.appState;
	}
}

export const appStateService = new Elysia({
	name: "service/app-state",
}).decorate("appState", new AppStateService());

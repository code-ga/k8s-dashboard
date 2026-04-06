# 🚀 K3s Cloud-Native PaaS Dashboard (Agent Context & Project Description)

> **FOR AI AGENTS & CONTRIBUTORS**: This document is the ultimate source of truth for the project's architecture, patterns, and workflows. Read this entirely before writing any code or proposing solutions.

## 📝 Overview
A modern "Cloud Run on Bare Metal" Platform-as-a-Service (PaaS) interface built on top of K3s. It provides a developer-friendly experience for managing multiple clusters and deploying applications with a focus on real-time observability.

---

## 🏗️ Architecture & Core Components

This project strictly adheres to a **Real-Time State Sync Architecture**. It does not use standard REST polling or gRPC to fetch Kubernetes state on demand.

### 1. The Cluster Agent (`/agent` in Go)
- **Tech Stack**: GoLang, `client-go`, Protobuf over WebSockets.
- **Responsibility**: Runs inside the K3s cluster. Maintains a persistent WebSocket tunnel back to the Backend.
- **How it works**:
  - The agent binds to the K8s API using internal informers.
  - Every few seconds, it bundles all `Pods`, `Deployments`, `Services`, `Nodes`, `Ingresses`, and `PVCs` into a massive **`Heartbeat`** Protobuf message (`protobuf/agent-backend/websocket.proto`).
  - It pushes this `Heartbeat` to the backend socket.
  - It also listens for execution commands sent down from the socket (e.g., `CREATE_DEPLOYMENT`, `DELETE_PVC`, `RESIZE_PVC`), runs them against the K8s API, and sends an execution acknowledgment.

### 2. Control Plane / Backend (`/backend` in TypeScript/Bun)
- **Tech Stack**: TypeScript, Bun, Elysia.js, Drizzle ORM, PostgreSQL, Better Auth.
- **Responsibility**: Centralized multi-cluster orchestration, command routing, state persistence, RBAC enforcement.
- **How it works**:
  - Exposes a WebSocket endpoint for the Agent to connect to.
  - Unpacks the incoming `Heartbeat` payloads and **upserts** the state into PostgreSQL tables (`k8sPods`, `k8sDeployments`, `k8sServices`, `k8sPersistentVolumeClaims`, etc.) using Drizzle ORM transactions.
  - Exposes REST APIs for the Frontend. When a user requests to mutate something (e.g., create a PVC), the backend **does not execute it immediately**. It creates a record in the `agentCommands` table with status `pending`, pushes a Protobuf `Command` to the agent's WebSocket, and waits for a success/failure callback.

### 3. Frontend (`/frontend` in React)
- **Tech Stack**: React 19, Vite, TanStack Router (file-based routing), TanStack Query (data fetching), Tailwind CSS, Shadcn UI, xterm.js.
- **How it works**:
  - Uses TanStack Query to fetch state from the Backend's REST endpoints (which just read from the PostgreSQL database).
  - Listens to WebSocket events on the frontend side to invalidate TanStack queries, ensuring instant UI updates when a K8s resource changes in the backend DB.
  - Enforces RBAC locally on UI components using exported permission checks, hiding buttons users can't access.

---

## 🔒 Security & RBAC System (`backend/src/constants/permissions.ts`)

The project uses a highly fine-grained strict Role-Based Access Control (RBAC) system. 
- **Definition**: All permissions are centrally defined in `permissions.ts` by mapping a resource name to its actions (e.g., `cluster:read`, `deployment:update`).
- **Storage Strategy**: New infrastructure features (like StorageClasses, PVs, PVCs) require adding new definitions to `RESOURCE_DEFINITIONS` in `permissions.ts` (e.g., `pv:read`, `pv:delete`, `pv:manage`).
- **Enforcement**:
  - Frontend: UI components use hooks and the permission DSL (like `or(not('role:read'), 'user:manage')`) to conditionally render elements.
  - Backend: Route middleware intercepts API requests explicitly specifying required permission levels.

---

## 🔄 How to Add a New Kubernetes Resource Feature

If you are asked to support a new K8s resource (e.g., *PersistentVolumeClaims*, *CronJobs*), follow this exact flow:

1. **Protobuf Updates**: Add your resource fields and structs to the `Heartbeat` message in `protobuf/agent-backend/websocket.proto`. Add mutate actions to `Command.CommandType` (e.g., `CREATE_PVC`, `DELETE_PVC`).
2. **Go Agent**: Update to sync the resource. Informers gather the items, marshal them into the Protobuf objects, and embed them in the `Heartbeat`. Handle the new incoming commands in the agent router.
3. **Backend Database**: The schema is modularized in `backend/src/database/schema/`.
   - `auth.ts`: User, session, account, verification, role, profile.
   - `cluster.ts`: k8sCluster, k8sClusterNode, clusterAgent.
   - `agent-commands.ts`: agentCommandStatus, agentCommands.
   - `k8s-resources.ts`: k8sDeployments, k8sPods, k8sServices, k8sIngresses, k8sConfigMaps, k8sSecrets, k8sPersistentVolumeClaims.
   - `k8s-normalized.ts`: podPorts, deploymentPorts, and all reference/item tables.
   - `app.ts`: AppState, gatewayPorts.
   - `relations.ts`: Defines `schema` and `schemaRelations`.
   - `index.ts`: Central entry point.
   - The original `backend/src/database/schema.ts` re-exports everything for backward compatibility.
4. **Backend Sync Logic**: Update the WebSocket socket handler to process the new arrays in the `Heartbeat`, performing `bulk upsert` into PostgreSQL. Add garbage collection for deleted resources (diffing UID maps).
5. **Backend API**: Expose REST endpoints (e.g., `GET /api/clusters/:id/pvcs`) to fetch the state from Postgres.
6. **Frontend UI**: Route setup in `frontend/src/routes/dashboard/cluster/$id/...`. Consume APIs using TanStack Query.
7. **RBAC**: Define the permissions for the resource in `permissions.ts` and require them appropriately across the stack.

### 🍱 Feature Flow: Persistent Volume Claims (PVC)
1. **Sync**: `agent/service/k8s/stats.go` -> `GetPVCs()` -> `Heartbeat.pvcs` -> `backend/src/services/agent.service.ts` -> `syncPVCs()` -> `k8sPersistentVolumeClaims` Table.
2. **Read**: `frontend/src/routes/dashboard/cluster/$id/pvcs/index.tsx` calls `GET /api/pvcs/:clusterId`.
3. **Create**: `frontend/src/routes/dashboard/cluster/$id/pvcs/create.tsx` calls `POST /api/pvcs/:clusterId` -> Sends `CREATE_PVC` command.
4. **Resizing**: `frontend/src/components/cluster/pvc-resize-modal.tsx` calls `PATCH /api/pvcs/:clusterId/:id` -> Sends `RESIZE_PVC` command.
5. **Delete**: `frontend/src/routes/dashboard/cluster/$id/pvcs/index.tsx` calls `DELETE /api/pvcs/:clusterId/:id` -> Sends `DELETE_PVC` command.
- *Note*: Storage expansion is supported via the UI, but shrinking is restricted by Kubernetes.

---

## 🛠️ Roadmap (Upcoming Features)

    - [x] **Storage & Volume Management**: 
    - [x] **Milestone 1 (PVC Full CRUD)**: Implemented Protobuf sync, Backend CRUD (Sync/Create/Resize/Delete), and Dashboard UI for PVCs.
    - [x] **Milestone 2 (StorageClasses & PVs)**: Implemented Protobuf sync (StorageClass, PV), Agent sync functions, Backend DB schemas, CRUD API routes, manifest generators, and RBAC permissions.
    - [x] **Milestone 3 (Pod Creation Integration)**: Add volume mount builder to Deployment/Pod creation forms. Integrated PVC and emptyDir support across manifest generation, ownership validation, and UI details.
- [ ] **Virtual Cluster Isolation**: Native namespace isolation with `NetworkPolicies` and `RoleBindings`.
- [ ] **Scale-to-Zero**: Integration with **Sablier** and Traefik for request-based automatic scaling.
- [ ] **Compose-to-K8s**: Support for `docker-compose.yml` conversion via Kompose.
- [ ] **Infrastructure Auto-Provisioning**: Automated setup of **GarageHQ** (S3) and **CloudNativePG** (DB) using K3s Helm Controller.

---

## ⚠️ Notes & Warnings for AIs 
1. **Never write synchronous API calls to K8s from the Backend!** All mutations must go into `agentCommands` and be sent over WebSockets.
2. **Do not hallucinate gRPC!** Despite using Protobuf, the transport is strictly raw WebSockets (`ws://`).
3. **Pointers/Nullability**: The Drizzle Postgres schema extensively uses relationships (`cluster_id`, `node_id`, `owner_id`). Handle unassigned refs carefully (Wait for resources to sync before assigning relationships).
4. **Real-time UI**: Any form execution (e.g. "Save Configuration") on the frontend must submit the API command, then visually transition to a "Pending" state, relying on TanStack Query invalidation via WebSocket broadcasts to turn "Green" when the agent succeeds.

---
- [x] **Env Var Refactoring**: Transitioned from flat `Record<string, string>` to structured `[]EnvVar` array to support Kubernetes Downward API (`fieldRef`). Fixed across Agent (Go), Backend (TS), and Frontend (React) with backward compatibility for legacy records.

## 🔗 Feature Flow: Kubernetes Downward API (fieldRef)
1. **Agent**: `agent/service/k8s/stats.go` now serializes the full `corev1.EnvVar` array instead of flattening it.
   - `backend/src/utils/env-utils.ts`: Centralized utility to decrypt and parse environment variables, handling migration from legacy formats.
   - `backend/src/utils/k8s-manifest.ts` handles structured arrays in `generatePodManifest` and `generateDeploymentManifest`.
   - `backend/src/services/agent.service.ts` decrypts `envVariables` and converts legacy maps to the new array format.
   - `backend/src/routes/deployment.ts` and `pod.ts` validation schemas updated to `Type.Array(Type.Object({ ... }))`.
3. **Frontend**:
   - `frontend/src/components/shared/env-editor.tsx` updated with a "Type" selector (Text vs FieldRef) and auto-complete for common `fieldPath` values.
   - `deployments/$id.tsx`, `pods/$id.tsx`, and creation forms updated to map UI state to the new structured API payload.

- [x] **Storage Volume Mounts**: Integrated support for attaching Persistent Volume Claims (PVC) and temporary `emptyDir` volumes to Pods and Deployments.

## 🔗 Feature Flow: Storage Volume Mounts (M3)
1. **Manifest Generator**: `backend/src/utils/k8s-manifest.ts` uses `PodDTO` and `DeploymentDTO` containing volume data to generate YAML segments.
2. **Resource Validation**: `backend/src/utils/resource-refs.ts` defining `validateResourceRefs` checks PVC ownership.
3. **Database Layer**: `backend/src/database/schema/k8s-normalized.ts` stores relationships; CRUD handled in `resource-refs.ts`.
4. **API Routes**: `backend/src/routes/pod.ts` / `deployment.ts` handle POST/PATCH and manifest coordination.
5. **Frontend UI**: Shared `VolumeMountEditor.tsx` integrated across creation and detail/edit pages.

---

## 🔗 Feature Flow: StorageClasses & PersistentVolumes (M2)

### StorageClass (cluster-wide resource)
1. **Protobuf**: Added `StorageClass` message to `protobuf/agent-backend/websocket.proto` with fields: `name`, `provisioner`, `reclaim_policy`, `volume_binding_mode`, `allow_volume_expansion`, `annotations`, `labels`, `resource_config`.
2. **Command Types**: Added `CREATE_STORAGE_CLASS`, `DELETE_STORAGE_CLASS`, `SET_DEFAULT_STORAGE_CLASS`.
3. **Agent**: `agent/service/k8s/resources.go` adds `GetStorageClasses()` using `client-go StorageV1()`. `stats.go` serializes into `Heartbeat.storageClasses`.
4. **Command Handler**: `agent/command.go` handles StorageClass creation/deletion and default annotation updates.
5. **Database**: Added `k8sStorageClasses` table in `backend/src/database/schema/k8s-resources.ts` with clusterId, name, provisioner, reclaimPolicy, volumeBindingMode, allowVolumeExpansion, isDefault.
6. **Backend Sync**: `agent.service.ts` adds `syncStorageClasses()` to upsert from heartbeat.
7. **API Routes**: `backend/src/routes/storageclass.ts` provides GET /api/storageclasses/:clusterId, POST, DELETE, PATCH /set-default.
8. **Permissions**: Added `storageclass:read`, `storageclass:create`, `storageclass:update`, `storageclass:delete`, `storageclass:manage` to `permissions.ts`.
9. **Manifest Generator**: Added `generateStorageClassManifest()` in `k8s-manifest.ts`.

### PersistentVolume (cluster-wide resource)
1. **Protobuf**: Added `PV` message with fields: `name`, `capacity`, `phase`, `reclaim_policy`, `storage_class`, `bound_pvc`, `access_modes`, `annotations`, `labels`, `resource_config`.
2. **Command Types**: Added `CREATE_PV`, `DELETE_PV`.
3. **Agent**: `resources.go` adds `GetPVs()` using `client-go CoreV1()`. `stats.go` serializes into `Heartbeat.pvs`.
4. **Command Handler**: `agent/command.go` handles PV creation/deletion.
5. **Database**: Added `k8sPersistentVolumes` table with clusterId, name, capacity, phase, reclaimPolicy, storageClass, boundPvc, accessModes.
6. **Backend Sync**: `agent.service.ts` adds `syncPVs()` to upsert from heartbeat.
7. **API Routes**: `backend/src/routes/pv.ts` provides GET /api/pvs/:clusterId, POST, DELETE.
8. **Permissions**: Added `pv:read`, `pv:create`, `pv:delete`, `pv:manage` to `permissions.ts`.
9. **Manifest Generator**: Added `generatePVManifest()` in `k8s-manifest.ts` supporting NFS and hostPath.

**Note**: PV/StorageClass are cluster-scoped (not namespaced) unlike PVC which is namespace-scoped.

---

## 🔗 Feature Flow: Frontend UI (M2 - StorageClasses & PVs)

### Frontend Routes Added

```
frontend/src/routes/dashboard/cluster/$id/
├── storage-classes/
│   ├── index.tsx       # List view with CRUD + set default
│   └── create.tsx      # Create form with provisioner selection
└── persistent-volumes/
    ├── index.tsx       # List view with CRUD
    └── create.tsx      # Create form (NFS/hostPath sources)
```

### Sidebar Navigation

Added to `frontend/src/components/Sidebar.tsx`:
- **Storage Classes** (`storageclass:read`) - lists all StorageClasses with provisioner info
- **Persistent Volumes** (`pv:read`) - lists all PVs with capacity, status, access modes

### UI Components

1. **StorageClasses List** (`storage-classes/index.tsx`)
   - Table: Name, Provisioner, Reclaim Policy, Volume Binding, Default badge, Actions
   - Actions: Set Default (star icon), Delete
   - Create button navigates to create form

2. **StorageClasses Create** (`storage-classes/create.tsx`)
   - Form fields: Name, Provisioner (dropdown), Reclaim Policy, Volume Binding Mode, Allow Volume Expansion toggle
   - JSON inputs for Annotations/Labels

3. **PersistentVolumes List** (`persistent-volumes/index.tsx`)
   - Table: Name, Capacity, Status, StorageClass, Access Modes, Claim, Reclaim Policy, Actions
   - Capacity displayed in GiB, Status badges (Bound/Available/Failed)
   - Access modes shown as badges

4. **PersistentVolumes Create** (`persistent-volumes/create.tsx`)
   - Form fields: Name, Capacity (GiB), StorageClass, Reclaim Policy
   - Source type tabs: NFS or HostPath
   - NFS: Server, Path, ReadOnly checkbox
   - HostPath: Path, Type (Directory/DirectoryOrCreate/File/FileOrCreate)
   - Access modes: multi-select buttons (RWO, ROX, RWX)

### Integration with Existing PVC UI

- PVC creation form can reference StorageClasses (uses `/api/storageclasses/:clusterId`)
- No changes needed for M2 as volume mount section already exists

---

## ⚠️ Drizzle ORM Type Notes

When defining JSONB columns in Drizzle ORM, avoid using `.$type<T[]>()` with array types as it generates incorrect TypeBox definitions. Use the wrapper pattern instead:

```typescript
// ❌ Incorrect - causes TypeBox issues
accessModes: jsonb("access_modes").$type<string[]>().default([]).notNull()

// ✅ Correct - uses wrapper object
accessModes: jsonb("access_modes").$type<{ data: string[] }>().default({ data: [] }).notNull()
```
---

*Last updated: 2026-04-06 (Milestone 2: StorageClasses & PVs + Frontend UI implemented)*

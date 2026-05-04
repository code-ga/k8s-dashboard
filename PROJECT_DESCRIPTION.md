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
    - [x] **Native Ephemeral Container Debugging**: Implemented in-place pod troubleshooting via K8s Ephemeral Containers. Supports image injection, namespace sharing, and live terminal interaction.
    - [x] **TLS for Ingress**: Added UI toggle in Ingress creation dialog to enable/disable TLS. Backend passes `tls` boolean to manifest generator.
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

## 🔗 Feature Flow: Native Ephemeral Container Debugging
1. **Protobuf**: Added `CREATE_EPHEMERAL_CONTAINER` command type.
2. **Agent**: `agent/service/k8s/resources.go` implements `CreateEphemeralContainer` using `kc.Clientset.CoreV1().Pods(ns).UpdateEphemeralContainers()` (patching the `ephemeralcontainers` subresource).
3. **Backend API**: `POST /api/clusters/:id/pods/:podId/ephemeral-containers` triggers the agent command.
4. **WebSocket Headers**: `/exec/:podId` and `/logs/:podId` routes updated to support a `container` query parameter.
5. **Frontend UI**:
    - `DebugPodModal.tsx`: Form to select debug image (`netshoot`, `busybox`, etc.) and target container for process namespace sharing.
    - `ManagePodPage`: Uses a live `pod-describe` query (re-fetching every 5s) to detect newly injected ephemeral containers.
    - `PodTerminal` / `PodLogs`: Updated with a container selector dropdown that triggers WebSocket reconnection to the specific container.

---

## 🔗 Feature Flow: TLS for Ingress

### Overview
Added ability for users to enable/disable TLS when creating HTTP Ingress resources. TLS is enabled by default and uses Traefik's Let's Encrypt integration.

### Changes Made

1. **Backend Route** (`backend/src/routes/ingress.ts`):
   - Added `tls: Type.Optional(Type.Boolean())` to the body schema of the `expose` endpoint.
   - Passes `tls` value to `generateIngressRouteManifest()`.

2. **Manifest Generator** (`backend/src/utils/k8s-manifest.ts`):
   - `IngressRouteDTO` interface includes optional `tls?: boolean` and `certResolver?: string`.
   - `generateIngressRouteManifest()` handles TLS configuration:
     - When `tls: false`: Uses `web` entrypoint only, sets `traefik.ingress.kubernetes.io/router.tls: "false"`.
     - When `tls: true` (default): Uses both `web` and `websecure` entrypoints, configures certResolver if provided.

3. **Frontend Creation Dialog** (`frontend/src/components/ingress/create-dialog.tsx`):
   - Added `tls: z.boolean().default(true)` to schema.
   - Added Switch component to toggle TLS (visible only for HTTP protocol).
   - Passes `tls` value in API request.

4. **Frontend Expose Dialog** (`frontend/src/components/service/expose-dialog.tsx`):
   - Added `tls: z.boolean().default(true)` to schema.
   - Added Switch component to toggle TLS (visible only for HTTP protocol).
   - Passes `tls` value in API request.

5. **Frontend Service Detail Dialog** (`frontend/src/routes/dashboard/cluster/$id/services/index.tsx`):
   - Added `tls` field to form default values (defaults to true).
   - Added Switch component in expose form for HTTP protocol.
   - Passes `tls` value when exposing service.

6. **Frontend List View** (`frontend/src/routes/dashboard/cluster/$id/ingresses/index.tsx`):
   - Added TLS badge display next to protocol for each ingress row.

7. **Frontend Detail View** (`frontend/src/routes/dashboard/cluster/$id/ingresses/$ingressId.tsx`):
   - Added TLS status row in Configuration card showing Enabled/Disabled.

8. **Frontend Service Detail Page** (`frontend/src/routes/dashboard/cluster/$id/services/$serviceId.tsx`):
   - Added TLS badge display in ingress table for HTTP protocols.

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

## 🔗 Feature Flow: User Registration & Onboarding

### Overview
The registration system uses **Better-Auth** for authentication and a separate profile creation step. New users register via `/register`, create a profile via `/onboarding`, then gain access to the dashboard. The system supports email/password registration and social OAuth (Google, GitHub, Discord).

### Files Created/Modified

#### Frontend
1. **`frontend/src/routes/register.tsx`** - Registration page component
   - Email/password registration with client-side validation
   - Social login buttons (Google, GitHub, Discord)
   - Password requirements: min 8 chars, uppercase, lowercase, number
   - Redirects to `/onboarding` on success
   - Redirects authenticated users away to `/dashboard`

2. **`frontend/src/routes/onboarding.tsx`** - Profile creation page
   - Requires valid auth session
   - Username input (min 3 chars, non-whitespace)
   - Calls `POST /api/profile` to create profile
   - Assigns initial roles based on `appState.createNewAdmin` flag
   - Redirects to `/dashboard` on success

3. **`frontend/src/routes/__root.tsx`** - Root route updated
   - Checks for session and profile existence
   - Redirects to `/onboarding` if session exists but no profile (404 on `/profile/me`)
   - Excludes layout wrapper for `/login` and `/onboarding` pages

4. **`frontend/src/lib/auth.ts`** - Better-Auth client configuration
   - Uses `createAuthClient` from `better-auth/react`
   - Points to backend auth endpoints

5. **`frontend/src/lib/api.ts`** - Eden/treaty client for backend API
   - Type-safe API client using `@elysiajs/eden`
   - Used by onboarding page for profile creation

#### Backend
6. **`backend/src/libs/auths/auth.config.ts`** - Better-Auth configuration
   - Drizzle adapter with Postgres (`user`, `session`, `account`, `verification` tables)
   - Email/password enabled with auto sign-in
   - Social providers: Google, GitHub, Discord
   - OpenAPI plugin enabled
   - Cookie settings with SameSite/secure based on environment
   - Endpoints auto-mounted at `/api/auth/*`

7. **`backend/src/database/schema/auth.ts`** - Auth-related tables
   - `user` - Core user table (id, name, email, emailVerified, image)
   - `session` - Session tokens with expiry
   - `account` - OAuth provider accounts linked to user
   - `verification` - Email verification tokens
   - `role` - RBAC roles (admin, user, etc.) with permission arrays
   - `profile` - User profile (username, rolesIDs, isSystemDefault)

8. **`backend/src/middleware/auth.ts`** - Authentication middleware
   - `userAuth` guard: validates session, optionally checks profile existence
   - `roleAuth` guard: validates session + profile + permissions
   - Uses Better-Auth's `auth.api.getSession()` to validate tokens

9. **`backend/src/routes/profile.ts`** - Profile management endpoints
   - `GET /profile/me` - Get current user's profile (requires auth, no profile required)
   - `POST /profile/` - Create profile (requires auth, no profile required)
   - `PUT /profile/` - Update profile username (requires auth, no profile required)
   - `GET /profile/?userId=...` or `?profileId=...` - Fetch specific profile
   - `GET /profile/list-user` - List all profiles (requires `user:read` permission)
   - `GET /profile/search_user` - Search profiles by username or userId (requires `user:read`)
   - POST assigns initial roles via `getInitialRoleIds(appState.createNewAdmin)`

10. **`backend/src/routes/index.ts`** - API router includes profile router at `/api/profile`

#### Frontend UI Components
11. **`frontend/src/components/ui/`** - Uses existing Shadcn UI components (Button, Card, Input, Label, Separator)

### Registration Flow

```
User Visit → /register
    ↓
[Optional: Already authenticated? → Redirect to /dashboard]
    ↓
Enter email + password OR click social provider
    ↓
Client-side validation (password strength, confirm password)
    ↓
authClient.signUp.email() OR authClient.signIn.social()
    ↓
Better-Auth Backend (`/api/auth/register` or `/api/auth/callback/:provider`)
    ↓
Creates: user record + session + (account for social)
    ↓
Redirect to callbackURL: `/onboarding`
    ↓
/onboarding page loads → authClient.useSession() validates token
    ↓
User enters unique username
    ↓
POST `/api/profile` with { username }
    ↓
Backend:
  - Checks profile doesn't already exist for user
  - Gets initial role IDs from AppState (first user gets admin role)
  - Creates profile record linking userId → username + roles
  - Sets `createNewAdmin = false` if first user was admin
    ↓
On success → navigate to `/dashboard`
    ↓
Dashboard loads with full authenticated session + profile
```

### Authentication & Profile Relationship

**Separation of Concerns:**
- **Auth (Better-Auth)** = Identity verification (who you are)
- **Profile (App schema)** = User data & permissions (what you can access)

**Database Tables:**
```
user (Better-Auth table)
  ├─ id (UUID, primary key)
  ├─ email (unique)
  ├─ name
  └─ emailVerified

profile (App table)
  ├─ id (UUID, primary key)
  ├─ userId (FK → user.id, unique)
  ├─ username (unique, used as display name)
  ├─ rolesIDs[] (array of role UUIDs)
  └─ isSystemDefault (first user flag)

role (App table)
  ├─ id (UUID)
  ├─ name (e.g., "admin", "user")
  ├─ permissions[] (array of action strings)
  └─ adminRole (boolean flag)
```

**Access Flow:**
1. User logs in → Better-Auth creates `session` record
2. Frontend stores session cookie (httpOnly)
3. Every API call: middleware reads session → gets `userId`
4. Middleware queries `profile` table by `userId`
5. If `profile` missing for protected routes → 401 redirect to `/onboarding`
6. If `profile` exists → load `rolesIDs` → resolve permissions from `role` table
7. Permissions available in route handlers and frontend via TanStack Query

**Why Separate Profile from User?**
- Better-Auth manages authentication primitives (user, session, account)
- App manages user metadata (username, roles, preferences)
- Clean separation allows Better-Auth upgrades without custom schema changes
- Profile creation is a deliberate onboarding step, not forced at registration

### Integration with Login & Root Routing

#### Routing Structure
```
/               → Redirect to /dashboard (if logged in) or /login
/login          → Login page (email + social)
/register       → Registration page (email + social)
/onboarding     → Profile creation (only accessible with valid session, no profile)
/dashboard      → Main app (requires session + profile)
```

#### Root Route Logic (`__root.tsx`)
```typescript
if (isLoginPage || location.pathname === "/onboarding") {
  // No sidebar/header layout for auth pages
  return <Outlet /> with ThemeProvider only;
}

if (session && !isProfileLoading && profileError?.(status === 404)) {
  // User has auth but no profile → force onboarding
  navigate("/onboarding");
  return null;
}

// Normal dashboard layout with sidebar + header
return <DashboardLayout><Outlet /></DashboardLayout>;
```

#### Login ↔ Register Relationship
- Login page (`/login`) shows "Don't have an account? Sign Up" → navigates to `/register`
- Register page (`/register`) shows "Already have an account? Sign In" → navigates to `/login`
- Both pages redirect away if already authenticated (to `/dashboard`)
- Both support same OAuth providers (Google, GitHub, Discord)

### Better-Auth Backend API

Better-Auth automatically generates the following endpoints (mounted at `/api/auth/` by `baseURL`):

**Email/Password:**
- `POST /api/auth/register` - Register new user (email + password)
- `POST /api/auth/login` - Login with email + password
- `GET /api/auth/session` - Get current session
- `POST /api/auth/logout` - Invalidate session
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Complete password reset

**OAuth:**
- `GET /api/auth/oauth/:provider` - Initiate OAuth flow (redirects to provider)
- `GET /api/auth/callback/:provider` - OAuth callback handler
- `GET /api/auth/list-providers` - List available social providers
- `GET /api/auth/account` - Get linked accounts for current user

**Verification:**
- `GET /api/auth/verify-email` - Email verification endpoint

**Session Management:**
- `GET /api/auth/session` - Get current session
- `POST /api/auth/refresh-session` - Refresh session token
- `DELETE /api/auth/session` - Delete session

### Future Updates Needed

1. **Email Verification Flow**
   - Currently `emailVerified` defaults to `false`
   - Need to implement verification email sending
   - Add verification page at `/verify-email`
   - Consider requiring verification before onboarding

2. **Password Reset**
   - Forgot/Reset password pages not implemented
   - Better-Auth provides endpoints but no frontend UI

3. **Social Account Linking**
   - Users cannot currently link additional OAuth providers after registration
   - Need "Linked Accounts" section in user settings

4. **Profile Editing**
   - Onboarding sets username once; no edit page exists
   - Need profile settings page (`/settings/profile`) with username change capability (PUT `/api/profile`)
   - May need username uniqueness validation with availability check

5. **Role Assignment Logic**
   - Currently first user gets admin via `appState.createNewAdmin` flag
   - Flag is global, not per-tenant; resets after first user
   - For multi-tenant/multi-cluster, need more sophisticated role assignment (e.g., invite-based)
   - Role assignment UI missing (assign roles to users)

6. **Session Management UI**
   - No "Manage Active Sessions" page
   - Users cannot view/logout other devices

7. **Account Deletion**
   - Better-Auth supports `DELETE /api/auth/remove-account`
   - No frontend "Delete Account" button implemented
   - Cascade deletion of profile, sessions, and linked accounts?

8. **Role & Permission UI**
   - Admin-only pages to manage roles (`role:read`, `role:write`) exist?
   - Need user management interface (`/admin/users`) to view profiles, assign roles

9. **OAuth Scopes & Claims**
   - Social provider configs have minimal scopes
   - May need additional profile data (avatar, name) from OAuth providers
   - Consider storing OAuth `accessToken` for API calls on user's behalf

10. **Security Hardening**
    - Add rate limiting on auth endpoints (prevent brute force)
    - Implement account lockout after failed attempts
    - Session IP/User-Agent binding (already stored but not validated)
    - Add CAPTCHA for registration endpoint

11. **Error Handling & UX**
    - Registration errors: Better-Auth error messages surfaced but may be generic
    - Social login failures: Redirect handling with error params?
    - Better UX for session expiry (auto-redirect to login with message)

12. **Multi-Factor Authentication (MFA)**
    - Better-Auth supports 2FA via TOTP
    - Need MFA setup/verification pages and QR code display
    - Store `mfaEnabled` on user/ profile table?

13. **Profile Uniqueness Constraints**
    - Username uniqueness enforced at DB level (`unique` constraint on `profile.username`)
    - Frontend should check availability before submitting (debounced API call)
    - Reserved usernames (admin, root, system) should be blocked

14. **Audit Logging**
    - Log authentication events (login, logout, registration, password changes)
    - Log profile creation/updates
    - Admin audit trail for compliance

15. **Session Persistence Settings**
    - "Remember me" checkbox for longer session expiry
    - Session duration configurable per user or globally

16. **Terms of Service / Privacy Policy**
    - Add checkbox to accept ToS during registration
    - Link to policy documents
    - Store acceptance timestamp in DB

---

*Last updated: 2026-04-26 (Registration & Onboarding documented)*

## ⚠️ Drizzle ORM Type Notes

When defining JSONB columns in Drizzle ORM, avoid using `.$type<T[]>()` with array types as it generates incorrect TypeBox definitions. Use the wrapper pattern instead:

```typescript
// ❌ Incorrect - causes TypeBox issues
accessModes: jsonb("access_modes").$type<string[]>().default([]).notNull()

// ✅ Correct - uses wrapper object
accessModes: jsonb("access_modes").$type<{ data: string[] }>().default({ data: [] }).notNull()
```

---

## 🔗 Feature Flow: Delete Cluster

### Overview
Added a delete cluster button with full permission checking on the cluster overview page.

### Changes Made

1. **Frontend Cluster Overview** (`frontend/src/routes/dashboard/cluster/$id/index.tsx`):
   - Added `deleteDialogOpen` state for delete confirmation dialog
   - Added `deleteConfirmText` state for user confirmation input
   - Added delete cluster mutation with success/error handlers
   - Added "Delete Cluster" button with `cluster:delete` permission check
   - Added confirmation dialog requiring user to type cluster name to confirm
   - Redirects to dashboard on successful deletion

2. **Permission Check**:
   - Button only visible when user has `cluster:delete` permission
   - Delete action requires `cluster:delete` permission (enforced by backend)

### Delete Confirmation Flow
1. User clicks "Delete Cluster" button (only if they have `cluster:delete` permission)
2. Dialog opens requiring user to type the cluster name
3. Delete button is disabled until cluster name matches exactly
4. On confirm, API call to `DELETE /api/clusters/:id` triggers
5. On success, redirects to dashboard

---

*Last updated: 2026-04-24 (Strict Input Validation implemented)*

## 🛡️ Input Validation & Strictness

### Strategy
The project uses **TypeBox** for strict runtime type validation of all incoming API request bodies. We have strengthened validation across all Kubernetes resource routes (including **POST**, **PATCH**, and **PUT**) to ensure data integrity and prevent invalid configurations from reaching the cluster.

### Key Constraints Applied
1.  **Required Strings**: Every mandatory identifier (e.g., `name`, `namespace`, `configMapName`, `secretName`) now enforces `minLength: 1`. 
2.  **Non-Whitespace Enforcement**: To prevent "empty" strings consisting only of spaces, all mandatory string fields now use a regex pattern `^.*\\S.*$`. This ensures that at least one non-whitespace character is present.
3.  **Numeric Ranges**:
    -   **Ports**: All port definitions (containerPort, targetPort, service port, nodePort) enforce `minimum: 1` and `maximum: 65535`.
    -   **NodePorts**: Specifically restricted to the standard Kubernetes range `30000-32767`.
    -   **Replicas**: Enforce `minimum: 0` (allowing scale-to-zero) or `minimum: 1` where appropriate.
    -   **Capacity**: Storage capacity (PVC/PV) enforces `minimum: 1`.
4.  **Shared Schemas**: Common reference structures (Ports, ConfigMap/Secret/PVC/EmptyDir references) are centralized in `backend/src/utils/resource-refs.ts` to ensure consistent validation logic across Pods, Deployments, and other resources.

### Validation Flow
1.  **Elysia Guard**: The `elysia` route guard intercepts the request and validates `ctx.body` against the TypeBox schema.
2.  **Error Handling**: If validation fails, Elysia automatically returns a `400` error with a detailed breakdown of the failing fields.
3.  **Ownership Check**: Beyond schema validation, routes perform secondary ownership checks (e.g., `validateResourceRefs`) to ensure users can only reference resources they own.

### Frontend Validation
We have aligned frontend validation with backend strictness to provide immediate user feedback and prevent unnecessary API roundtrips.
1. **Zod Integration**: Creation forms for Deployments, Pods, and Services use **Zod** schemas that mirror backend constraints.
2. **Trim & Minimum Length**: All string inputs use `.trim().min(1)` (or `min(3)` where applicable) to ensure that leading/trailing whitespace is removed and the resulting string is non-empty.
3. **Manual Pre-flight Checks**: For forms using `useState` (PVCs, PVs, StorageClasses), we perform manual validation in the `onSubmit` handler before triggering the mutation.
4. **Refinement Logic**: Complex fields like Labels and Selectors use Zod `.refine()` to ensure they aren't just objects with empty keys, matching the backend's `minLength: 1` requirement for Map keys.
5. **Data Grid Validation**: Shared editors like `EnvEditor` are validated in their parent pages to ensure every key-value pair has a non-empty name before submission.

---

## 🎨 Dashboard UI Refactoring & Performance (2026-05-04)

### Overview
The dashboard underwent a significant visual and technical refactor to improve consistency, performance, and usability across all resource management pages.

### Key Enhancements
1.  **Unified Design System**:
    *   **Shared Component**: Introduced `ResourcePageLayout` (`frontend/src/components/shared/resource-page-layout.tsx`) to standardize the header, summary section, and content area across all resource pages.
    *   **Visual Consistency**: Replaced inconsistent card designs and gradients with a clean, premium "glassmorphism-lite" aesthetic.
    *   **Responsive Tables**: Standardized table layouts with improved spacing and hover states. Fixed text-wrapping issues in `TableCell` by removing restrictive `whitespace-nowrap`.

2.  **Performance & Navigation**:
    *   **Global Progress Bar**: Implemented a global loading indicator in `__root.tsx` that triggers on navigation transitions, solving the issue where pages felt slow or unresponsive during lazy loading.
    *   **Pulse Loaders**: Added elegant pulse animations for data fetching states.

3.  **Onboarding & Documentation**:
    *   **Resource Summaries**: Every resource list page now features a concise summary explaining what the resource is (e.g., "What is a Pod?") with direct links to official Kubernetes documentation.
    *   **Contextual Actions**: Standardized placement of "Create" buttons and action menus.

4.  **Error Handling**:
    *   **Eden Error Utility**: Integrated `getEdenErrorMessage` across all pages to ensure API errors are rendered as human-readable strings instead of the confusing `[object Object]` message.

### Refactored Pages
The following pages have been fully migrated to the new design system:
-   **Workloads**: Deployments, Pods
-   **Network**: Services, Ingresses
-   **Config/Secrets**: ConfigMaps, Secrets
-   **Storage**: PVCs, PersistentVolumes, StorageClasses
-   **Cluster**: Nodes, Events

### Summary of Changes (Walkthrough)
- Implemented a global loading progress bar in `__root.tsx`.
- Created `ResourcePageLayout` for standardized headers and help sections.
- Updated `styles.css` with progress bar animations and premium UI tokens.
- Fixed layout breakage in `components/ui/table.tsx` by allowing content wrapping.
- Migrated all major resource index pages to use the new unified layout and improved error handling.
- Added informative "About [Resource]" sections to every list page.
- **Verified Type Integrity**: Fixed minor typing issues and unused imports; confirmed codebase stability with `bun run typecheck` (passing with exit code 0).

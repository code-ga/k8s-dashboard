# RBAC Implementation Plan

## Note
We need to adding postion field for the better delete action verify check

## Goal
- Replace the current coarse role-based auth (`["manager"]` arrays) with a fine-grained `resource:action` permission system.
- Use Drizzle-style filter operators in the middleware.
- Implement a dynamic frontend that reads permission requirements from the backend at runtime.

## Implementation Steps
## Overview

Replace the current coarse role-based auth (`["manager"]` arrays) with a fine-grained
`resource:action` permission system, Drizzle-style filter operators in the middleware,
and a dynamic frontend that reads permission requirements from the backend at runtime.

---

## Files to change

```
backend/src/
├── constants/
│   └── permissions.ts          [NEW]
├── database/
│   └── schema.ts               [MODIFY] add role table, change profile.permission → roles
├── middleware/
│   └── auth.ts                 [MODIFY] refactor roleAuth to filter-style
├── routes/
│   ├── index.ts                [MODIFY] register role route
│   ├── role.ts                 [NEW]    CRUD for roles + default-role management
│   ├── cluster.ts              [MODIFY] per-verb roleAuth
│   ├── pod.ts                  [MODIFY] per-verb roleAuth
│   ├── deployment.ts           [MODIFY] per-verb roleAuth
│   ├── nodes.ts                [MODIFY] per-verb roleAuth
│   ├── service.ts              [MODIFY] per-verb roleAuth
│   ├── ingress.ts              [MODIFY] add roleAuth (currently none)
│   ├── configmap.ts            [MODIFY] per-verb roleAuth (currently too coarse)
│   ├── secret.ts               [MODIFY] add roleAuth (currently none)
│   └── profile.ts              [MODIFY] per-endpoint roleAuth
├── utils/
│   └── permissions.ts          [NEW]    resolveUserPermissions + evaluatePermissionFilter
└── index.ts                    [MODIFY] /permissions + /route-permissions endpoints

frontend/src/
├── config/
│   └── permissions.ts          [MODIFY] remove static matrix, keep types + re-export hooks
├── lib/
│   └── permission-matcher.ts   [NEW]    path normalization + template matching
├── hooks/
│   ├── usePermissionsMap.ts    [NEW]    fetches /route-permissions, builds lookup map
│   └── useCanCall.ts           [NEW]    useCanCall(method, path) + usePermission(perm)
└── routes/dashboard/
    └── roles/
        └── index.tsx           [NEW]    roles management page
```

---

## Step 1 — `backend/src/constants/permissions.ts` (NEW)

Single source of truth for all resources and actions. The `Permission` type is derived
directly from the object so adding a resource/action automatically updates the type.

```typescript
export const RESOURCE_DEFINITIONS = {
  cluster: {
    description: "Kubernetes cluster management",
    actions: {
      read:   "View clusters and their details",
      create: "Create a new cluster",
      update: "Edit cluster settings",
      delete: "Delete a cluster",
    },
  },
  node: {
    description: "Kubernetes node management",
    actions: {
      read:   "View nodes and their status",
      update: "Update node metadata",
      delete: "Remove a node record",
    },
  },
  pod: {
    description: "Kubernetes pod management",
    actions: {
      read:   "View pods and their logs",
      create: "Deploy a new pod",
      update: "Update pod configuration",
      delete: "Delete a pod",
    },
  },
  deployment: {
    description: "Kubernetes deployment management",
    actions: {
      read:   "View deployments",
      create: "Create a new deployment",
      update: "Scale or update a deployment",
      delete: "Delete a deployment",
    },
  },
  service: {
    description: "Kubernetes service management",
    actions: {
      read:   "View services",
      create: "Expose a new service",
      update: "Update service configuration",
      delete: "Delete a service",
    },
  },
  ingress: {
    description: "Kubernetes ingress management",
    actions: {
      read:   "View ingress rules",
      create: "Create an ingress rule",
      update: "Update an ingress rule",
      delete: "Delete an ingress rule",
    },
  },
  configmap: {
    description: "Kubernetes ConfigMap management",
    actions: {
      read:   "View ConfigMaps",
      create: "Create a ConfigMap",
      update: "Update a ConfigMap",
      delete: "Delete a ConfigMap",
    },
  },
  secret: {
    description: "Kubernetes Secret management",
    actions: {
      read:   "View Secrets (redacted values)",
      create: "Create a Secret",
      update: "Update a Secret",
      delete: "Delete a Secret",
    },
  },
  user: {
    description: "Application user management",
    actions: {
      read:   "View user profiles",
      create: "Create a user profile",
      update: "Update a user profile",
      delete: "Delete a user profile",
      manage: "Assign or revoke roles from users",
    },
  },
  role: {
    description: "RBAC role management",
    actions: {
      read:   "View roles and their permissions",
      create: "Create a new role",
      update: "Edit a role's permissions",
      delete: "Delete a role",
    },
  },
} as const

export type ResourceKey = keyof typeof RESOURCE_DEFINITIONS
export type Permission = {
  [R in ResourceKey]: `${R}:${keyof (typeof RESOURCE_DEFINITIONS)[R]["actions"] & string}`
}[ResourceKey]
// → "cluster:read" | "cluster:create" | "user:manage" | ...

export interface PermissionMeta {
  id: Permission
  resource: ResourceKey
  resourceDescription: string
  action: string
  description: string
}

export interface PermissionGroup {
  resource: ResourceKey
  description: string
  permissions: PermissionMeta[]
}

// Flat list — used internally for seeding and validation
export function getAllPermissions(): PermissionMeta[]

// Grouped by resource — used by role-editor UI checkboxes and /permissions endpoint
export function getPermissionsGrouped(): PermissionGroup[]
```

---

## Step 2 — DB Schema (`backend/src/database/schema.ts`)

### 2a. New `role` table

```typescript
export const role = pgTable("role", {
  id:          serial("id").primaryKey(),
  name:        text("name").notNull().unique(),
  description: text("description"),
  permissions: text("permissions").array().default([]).notNull(), // ["cluster:read", ...]
  isDefault:   boolean("is_default").default(false).notNull(),   // auto-assigned on registration
  createdAt:   timestamp("created_at").defaultNow().notNull(),
  updatedAt:   timestamp("updated_at").$onUpdate(() => new Date()).notNull(),
})
```

### 2b. Modify `profile` table

- Add `roles text[]` column — stores role names e.g. `["admin", "viewer"]`
- Remove `permissionEnum` definition and old `permission: permissionEnum().array()` column
- Write a migration that copies existing enum values to seed roles, then drops the old column

### 2c. Seed built-in roles in migration

```sql
INSERT INTO role (name, description, permissions, is_default) VALUES
  ('admin',   'Full access',         ARRAY[...all permissions...],                                              false),
  ('manager', 'Cluster + user mgmt', ARRAY['cluster:read','cluster:create','cluster:update','cluster:delete',...], false),
  ('user',    'Read-only viewer',    ARRAY['cluster:read','pod:read','deployment:read',...],                    true);
-- Only 'user' is default — new registrations get it automatically
```

---

## Step 3 — Filter operator functions

Drizzle-style operator functions. The internal tagged type is hidden; the call-site reads
like a natural expression identical to Drizzle WHERE clauses.

```typescript
// Internal tagged types (not used directly by route authors)
type AndFilter = { _op: "and"; filters: PermissionFilter[] }
type OrFilter  = { _op: "or";  filters: PermissionFilter[] }
type NotFilter = { _op: "not"; filter:  PermissionFilter   }

export type PermissionFilter = Permission | AndFilter | OrFilter | NotFilter

// Public API
export const and = (...filters: PermissionFilter[]): AndFilter => ({ _op: "and", filters })
export const or  = (...filters: PermissionFilter[]): OrFilter  => ({ _op: "or",  filters })
export const not = (filter: PermissionFilter):  NotFilter      => ({ _op: "not", filter  })
```

### Usage in routes

```typescript
import { and, or, not } from "../constants/permissions"

roleAuth: "cluster:read"                                          // single string
roleAuth: and("cluster:read", "cluster:create")                   // all must match
roleAuth: or("cluster:read", "user:manage")                       // any must match
roleAuth: and("cluster:read", or("cluster:create", "cluster:delete"))  // nested
roleAuth: not("cluster:delete")                                   // negation
```

---

## Step 4 — `backend/src/utils/permissions.ts` (NEW)

```typescript
// Resolve role names → flat Set of permission strings
export async function resolveUserPermissions(
  roleNames: string[]
): Promise<Set<Permission>> {
  const roles = await db.query.role.findMany({
    where: inArray(schema.role.name, roleNames),
  })
  const perms = new Set<Permission>()
  for (const role of roles)
    for (const p of role.permissions) perms.add(p as Permission)
  return perms
}

// Recursive evaluator for the PermissionFilter DSL
export function evaluatePermissionFilter(
  userPerms: Set<Permission>,
  filter: PermissionFilter,
): boolean {
  if (typeof filter === "string")    return userPerms.has(filter)
  if (filter._op === "and") return filter.filters.every(f => evaluatePermissionFilter(userPerms, f))
  if (filter._op === "or")  return filter.filters.some(f  => evaluatePermissionFilter(userPerms, f))
  if (filter._op === "not") return !evaluatePermissionFilter(userPerms, filter.filter)
  return false
}
```

---

## Step 5 — Refactor `roleAuth` macro (`backend/src/middleware/auth.ts`)

```typescript
roleAuth: (filter: PermissionFilter) => ({
  async resolve({ status, request: { headers } }) {
    const session = await auth.api.getSession({ headers })
    if (!session) return status(401)

    const profile = await db.query.profile.findFirst({
      where: { userId: session.user.id },
    })
    if (!profile) return status(401)

    const userPermissions = await resolveUserPermissions(profile.roles)
    if (!evaluatePermissionFilter(userPermissions, filter)) return status(403)

    return {
      user: session.user,
      session: session.session,
      profile,
      userPermissions,         // Set<Permission> available in route handlers
    }
  },
  detail: {
    tags: ["auth"],
    "x-permission": filter,   // picked up by /route-permissions endpoint
  },
})
```

Remove `checkPermission` export and `permissionEnum` reference from this file.

---

## Step 6 — `backend/src/routes/role.ts` (NEW)

```
GET    /api/role                      list all roles + permissions        (roleAuth: "role:read")
POST   /api/role                      create role                         (roleAuth: "role:create")
GET    /api/role/:id                  get single role                     (roleAuth: "role:read")
PATCH  /api/role/:id                  update name/description/perms       (roleAuth: "role:update")
DELETE /api/role/:id                  delete role                         (roleAuth: "role:delete")
GET    /api/role/all-permissions      getPermissionsGrouped() response     (roleAuth: "role:read")
PATCH  /api/role/:id/set-default      toggle isDefault on a role          (roleAuth: "role:update")
```

### Default role logic for `PATCH /api/role/:id/set-default`

```typescript
// Body: { isDefault: boolean }
// Rules:
//   - Multiple roles can be default (new user gets ALL of them)
//   - Cannot unset default on the last remaining default role — must always have at least one
//   - Protected built-in roles (admin) cannot be set as default

.patch("/:id/set-default", async ({ params, body, status }) => {
  const { isDefault } = body

  // Guard: never remove the last default role
  if (!isDefault) {
    const defaultCount = await db.$count(schema.role, eq(schema.role.isDefault, true))
    if (defaultCount <= 1) return status(400, { message: "At least one default role is required" })
  }

  await db.update(schema.role)
    .set({ isDefault, updatedAt: new Date() })
    .where(eq(schema.role.id, params.id))

  return { success: true }
}, { roleAuth: "role:update" })
```

### Auto-assign defaults on user registration (`profile.ts`)

In the `POST /api/profile` handler, after inserting the new profile row:

```typescript
// Fetch all roles marked isDefault
const defaultRoles = await db.query.role.findMany({
  where: eq(schema.role.isDefault, true),
  columns: { name: true },
})

// Assign their names to the new profile
await db.update(schema.profile)
  .set({ roles: defaultRoles.map(r => r.name) })
  .where(eq(schema.profile.userId, newProfile.userId))
```

This means the admin toggling `isDefault` on a role immediately affects all future
registrations, with no code changes required.

Register in `backend/src/routes/index.ts`:
```typescript
import { roleRoute } from "./role"
// add .use(roleRoute) to apiRouter
```

---

## Step 7 — Route middleware refactor (all route files)

### Pattern change

```typescript
// BEFORE — one coarse guard, all verbs share the same permission
.guard({ roleAuth: ["manager"] }, (app) =>
  app.get("/").post("/").patch("/:id").delete("/:id")
)

// AFTER — roleAuth moves to each route's config object, per-verb
.guard({ userAuth: { requiredProfile: true } }, (app) =>
  app
    .get("/",       handler, { roleAuth: "cluster:read"   })
    .post("/",      handler, { roleAuth: "cluster:create" })
    .patch("/:id",  handler, { roleAuth: "cluster:update" })
    .delete("/:id", handler, { roleAuth: "cluster:delete" })
)
```

### Full permission mapping

#### `cluster.ts`
| Method | Path | New `roleAuth` |
|--------|------|----------------|
| GET    | `/cluster`                 | `"cluster:read"`   |
| GET    | `/cluster/:id`             | `"cluster:read"`   |
| GET    | `/cluster/:id/agent-config`| `"cluster:read"`   |
| POST   | `/cluster`                 | `"cluster:create"` |
| PATCH  | `/cluster/:id`             | `"cluster:update"` |
| DELETE | `/cluster/:id`             | `"cluster:delete"` |

Also collapse the two duplicate `GET /` handlers (public guard + manager guard) into one.

#### `nodes.ts`
| Method | Path | New `roleAuth` |
|--------|------|----------------|
| GET    | `/nodes/:clusterId`        | `"node:read"`   |
| GET    | `/nodes/:clusterId/token`  | `"node:read"`   |
| PATCH  | `/nodes/:clusterId/:id`    | `"node:update"` |
| DELETE | `/nodes/:clusterId/:id`    | `"node:delete"` |

#### `pod.ts`
| Method | Path | New `roleAuth` |
|--------|------|----------------|
| GET    | `/pods/:clusterId/all`  | `"pod:read"`   |
| GET    | `/pods/:clusterId/:id`  | `"pod:read"`   |
| POST   | `/pods/:clusterId`      | `"pod:create"` |
| PATCH  | `/pods/:clusterId/:id`  | `"pod:update"` |
| DELETE | `/pods/:clusterId/:id`  | `"pod:delete"` |

#### `deployment.ts`
| Method | Path | New `roleAuth` |
|--------|------|----------------|
| GET    | `/deployments/:clusterId/all` | `"deployment:read"`   |
| GET    | `/deployments/:clusterId/:id` | `"deployment:read"`   |
| POST   | `/deployments/:clusterId`     | `"deployment:create"` |
| PATCH  | `/deployments/:clusterId/:id` | `"deployment:update"` |
| DELETE | `/deployments/:clusterId/:id` | `"deployment:delete"` |

#### `service.ts`
| Method | Path | New `roleAuth` |
|--------|------|----------------|
| GET    | `/services/:clusterId/all` | `"service:read"`   |
| GET    | `/services/:clusterId/:id` | `"service:read"`   |
| POST   | `/services/:clusterId`     | `"service:create"` |
| PATCH  | `/services/:clusterId/:id` | `"service:update"` |
| DELETE | `/services/:clusterId/:id` | `"service:delete"` |

#### `ingress.ts` — currently no `roleAuth`, add it
| Method | Path | New `roleAuth` |
|--------|------|----------------|
| GET    | `/ingresses/:clusterId`     | `"ingress:read"`   |
| GET    | `/ingresses/:clusterId/:id` | `"ingress:read"`   |
| POST   | `/ingresses/:clusterId`     | `"ingress:create"` |
| PATCH  | `/ingresses/:clusterId/:id` | `"ingress:update"` |
| DELETE | `/ingresses/:clusterId/:id` | `"ingress:delete"` |

#### `configmap.ts` — currently `roleAuth: ["user"]`, too coarse
| Method | Path | New `roleAuth` |
|--------|------|----------------|
| GET    | `/configmaps/:clusterId`     | `"configmap:read"`   |
| GET    | `/configmaps/:clusterId/:id` | `"configmap:read"`   |
| POST   | `/configmaps/:clusterId`     | `"configmap:create"` |
| PATCH  | `/configmaps/:clusterId/:id` | `"configmap:update"` |
| DELETE | `/configmaps/:clusterId/:id` | `"configmap:delete"` |

#### `secret.ts` — currently no `roleAuth`, add it
| Method | Path | New `roleAuth` |
|--------|------|----------------|
| GET    | `/secrets/:clusterId`     | `"secret:read"`   |
| GET    | `/secrets/:clusterId/:id` | `"secret:read"`   |
| POST   | `/secrets/:clusterId`     | `"secret:create"` |
| PATCH  | `/secrets/:clusterId/:id` | `"secret:update"` |
| DELETE | `/secrets/:clusterId/:id` | `"secret:delete"` |

#### `profile.ts`
| Method | Path | New `roleAuth` |
|--------|------|----------------|
| GET    | `/profile/me`           | none (own data)       |
| POST   | `/profile`              | none (self-register)  |
| PUT    | `/profile`              | none (own update)     |
| GET    | `/profile`              | none                  |
| PATCH  | `/profile/add_role`     | `"user:manage"`       |
| PATCH  | `/profile/remove_role`  | `"user:manage"`       |
| GET    | `/profile/list-user`    | `"user:read"`         |
| GET    | `/profile/search_user`  | `"user:read"`         |
| GET    | `/profile/available-role`| `"role:read"`        |

---

## Step 8 — Update endpoints in `backend/src/index.ts`

Two separate endpoints:

```typescript
// For the role-editor UI — returns permission definitions grouped by resource
.get("/permissions", async () => getPermissionsGrouped())

// For the frontend useCanCall hook — returns route-level permission requirements
// (replaces current implementation that returns undefined for all routes)
.get("/route-permissions", async () =>
  app.routes
    .filter(r => r.hooks?.detail?.["x-permission"])
    .map(r => ({
      method:     r.method,
      path:       r.path,
      permission: r.hooks.detail["x-permission"],
    }))
)
```

The `/permissions` response shape (for role editor):
```json
[
  {
    "resource": "cluster",
    "description": "Kubernetes cluster management",
    "permissions": [
      { "id": "cluster:read",   "action": "read",   "description": "View clusters..." },
      { "id": "cluster:create", "action": "create", "description": "Create a cluster" }
    ]
  }
]
```

The `/route-permissions` response shape (for `useCanCall`):
```json
[
  { "method": "GET",    "path": "/api/cluster",    "permission": "cluster:read"   },
  { "method": "POST",   "path": "/api/cluster",    "permission": "cluster:create" },
  { "method": "DELETE", "path": "/api/cluster/:id","permission": "cluster:delete" }
]
```

---

## Step 9 — `frontend/src/lib/permission-matcher.ts` (NEW)

Matches a concrete URL path against a route template from `/route-permissions`.

```typescript
// "/api/cluster/42" → "/api/cluster/:id"
export function normalizePath(path: string): string {
  return path
    .replace(/\/\d+/g, "/:id")
    .replace(/\/[a-f0-9-]{36}/g, "/:id")
}

// matchPath("/api/cluster/42", "/api/cluster/:id") → true
export function matchPath(concretePath: string, template: string): boolean {
  const ts = template.split("/")
  const cs = concretePath.split("/")
  if (ts.length !== cs.length) return false
  return ts.every((seg, i) => seg.startsWith(":") || seg === cs[i])
}
```

---

## Step 10 — `frontend/src/hooks/usePermissionsMap.ts` + `useCanCall.ts` (NEW)

```typescript
// usePermissionsMap — fetches /route-permissions once, shared via React Query cache
export function usePermissionsMap() {
  return useQuery({
    queryKey: ["permissions-map"],
    queryFn: () => api.get("/route-permissions"),
    refetchOnWindowFocus: true,   // picks up backend changes when user switches tabs
    refetchInterval: 60_000,      // picks up backend deploys in active long-running sessions
    // NOT staleTime: Infinity — permission requirements can change on backend deploy
  })
}

// useCanCall — primary hook used by all components for conditional rendering
export function useCanCall(method: string, path: string): boolean {
  const { data: permissionsMap } = usePermissionsMap()
  const { data: profile } = useQuery({ queryKey: ["profile/me"] })

  if (!permissionsMap || !profile?.resolvedPermissions) return false

  const requiredPermission = permissionsMap.find(entry =>
    entry.method === method.toUpperCase() && matchPath(path, entry.path)
  )?.permission

  if (!requiredPermission) return true   // no permission required → public route
  return profile.resolvedPermissions.includes(requiredPermission)
}

// usePermission — direct named check for non-endpoint UI guards (e.g. nav items)
export function usePermission(permission: string): boolean {
  const { data: profile } = useQuery({ queryKey: ["profile/me"] })
  return profile?.resolvedPermissions?.includes(permission) ?? false
}
```

### 403 safety net in `frontend/src/lib/api.ts`

```typescript
// If backend returns 403, the frontend permissions cache is stale — force refetch
if (response.status === 403) {
  queryClient.invalidateQueries({ queryKey: ["permissions-map"] })
  queryClient.invalidateQueries({ queryKey: ["profile/me"] })
}
```

### Note: `profile/me` must include `resolvedPermissions`

The backend `/profile/me` endpoint must expand `profile.roles` → `role.permissions` and
return the flat list:
```json
{
  "id": "...",
  "username": "alice",
  "roles": ["manager"],
  "resolvedPermissions": ["cluster:read", "cluster:create", "cluster:update", "cluster:delete", ...]
}
```

---

## Step 11 — Update `frontend/src/config/permissions.ts`

Remove the static `PERMISSIONS` matrix entirely. Keep only:

```typescript
// Mirror of backend RESOURCE_DEFINITIONS — for TypeScript types only, not logic
export const RESOURCE_DEFINITIONS = { ... } as const
export type ResourceKey = keyof typeof RESOURCE_DEFINITIONS
export type Permission  = { [R in ResourceKey]: `${R}:${...}` }[ResourceKey]

// Re-export hooks as the canonical way to check permissions
export { useCanCall, usePermission } from "../hooks/useCanCall"
```

---

## Step 12 — Update frontend components

Replace all role-based checks with `useCanCall`:

```tsx
// BEFORE — role-based, hardcoded, doesn't reflect backend changes
const canCreate = profile?.permission?.includes("manager")
{canCreate && <CreateClusterButton />}

// AFTER — endpoint-based, always in sync with backend
const canCreate = useCanCall("POST", "/api/cluster")
{canCreate && <CreateClusterButton />}

// For parameterized paths
const canDelete = useCanCall("DELETE", `/api/cluster/${clusterId}`)
// matchPath normalises :id segments automatically
```

Files to update:
- `components/cluster/create-cluster-dialog.tsx`
- `routes/dashboard/cluster/$id/edit.tsx`
- `routes/dashboard/cluster/$id/deployments/create.tsx`
- `routes/dashboard/cluster/$id/pods/create.tsx`
- `routes/dashboard/cluster/$id/services/*.tsx`
- `routes/dashboard/cluster/$id/ingresses/*.tsx`
- `routes/dashboard/cluster/$id/configmaps/create.tsx`
- `routes/dashboard/cluster/$id/secrets/create.tsx`
- `routes/dashboard/users.tsx`
- `components/Sidebar.tsx` (hide nav items the user cannot access)

---

## Step 13 — Roles management page (NEW)

`frontend/src/routes/dashboard/roles/index.tsx`

- Table of all roles from `GET /api/role` with columns: Name, Description, Permissions count, Default, Actions
- **Default column** — shows a badge/indicator for roles where `isDefault: true`, e.g. `● Default`
- Create role dialog: name + description + permission checkboxes from `GET /api/role/all-permissions` (grouped by resource, each resource is a collapsible section)
- Edit role dialog: same form pre-populated
- Delete confirmation dialog — disabled for roles where `isDefault: true` (tooltip: "Unset default before deleting")
- **Set/unset default toggle** — switch or button in each row; calls `PATCH /api/role/:id/set-default`
  - When only one default remains, its toggle is disabled with a tooltip: "At least one default role is required"
  - Optimistic update: toggle flips immediately, reverts on error
- All write actions guarded: `usePermission("role:create")`, `usePermission("role:update")`, `usePermission("role:delete")`

### Default role UX detail

```tsx
// In the roles table row
const isLastDefault = role.isDefault && defaultRoles.length === 1

<Switch
  checked={role.isDefault}
  disabled={isLastDefault || !canUpdateRole}
  title={isLastDefault ? "At least one default role is required" : undefined}
  onCheckedChange={(checked) =>
    mutation.mutate({ id: role.id, isDefault: checked })
  }
/>
```

---

## Execution order

```
Step 1  constants/permissions.ts              — no dependencies
Step 2  DB schema + migration                 — depends on Step 1
          └─ role table gets isDefault column
          └─ seed: built-in 'user' role marked isDefault: true
Step 3  Filter operators (in Step 1)          — part of Step 1
Step 4  utils/permissions.ts                  — depends on Steps 1 + 2
Step 5  middleware/auth.ts refactor           — depends on Step 4
Step 6  routes/role.ts                        — depends on Step 5
          └─ includes PATCH /:id/set-default
Step 7  All route files                       — depends on Step 5
          └─ profile.ts: auto-assign default roles on POST /profile
Step 8  index.ts endpoints                    — depends on Steps 1 + 7
        ──────────────────────────────────────── deploy backend ───
Step 9  lib/permission-matcher.ts             — independent
Step 10 hooks/usePermissionsMap + useCanCall  — depends on Step 8 being deployed
Step 11 config/permissions.ts update         — depends on Step 10
Step 12 Component updates                    — depends on Step 10
Step 13 Roles management page                — depends on Steps 6 + 10 + 11
          └─ includes default-role toggle UI
```

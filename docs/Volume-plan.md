# Volume Mount Implementation Plan (Comprehensive Blueprint)
## k8s-dashboard PaaS — Storage & Volume Feature
Reference: https://kubernetes.io/docs/concepts/storage/volumes/
---

## Overview

This document outlines the detailed implementation plan for the **Storage & Volume Mount** feature in the k8s-dashboard. The scope explicitly relies on the real-time **WebSocket State Sync** flow, mapping out exactly how K8s storage features fit the Go Agent -> Backend Drizzle schema -> Elysia REST -> TanStack React UI architecture.

The scope introduces fine-grained RBAC and is split into two roles:
- **Infrastructure Admin (`storageclass:*`, `pv:*`)**: manages cluster-wide storage infrastructure.
- **Namespace User (`pvc:*`, `deployment:update`)**: consumes storage via volume claims and mounts them into Deployments / Pods.

---

## Milestones

```text
M1 — Storage CRUD (Protobuf definitions, Agent Sync, Backend DB schemas, Frontend UI)
M2 — Volume Mount UI (Deployment / Pod Config integration)
M3 — Guardrails & Diagnostics
M4 — VolumeSnapshot (Future Admin)
```

---

## 🔒 0. Security (RBAC) & Project Alignment

**File Affected:** `backend/src/constants/permissions.ts`
Add the following to `RESOURCE_DEFINITIONS`:
- **`storageclass`**: read, create, update, delete, manage
- **`pv`**: read, create, update, delete, manage
- **`pvc`**: read, create, update, delete, manage

Roles must be evaluated on the backend API layer (`auth.ts`) and on frontend components heavily using the defined `getPermissionsGrouped()` structures.

---

## M1 — Storage CRUD (Admin)

### 1.1 Protobuf Definition Updates
**File:** `protobuf/agent-backend/websocket.proto`
We must update the Protobuf definition to stream state back to the backend.

```protobuf
// Append to Heartbeat message
repeated StorageClass storage_classes = 10;
repeated PV pvs = 11;
repeated PVC pvcs = 12;

// New Structs Mapping
message StorageClass { string name = 1; string provisioner = 2; string reclaim_policy = 3; string volume_binding_mode = 4; map<string, string> annotations = 5; }
message PV { string name = 1; int64 capacity = 2; string phase = 3; string bound_pvc = 4; string reclaim_policy = 5; repeated string access_modes = 6; }
message PVC { string name = 1; string namespace = 2; int64 capacity = 3; string phase = 4; string storage_class = 5; string volume_name = 6; }
```
*(Run `./protobuf/generate.sh` to update Go and TypeScript definitions).*

### 1.2 Go Agent Sync Logic (`agent/service/k8s/resources.go` & `k8s.go`)
1. Add `client-go` Informers to watch `StorageClass`, `PersistentVolume`, `PersistentVolumeClaim`.
2. Map fetched objects into the newly defined Protobuf structs.
3. Ensure the mapped arrays attached to `pb.Heartbeat` pushed over the websocket.

### 1.3 Command Execution (Agent -> `agent/command.go`)
StorageClass and PV/PVC creation/deletion can seamlessly use the existing `CREATE_RESOURCE` / `DELETE_RESOURCE` switch cases that accept raw YAML.

### 1.4 Backend Storage Schemas (`backend/src/database/schema.ts`)
Add new Drizzle schemas reflecting the Agent's heartbeat stream:
```typescript
export const k8sStorageClasses = pgTable("k8sStorageClasses", {
    id: serial("id").primaryKey(),
    clusterId: integer("cluster_id").notNull().references(() => k8sCluster.id),
    name: text("name").notNull(),
    provisioner: text("provisioner").notNull(),
    reclaimPolicy: text("reclaim_policy"),
    volumeBindingMode: text("volume_binding_mode"),
    annotations: jsonb("annotations").default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    k8sUid: text("k8s_uid"),
});
// Also add `k8sPersistentVolumes` and `k8sPersistentVolumeClaims`.
```

### 1.5 Backend REST APIs (`backend/src/routes/storageclass.ts`, `pv.ts`, `pvc.ts`)
Expose standard Elysia GET endpoints querying Drizzle to populate the Frontend. Add POST/DELETE endpoints that queue standard YAML manifestations into the `agentCommands` table.

### 1.6 Frontend Routes & UI UX (`frontend/src/routes/dashboard/cluster/$id/`)

**StorageClass UI:**
| Task | Notes |
|---|---|
| List | Show provisioner, reclaim policy, volume binding mode, default badge |
| Create | Preset forms for `longhorn-local`, `longhorn-ha` + custom mode |
| Edit | Only allow annotation edits (fields are immutable) |
| Delete | Block via `storageclass:delete` RBAC check. Block if PVCs exist referencing this class. |
*Note:* `volumeBindingMode: WaitForFirstConsumer` will be labeled. PVCs showing `Pending` is normal here.

**PV UI (`.../pvs`):**
| Task | Notes |
|---|---|
| List | Show phase (color-coded), capacity, access modes, reclaim policy, bound PVC |
| Create | Support NFS, Longhorn static provisioning, hostPath (warn on dev) |
| Delete | Pre-deletion RBAC check (`pv:delete`). Show reclaim consequence (`Retain` vs `Delete`). |

**PVC UI (`.../pvcs`):**
| Task | Notes |
|---|---|
| List | Per-namespace, show phase, StorageClass, capacity, bound PV |
| Create | Dynamic (pick StorageClass) OR static (bind PV by name) |
| Delete | Block with error if PVC is mounted by a running pod. |
| Resize | Edit capacity field only. |

---

## M2 — Volume Mount UI (Deployment / Pod Config)

### 2.1 Database Schema Adjustments (`schema.ts`)
Introduce normalized reference tables mimicking `deployment_configmap_volume_refs`:
- `deployment_pvc_volume_refs`
- `deployment_emptydir_volume_refs`

### 2.2 Volume Definition (Pod Spec Level UI)
Add a **Volumes** tab in the Deployment `edit.tsx` page format:
| Field | Type | Notes |
|---|---|---|
| Name | string | Must be unique within the pod spec |
| Source type | enum | `PVC`, `ConfigMap`, `Secret`, `emptyDir` |
| Source ref | select | Pick from namespace existing resources |
| Optional | bool | Don't fail pod if source missing (ConfigMap/Secret) |

### 2.3 VolumeMount (Per Container level UI)
Inside the exact container edit component:
| Field | Type | Notes |
|---|---|---|
| Volume | select | Pick from the defined volumes |
| Mount path | string | Absolute path inside container (`/data`) |
| Sub path | string | Mount a single key as a file |
| Read only | bool | Default false |

### 2.4 ConfigMap / Secret File Projection UI
When source type is `ConfigMap` or `Secret`, show a **Key Projection** sub-table:
- **Off:** Mount all keys implicitly into the directory.
- **On:** Define explicit `items[].key` -> `items[].path` bindings.

### 2.5 Visual Binding Summary
At the bottom of the config page, display a read-only table mapping Volume → Mount Path showing exactly where storage is mapped.
```text
Volume Name         Source              Container       Mount Path
─────────────────────────────────────────────────────────────────
app-config-vol      ConfigMap/cfg       app             /etc/conf (subPath ⚠ no reload)
data-vol            PVC/my-data         app             /data
tmp-vol             emptyDir            sidecar         /tmp
```

---

## M3 — Guardrails & Diagnostics

These UI tooltips and pre-flight submit checks ensure users don't break K8s semantics:
| Guard | Trigger | Action |
|---|---|---|
| RWO Conflict | Deployment replicas > 1 AND volume is RWO | ⚠ "PVC uses ReadWriteOnce — only one pod can mount it at a time." |
| subPath Warning | Any mount uses `subPath` for conf | ⚠ "subPath mounts do not auto-reload — restart required." |
| PVC Block | Delete PVC while pods are mounted | ✖ "PVC is currently mounted by pods. Stop pods first." |
| Unmounted | Volume defined but unmounted | ⚠ "Volume is defined but not mounted." |
| Missing | container logic maps to a deleted volume | ✖ "Volume not found in pod spec." |
| Pending | PVC Phase Pending > 60s | Surface diagnostic K8s event data. |

---

## M4 — VolumeSnapshot (Future Admin Scope)

 Requires `snapshot.storage.k8s.io` CRDs on the cluster. Handled similar to standard storage API.
Protobuf additions required: `volume_snapshot_classes` and `volume_snapshots` injected into the `Heartbeat`.
Command Types required: Admin creation and snapshots restore definitions.

---

## Out of Scope (YAML/CLI Only)
The UI should explicitly display a callout: *"For advanced storage config, use the YAML editor."*
- PVC clone (`dataSource: PVC`)
- CSI ephemeral inline volumes
- Projected volumes / ServiceAccount token volumes
- `ReadWriteOncePod` access mode
- StatefulSet `volumeClaimTemplates`

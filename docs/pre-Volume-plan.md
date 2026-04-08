# Volume Mount Implementation Plan
## k8s-dashboard PaaS — Storage & Volume Feature

---

## Overview

This document outlines the implementation plan for the **Storage & Volume Mount** feature in the k8s-dashboard. The scope is split into two roles:

- **Admin** — manages storage infrastructure (StorageClass, PV, PVC, VolumeSnapshot)
- **User** — consumes storage via volume mounts in Deployment / Pod config

Out-of-scope items (PVC clone, CSI ephemeral, projected volumes, hostPath, StatefulSet volumeClaimTemplates, init container volume wiring) are deferred to YAML/CLI.

---

## Milestones

```
M1 — Storage CRUD (Admin)
M2 — Volume Mount UI (Deployment / Pod)
M3 — Guardrails & Diagnostics
M4 — VolumeSnapshot (Admin)
```

---

## M1 — Storage CRUD (Admin)

### StorageClass

| Task | Notes |
|---|---|
| List StorageClasses | Show provisioner, reclaim policy, volume binding mode, default badge |
| View detail | Parameters, annotations, events |
| Create StorageClass | Form with preset templates: `longhorn-local`, `longhorn-ha`, `longhorn-rwx` + custom mode |
| Edit StorageClass | Only allow annotation edits (most fields are immutable after creation) |
| Set default StorageClass | Toggle default annotation `storageclass.kubernetes.io/is-default-class` |
| Delete StorageClass | Block if PVCs exist referencing this class — show count |

**Notes:**
- `volumeBindingMode: WaitForFirstConsumer` must be clearly labeled — PVCs will show `Pending` until a pod schedules, which is normal and should NOT surface as an error in the UI.
- Longhorn preset templates should pre-fill known parameters (e.g., `numberOfReplicas`, `dataLocality`) to reduce friction for admins onboarding a new cluster.

---

### PersistentVolume (PV)

| Task | Notes |
|---|---|
| List PVs | Show phase (Available / Bound / Released / Failed), capacity, access modes, reclaim policy, bound PVC |
| View detail | Full spec, bound PVC link, events |
| Create PV | Support: hostPath (dev only, show warning), NFS, Longhorn static provisioning |
| Delete PV | Show reclaim policy consequence before confirm: `Retain` = data stays, `Delete` = data destroyed |
| PV phase badge | Color-coded: green=Bound, yellow=Available, red=Failed, grey=Released |

**Notes:**
- Manual PV creation is mostly needed for NFS or pre-existing storage. Longhorn dynamic provisioning via StorageClass covers most cases.
- `Released` PVs (PVC deleted, data retained) should surface prominently — admins need to decide to re-use or clean up.
- Do NOT allow editing a Bound PV — k8s blocks most mutations anyway.

---

### PersistentVolumeClaim (PVC)

| Task | Notes |
|---|---|
| List PVCs | Per-namespace, show phase, StorageClass, capacity, bound PV, age |
| View detail | Events, list of pods currently mounting this PVC |
| Create PVC | Dynamic (pick StorageClass + size) OR static (bind to specific PV by name) |
| Resize PVC | Only show resize option if StorageClass has `allowVolumeExpansion: true` |
| Delete PVC | Block with error if PVC is currently mounted by a running pod (k8s finalizer `kubernetes.io/pvc-protection`) |
| Orphaned PVC detection | Flag PVCs not mounted by any pod — surface in a dedicated "Orphaned" filter tab |
| PVC phase badge | Green=Bound, yellow=Pending, red=Lost |

**Notes:**
- **Pending PVC diagnosis**: when a PVC is stuck in `Pending`, surface the reason from events:
  - No matching StorageClass → "StorageClass not found"
  - `WaitForFirstConsumer` + no pod scheduled → "Waiting for pod to be scheduled (normal)"
  - Capacity exceeded → "No available PV with sufficient capacity"
- **Resize flow**: Edit capacity field only — changing StorageClass or access mode requires delete+recreate (show warning).
- **RWO conflict detection**: if a PVC with `ReadWriteOnce` is already bound to a node, mounting it from a pod on a different node will fail. Surface this in the PVC detail view.

---

## M2 — Volume Mount UI (Deployment / Pod Config)

### Volume Definition (Pod Spec Level)

Add a **Volumes** tab in the Deployment / Pod config page. Each volume entry has:

| Field | Type | Notes |
|---|---|---|
| Name | string | Must be unique within the pod spec, used to reference in mounts |
| Source type | enum | `PVC`, `ConfigMap`, `Secret`, `emptyDir` |
| Source reference | select | Pick from existing PVCs / ConfigMaps / Secrets in the namespace |
| `optional` flag | bool | Don't fail pod if source missing (ConfigMap/Secret only) |

**UI note:** Volume name is auto-suggested from the source name (e.g., `my-config` → `my-config-vol`) but user can override.

---

### VolumeMount (Per Container)

Each container in the pod spec has a **Volume Mounts** sub-section:

| Field | Type | Notes |
|---|---|---|
| Volume | select | Pick from volumes defined above (by name) |
| Mount path | string | Absolute path inside container |
| Sub path | string | Optional — mount a single key as a single file |
| Read only | bool | Default false |

**Validation:**
- Mount path must start with `/`
- Sub path must not start with `/`
- Cannot have two mounts at the same path in the same container

---

### ConfigMap / Secret as File — Key Projection

When source type is `ConfigMap` or `Secret`, show an additional **Key Projection** toggle:

- **Off (default):** mount all keys as files in the directory at `mountPath`
- **On:** show a key→filename mapping table using `items[].key` and `items[].path`

| Field | Notes |
|---|---|
| Key | select from keys of the ConfigMap / Secret |
| File name (path) | filename that will appear at `mountPath/<filename>` |
| Default mode | octal permission bits, e.g. `0644` (default), `0400` for secrets |

**Notes:**
- `subPath` mounts (mounting a single key as a file at a specific path) do NOT hot-reload when the ConfigMap/Secret changes. Show a persistent warning: _"subPath mounts require a pod restart to pick up ConfigMap/Secret changes."_
- Whole-directory mounts (no subPath) DO hot-reload with ~1 min kubelet sync delay.

---

### Visual Binding Summary

After the user defines volumes and mounts, show a read-only summary panel:

```
Volume Name         Source              Container       Mount Path
─────────────────────────────────────────────────────────────────
app-config-vol      ConfigMap/app-cfg   app             /etc/config  (subPath: app.yaml ⚠ no hot-reload)
data-vol            PVC/my-data         app             /data
tmp-vol             emptyDir            app             /tmp
                                        sidecar         /shared
```

This makes it easy to audit what is mounted where without reading YAML.

---

## M3 — Guardrails & Diagnostics

| Guard | Trigger | Message |
|---|---|---|
| RWO + replicas > 1 | Deployment replicas > 1 AND a PVC volume is RWO | ⚠ "PVC `my-data` uses ReadWriteOnce — only one pod can mount it at a time. Consider using an RWX StorageClass or reducing replicas to 1." |
| subPath no hot-reload | Any mount uses `subPath` with a ConfigMap or Secret source | ⚠ "subPath mounts do not auto-reload — pod restart required for config changes." |
| PVC in-use delete block | Delete PVC while pods are mounting it | ✖ "PVC is currently mounted by: `app-abc123`. Stop or delete the pod first." |
| Unmounted volume | A volume is defined in the pod spec but no container mounts it | ⚠ "Volume `tmp-vol` is defined but not mounted by any container." |
| Missing volume reference | A container volumeMount references a volume name that does not exist | ✖ "Volume `missing-vol` not found in pod spec. Add it in the Volumes tab." |
| PVC stuck Pending | PVC phase is Pending for > 60s | Surface reason from events in a diagnostic tooltip |
| RWO node conflict | PVC bound to Node A, new pod scheduled to Node B | ⚠ "PVC is bound to a different node. Pod may fail to schedule." |

---

## M4 — VolumeSnapshot (Admin)

### VolumeSnapshotClass

| Task | Notes |
|---|---|
| List VolumeSnapshotClasses | Show driver, deletion policy |
| Create VolumeSnapshotClass | Longhorn driver pre-filled as default |
| Set default | Annotation `snapshot.storage.kubernetes.io/is-default-class` |
| Delete | Block if snapshots exist using this class |

### VolumeSnapshot

| Task | Notes |
|---|---|
| List snapshots | Per namespace, show source PVC, class, size, `ReadyToUse` status, age |
| Create snapshot | Pick source PVC + SnapshotClass, set name |
| View detail | `ReadyToUse`, `restoreSize`, error message if failed |
| Delete snapshot | Confirm dialog — data is unrecoverable |
| Restore to new PVC | Create PVC with `dataSource: kind: VolumeSnapshot` — opens Create PVC form pre-filled |

**Notes:**
- Requires `snapshot.storage.k8s.io` CRDs installed on cluster — if not present, show a setup banner with instructions rather than crashing.
- `ReadyToUse: false` snapshots should show error from `VolumeSnapshotContent.status.error` — surface this in the list view.
- Restoring a snapshot creates a **new** PVC — it does not overwrite the source. Make this clear in the restore dialog.

---

## API Layer (Go Agent / Backend)

### New Protobuf messages needed

```protobuf
// Storage
rpc ListStorageClasses (ListRequest) returns (StorageClassList);
rpc GetStorageClass (GetRequest) returns (StorageClass);
rpc CreateStorageClass (StorageClass) returns (StorageClass);
rpc DeleteStorageClass (DeleteRequest) returns (Empty);
rpc SetDefaultStorageClass (SetDefaultRequest) returns (Empty);

rpc ListPVs (ListRequest) returns (PVList);
rpc GetPV (GetRequest) returns (PV);
rpc CreatePV (PV) returns (PV);
rpc DeletePV (DeleteRequest) returns (Empty);

rpc ListPVCs (NamespacedListRequest) returns (PVCList);
rpc GetPVC (NamespacedGetRequest) returns (PVC);
rpc CreatePVC (PVC) returns (PVC);
rpc ResizePVC (ResizePVCRequest) returns (PVC);
rpc DeletePVC (NamespacedDeleteRequest) returns (Empty);

// Snapshots
rpc ListVolumeSnapshotClasses (ListRequest) returns (SnapshotClassList);
rpc CreateVolumeSnapshotClass (SnapshotClass) returns (SnapshotClass);
rpc DeleteVolumeSnapshotClass (DeleteRequest) returns (Empty);

rpc ListVolumeSnapshots (NamespacedListRequest) returns (SnapshotList);
rpc CreateVolumeSnapshot (CreateSnapshotRequest) returns (VolumeSnapshot);
rpc DeleteVolumeSnapshot (NamespacedDeleteRequest) returns (Empty);
```

**Security notes for the agent:**
- Never return Secret values in any response — only return key names (same existing rule).
- PVC delete must check `kubernetes.io/pvc-protection` finalizer — return a structured error if present, not a raw k8s error.
- VolumeSnapshot restore should return the resulting PVC object so the frontend can navigate to it immediately.

---

## Frontend Routes

```
/storage
  /storage/storageclass              → StorageClass list
  /storage/storageclass/:name        → detail
  /storage/storageclass/new          → create form

  /storage/pv                        → PV list
  /storage/pv/:name                  → detail
  /storage/pv/new                    → create form

  /storage/pvc                       → PVC list (namespace-scoped)
  /storage/pvc/:namespace/:name      → detail
  /storage/pvc/new                   → create form

  /storage/snapshot                  → VolumeSnapshot list
  /storage/snapshot/:namespace/:name → detail

  /storage/snapshotclass             → VolumeSnapshotClass list
```

Volume mount config lives inside existing routes:
```
/deployments/:namespace/:name/edit   → add Volumes tab
/pods/:namespace/:name/edit          → add Volumes tab (for standalone pods)
```

---

## Implementation Order

```
Week 1  →  M1: StorageClass + PVC CRUD (highest daily use)
Week 2  →  M1: PV CRUD
Week 3  →  M2: Volume definition + VolumeMount UI in Deployment config
Week 4  →  M2: ConfigMap/Secret key projection + visual binding summary
Week 5  →  M3: All guardrails + PVC pending diagnostics
Week 6  →  M4: VolumeSnapshot + SnapshotClass
```

---

## Out of Scope (YAML/CLI)

The following are explicitly deferred. The UI should show a callout: _"For advanced storage config, use the YAML editor or kubectl."_

- PVC clone (`dataSource: PVC`)
- CSI ephemeral inline volumes
- `projected` volumes (combined ConfigMap + Secret + SA token)
- `hostPath` volumes
- `ReadWriteOncePod` (RWOP) access mode
- `Recycle` reclaim policy
- StatefulSet `volumeClaimTemplates`
- Init container volume wiring
- StorageCapacity tracking
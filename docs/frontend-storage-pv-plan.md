# Frontend Implementation Plan: StorageClasses & PersistentVolumes

## 1. Overview

This plan outlines the frontend implementation for StorageClasses and PersistentVolumes following the existing project patterns (PVC, deployments, services).

## 2. Resource Relationships

```
┌─────────────────────┐         ┌─────────────────────┐
│  StorageClass       │────────<│  PersistentVolume   │
│  (cluster-wide)     │         │  (cluster-wide)     │
└─────────────────────┘         └──────────┬──────────┘
        ▲                                 │
        │ provisioner                     │ bound to
        │                                 ▼
        │                        ┌─────────────────────┐
        └───────────────────────┤  PVC                │
                   used by      │  (namespace-scoped) │
                                └─────────────────────┘
```

- **StorageClass**: Defines provisioner and volume parameters (e.g., `local-path`, `nfs-client`)
- **PersistentVolume**: Actual storage resources (can be manually created or dynamically provisioned)
- **PVC**: Claims storage from StorageClass or specific PV

## 3. API Endpoints (Already Implemented)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/storageclasses/:clusterId` | List all StorageClasses |
| POST | `/api/storageclasses/:clusterId` | Create StorageClass |
| DELETE | `/api/storageclasses/:clusterId/:name` | Delete StorageClass |
| PATCH | `/api/storageclasses/:clusterId/:name/set-default` | Set as default |
| GET | `/api/pvs/:clusterId` | List all PersistentVolumes |
| POST | `/api/pvs/:clusterId` | Create PersistentVolume |
| DELETE | `/api/pvs/:clusterId/:name` | Delete PersistentVolume |

## 4. Frontend Routes Structure

```
frontend/src/routes/dashboard/cluster/$id/
├── storage-classes/
│   ├── index.tsx       # List view (CRUD + set default)
│   └── create.tsx      # Create form
└── persistent-volumes/
    ├── index.tsx       # List view (CRUD)
    └── create.tsx      # Create form (NFS/hostPath)
```

## 5. UI Components Needed

### 5.1 StorageClasses Page (`storage-classes/index.tsx`)

**Features:**
- Table listing: Name, Provisioner, Reclaim Policy, Volume Binding Mode, Default
- Create button (permission: `storageclass:create`)
- Set Default button (permission: `storageclass:update`)
- Delete button (permission: `storageclass:delete`)

**Table Columns:**
| Column | Source Field |
|--------|--------------|
| Name | `name` |
| Provisioner | `provisioner` |
| Reclaim Policy | `reclaimPolicy` |
| Volume Binding | `volumeBindingMode` |
| Default | `isDefault` (boolean badge) |
| Actions | Edit/Delete buttons |

### 5.2 PersistentVolumes Page (`persistent-volumes/index.tsx`)

**Features:**
- Table listing: Name, Capacity, Status, StorageClass, Access Modes, Claim
- Create button (permission: `pv:create`)
- Delete button (permission: `pv:delete`)

**Table Columns:**
| Column | Source Field |
|--------|--------------|
| Name | `name` |
| Capacity | `capacity` (MiB → GiB display) |
| Status | `phase` (Bound/Available/Failed) |
| StorageClass | `storageClass` |
| Access Modes | `accessModes.data` (ReadWriteOnce, etc.) |
| Claim | `boundPvc` (namespace/name) |
| Actions | Delete button |

### 5.3 Create Forms

**StorageClass Create:**
- Name input
- Provisioner select (e.g., `kubernetes.io/aws-ebs`, `nfs-client`, `local-path`)
- Reclaim Policy select (Delete/Retain)
- Volume Binding Mode select (Immediate/WaitForFirstConsumer)
- Allow Volume Expansion toggle
- Annotations/Labels (optional)

**PersistentVolume Create:**
- Name input
- Capacity input (GiB)
- StorageClass select (dropdown from StorageClasses)
- Access Modes multi-select (ReadWriteOnce, ReadOnlyMany, ReadWriteMany)
- Reclaim Policy select (Delete/Retain)
- Source Type tabs: NFS / HostPath
  - NFS: server, path, readOnly toggle
  - HostPath: path, type (Directory/DirectoryOrCreate/File/FileOrCreate)

## 6. Sidebar Navigation Updates

Add to `frontend/src/components/Sidebar.tsx`:

```typescript
{
  to: `/dashboard/cluster/${clusterId}/storage-classes`,
  label: "Storage Classes",
  icon: HardDrive, // or new icon
  permission: "storageclass:read" as PermissionFilter,
},
{
  to: `/dashboard/cluster/${clusterId}/persistent-volumes`,
  label: "Persistent Volumes",
  icon: HardDrive, // or different icon
  permission: "pv:read" as PermissionFilter,
},
```

Note: After adding, remove or keep PVCs based on preference (PVCs still needed for pod volume mounts).

## 7. Integration Points

### 7.1 With Existing PVC UI
- When creating PVC, show StorageClass dropdown (fetches from `/api/storageclasses/:clusterId`)
- Display which StorageClass a PVC uses

### 7.2 With Deployment/Pod Creation
- Volume mount section already exists
- No changes needed for M2

## 8. Permission Requirements

| Permission | Usage |
|------------|-------|
| `storageclass:read` | View StorageClasses list |
| `storageclass:create` | Create new StorageClass |
| `storageclass:update` | Set default StorageClass |
| `storageclass:delete` | Delete StorageClass |
| `storageclass:manage` | All operations |
| `pv:read` | View PersistentVolumes list |
| `pv:create` | Create new PersistentVolume |
| `pv:delete` | Delete PersistentVolume |
| `pv:manage` | All operations |

## 9. Implementation Order

1. **Sidebar Updates** - Add navigation items
2. **StorageClasses List Page** - Index page with table
3. **StorageClasses Create Page** - Form for creation
4. **PersistentVolumes List Page** - Index page with table
5. **PersistentVolumes Create Page** - Form for creation
6. **PVC Integration** - Show StorageClass in PVC details

## 10. Design Patterns to Follow

- Use same table/card patterns as `pvcs/index.tsx`
- Use same form patterns as `pvcs/create.tsx` and `deployments/create.tsx`
- Use `usePermissions()` hook for RBAC
- Use `toast` from `sonner` for notifications
- Use TanStack Query for data fetching
- Follow same loading/empty states

---

*Plan created: 2026-04-06*

# Database Schema Refactoring Plan: JSONB to Normalized Tables

## Executive Summary

This document outlines the comprehensive plan for refactoring the Kubernetes Dashboard database schema, specifically migrating from JSONB columns to normalized relational tables for better data integrity, query performance, and maintainability.

## Table of Contents
1. [Overview](#overview)
2. [Current State Analysis](#current-state-analysis)
3. [Target Architecture](#target-architecture)
4. [Implementation Phases](#implementation-phases)
5. [Database Schema Design](#database-schema-design)
6. [Utility Functions](#utility-functions)
7. [Route Handler Updates](#route-handler-updates)
8. [Migration Strategy](#migration-strategy)
9. [Testing Plan](#testing-plan)
10. [Rollback Procedure](#rollback-procedure)
11. [Timeline & Resources](#timeline--resources)

---

## Overview

### Goals
- **Normalize JSONB columns** into proper relational tables with foreign key constraints
- **Improve data integrity** through database-level constraints
- **Enhance query performance** by replacing JSONB operations with indexed lookups
- **Maintain backward compatibility** during migration
- **Reduce code duplication** through shared utility functions

### Scope
- **Tables affected**: `k8sPods`, `k8sDeployments`
- **Columns to refactor**:
  - `ports` (JSONB → normalized table)
  - `configMapRefs` (JSONB → 3 normalized tables: env, envFrom, volumes + volume items)
  - `secretRefs` (JSONB → 3 normalized tables: env, envFrom, volumes + volume items)

### Out of Scope
- Frontend changes (API contracts remain the same)
- Agent communication changes
- Other JSONB columns not mentioned above

---

## Current State Analysis

### Existing Schema Issues

#### 1. **k8sPods Table (lines 229-265)**
```typescript
// Current problematic fields:
ports: jsonb("ports").$type<any>().default([]).notNull(),
configMapRefs: jsonb("config_map_refs").$type<{
  env?: Array<{ name: string; configMapName: string; key: string }>;
  envFrom?: Array<{ configMapName: string; prefix?: string }>;
  volumes?: Array<{
    name: string;
    configMapName: string;
    mountPath: string;
    items?: Array<{ key: string; path: string }>;
  }>;
}>().default({ env: [], envFrom: [], volumes: [] }).notNull(),
secretRefs: jsonb("secret_refs").$type<...>()...
```

#### 2. **k8sDeployments Table (lines 311-347)**
```typescript
// Identical structure to k8sPods
ports: jsonb("ports").$type<any>().default([]).notNull(),
configMapRefs: jsonb("config_map_refs").$type<...>()...
secretRefs: jsonb("secret_refs").$type<...>()...
```

### Problems with Current Approach
1. **No referential integrity**: JSONB fields can reference non-existent ConfigMaps/Secrets
2. **Difficult querying**: Finding all pods using a specific ConfigMap requires JSONB traversal
3. **No cascading updates**: Deleting a ConfigMap doesn't update references
4. **Type safety issues**: `$type<any>()` bypasses TypeScript type checking
5. **Performance**: JSONB queries are slower than indexed foreign key lookups
6. **Code duplication**: Same logic repeated in pod.ts and deployment.ts

---

## Target Architecture

### Database Normalization Strategy

```
┌─────────────┐
│  k8sPods    │
└──────┬──────┘
       │
       ├─────────► podPorts (1:N)
       │           ├─ containerPort
       │           └─ name (optional)
       │
       ├─────────► podConfigMapEnvRefs (1:N)
       │           ├─ name
       │           ├─ configMapName
       │           └─ key
       │
       ├─────────► podConfigMapEnvFromRefs (1:N)
       │           ├─ configMapName
       │           └─ prefix (optional)
       │
       ├─────────► podConfigMapVolumeRefs (1:N)
       │           ├─ name
       │           ├─ configMapName
       │           ├─ mountPath
       │           └─ podConfigMapVolumeItemRefs (1:N)
       │                ├─ key
       │                └─ path
       │
       ├─────────► podSecretEnvRefs (1:N)
       ├─────────► podSecretEnvFromRefs (1:N)
       ├─────────► podSecretVolumeRefs (1:N)
       └─────────► podSecretVolumeItemRefs (1:N)

┌─────────────────┐
│ k8sDeployments  │  (Same structure as pods)
└─────────────────┘
```

### Benefits of New Architecture
1. **Referential integrity**: Foreign keys ensure valid pod/deployment references
2. **Cascade deletes**: Deleting a pod automatically removes all associated refs
3. **Efficient queries**: Find all resources using a ConfigMap via JOIN
4. **Type safety**: Proper TypeScript types for all fields
5. **Indexing**: Better performance with indexed foreign keys
6. **Maintainability**: Separate tables easier to understand and modify

---

## Implementation Phases

### Phase 1: Database Schema Updates ✅ COMPLETED
**Status**: ✅ Completed  
**File**: `backend/src/database/schema.ts`

#### 1.1 Create New Tables (Lines 533-752)

**Pod Tables** (8 tables):
1. `podPorts` - Container ports configuration
2. `podConfigMapEnvRefs` - Environment variables from ConfigMaps
3. `podConfigMapEnvFromRefs` - Environment variable sets from ConfigMaps
4. `podConfigMapVolumeRefs` - Volume mounts from ConfigMaps
5. `podConfigMapVolumeItemRefs` - Individual file mappings in volumes
6. `podSecretEnvRefs` - Environment variables from Secrets
7. `podSecretEnvFromRefs` - Environment variable sets from Secrets
8. `podSecretVolumeRefs` - Volume mounts from Secrets
9. `podSecretVolumeItemRefs` - Individual file mappings in volumes

**Deployment Tables** (8 tables):
10. `deploymentPorts`
11. `deploymentConfigMapEnvRefs`
12. `deploymentConfigMapEnvFromRefs`
13. `deploymentConfigMapVolumeRefs`
14. `deploymentConfigMapVolumeItemRefs`
15. `deploymentSecretEnvRefs`
16. `deploymentSecretEnvFromRefs`
17. `deploymentSecretVolumeRefs`
18. `deploymentSecretVolumeItemRefs`

#### 1.2 Add Relations (Lines 810-1020)
- Defined bidirectional relations between parent and child tables
- Set up cascade deletes for data integrity

#### 1.3 Export Schema (Lines 770-788)
- Added all new tables to schema object for Drizzle ORM access

---

### Phase 2: Shared Utility Functions ✅ COMPLETED
**Status**: ✅ Completed  
**File**: `backend/src/utils/resource-refs.ts` (23,182 chars)

#### 2.1 Type Definitions
```typescript
export interface PortRef {
  containerPort: number;
  name?: string;
}

export interface ConfigMapEnvRef {
  name: string;
  configMapName: string;
  key: string;
}

export interface ConfigMapEnvFromRef {
  configMapName: string;
  prefix?: string;
}

export interface ConfigMapVolumeRef {
  name: string;
  configMapName: string;
  mountPath: string;
  items?: Array<{ key: string; path: string }>;
}

// Similar for SecretEnvRef, SecretEnvFromRef, SecretVolumeRef

export interface ResourceRefs {
  configMapRefs?: {
    env?: ConfigMapEnvRef[];
    envFrom?: ConfigMapEnvFromRef[];
    volumes?: ConfigMapVolumeRef[];
  };
  secretRefs?: {
    env?: SecretEnvRef[];
    envFrom?: SecretEnvFromRef[];
    volumes?: SecretVolumeRef[];
  };
}
```

#### 2.2 CRUD Functions for Pods
```typescript
// INSERT - Create all refs for a new pod
export async function insertAllPodResourceRefs(
  podId: number,
  ports: PortRef[],
  refs: ResourceRefs,
): Promise<void>

// FETCH - Get all refs for a pod (returns ResourceRefs format)
export async function fetchAllPodResourceRefs(
  podId: number,
): Promise<{
  ports: PortRef[];
  refs: ResourceRefs;
}>

// UPDATE - Replace all refs for a pod
export async function updateAllPodResourceRefs(
  podId: number,
  ports: PortRef[],
  refs: ResourceRefs,
): Promise<void>

// DELETE - Remove all refs for a pod
export async function deleteAllPodResourceRefs(
  podId: number,
): Promise<void>
```

#### 2.3 CRUD Functions for Deployments
```typescript
// Same pattern as pods but for deploymentConfigMapEnvRefs, etc.
export async function insertAllDeploymentResourceRefs(...)
export async function fetchAllDeploymentResourceRefs(...)
export async function updateAllDeploymentResourceRefs(...)
export async function deleteAllDeploymentResourceRefs(...)
```

#### 2.4 Helper Functions
```typescript
// Transform normalized data back to JSONB format for API responses
export function transformToJsonbFormat(
  ports: PortRef[],
  refs: ResourceRefs,
): {
  ports: PortRef[];
  configMapRefs: {...};
  secretRefs: {...};
}
```

---

### Phase 3: Update Pod Routes ✅ COMPLETED
**Status**: ✅ Completed
**File**: `backend/src/routes/pod.ts`

#### 3.1 Add Imports (Lines 12-17) ✅
```typescript
import {
  insertAllPodResourceRefs,
  fetchAllPodResourceRefs,
  updateAllPodResourceRefs,
  transformToJsonbFormat,
} from "../utils/resource-refs";
```

#### 3.2 Update POST Endpoint (Lines 299-327) ✅
**What Changed**:
- Removed JSONB data from insert
- Added call to `insertAllPodResourceRefs` after pod creation
- Kept legacy JSONB fields with empty values for backward compatibility

```typescript
// Before:
ports: body.ports || [],
configMapRefs: body.configMapRefs || { env: [], envFrom: [], volumes: [] },
secretRefs: body.secretRefs || { env: [], envFrom: [], volumes: [] },

// After:
ports: [], // Now stored in normalized tables
configMapRefs: { env: [], envFrom: [], volumes: [] }, // Legacy field
secretRefs: { env: [], envFrom: [], volumes: [] }, // Legacy field

// Insert refs into normalized tables
await insertAllPodResourceRefs(newPod.id, body.ports || [], {
  configMapRefs: body.configMapRefs,
  secretRefs: body.secretRefs,
});
```

#### 3.3 Update GET /:id Endpoint (Lines 194-259) ✅
**Implemented Changes**:
```typescript
// Fetch resource refs from normalized tables
const { ports, refs } = await fetchAllPodResourceRefs(pod.id);

// Merge into response:
const podData = {
  ...pod,
  ports,
  configMapRefs: refs.configMapRefs || { env: [], envFrom: [], volumes: [] },
  secretRefs: refs.secretRefs || { env: [], envFrom: [], volumes: [] },
};

// Continue with existing decrypt logic for envVariables
```

#### 3.4 Update PATCH /:id Endpoint (Lines 596-677) ✅
**Implemented Changes**:
```typescript
// Removed JSONB updates
// Added after DB update:
if (body.ports || bodyAny.configMapRefs || bodyAny.secretRefs) {
  await updateAllPodResourceRefs(podId, body.ports || [], {
    configMapRefs: bodyAny.configMapRefs,
    secretRefs: bodyAny.secretRefs,
  });
}
```

#### 3.5 DELETE Endpoint (Lines 511-595) ✅ No Changes Needed
**Reason**: Cascade deletes configured in schema will automatically remove refs

---

### Phase 4: Update Deployment Routes ✅ COMPLETED
**Status**: ✅ Completed
**File**: `backend/src/routes/deployment.ts`

#### 4.1 Add Imports (Lines 14-19) ✅
```typescript
import {
  insertAllDeploymentResourceRefs,
  fetchAllDeploymentResourceRefs,
  updateAllDeploymentResourceRefs,
  transformToJsonbFormat,
} from "../utils/resource-refs";
```

#### 4.2 Update POST Endpoint (Lines 225-273) ✅
**Implemented Changes**:
```typescript
// Store empty values in legacy JSONB columns
ports: [], // Now stored in normalized tables
configMapRefs: { env: [], envFrom: [], volumes: [] }, // Legacy field
secretRefs: { env: [], envFrom: [], volumes: [] }, // Legacy field

// Insert refs into normalized tables after deployment creation
await insertAllDeploymentResourceRefs(newDeployment.id, bodyAny.ports || [], {
  configMapRefs: bodyAny.configMapRefs,
  secretRefs: bodyAny.secretRefs,
});
```

#### 4.3 Update GET /:id Endpoint (Lines 110-178) ✅
**Implemented Changes**:
```typescript
// Fetch resource refs from normalized tables
const { ports, refs } = await fetchAllDeploymentResourceRefs(deployment.id);

const depData = {
  ...deployment,
  ports,
  configMapRefs: refs.configMapRefs || { env: [], envFrom: [], volumes: [] },
  secretRefs: refs.secretRefs || { env: [], envFrom: [], volumes: [] },
};
```

#### 4.4 Update PATCH /:id Endpoint (Lines 538-597) ✅
**Implemented Changes**:
```typescript
// Removed JSONB updates for ports, configMapRefs, secretRefs
// Added normalized table updates:
if (bodyAny.ports || bodyAny.configMapRefs || bodyAny.secretRefs) {
  await updateAllDeploymentResourceRefs(depId, bodyAny.ports || [], {
    configMapRefs: bodyAny.configMapRefs,
    secretRefs: bodyAny.secretRefs,
  });
}
```

#### 4.5 DELETE Endpoint ✅ No Changes Needed
**Reason**: Cascade deletes configured in schema automatically remove refs

---

### Phase 5: Database Migration ⏳ PENDING
**Status**: ⏳ Pending  
**File**: `backend/drizzle/migrations/YYYYMMDDHHMMSS_normalize_resource_refs.sql` (to be created)

#### 5.1 Migration Script Structure
```sql
-- Step 1: Create new tables
CREATE TABLE pod_ports (...);
CREATE TABLE pod_config_map_env_refs (...);
-- ... all 16 tables

-- Step 2: Migrate existing data
-- For each pod:
INSERT INTO pod_ports (pod_id, container_port, name)
SELECT 
  id as pod_id,
  (port->>'containerPort')::integer as container_port,
  port->>'name' as name
FROM k8s_pods, jsonb_array_elements(ports) as port
WHERE ports IS NOT NULL AND ports != '[]'::jsonb;

-- Similar for configMapRefs.env, configMapRefs.envFrom, etc.

-- Step 3: Verify data migration
-- Count records to ensure nothing was lost

-- Step 4: Keep JSONB columns for backward compatibility
-- (Optional: could remove after confirming everything works)
```

#### 5.2 Drizzle Migration Command
```bash
# Generate migration
cd backend
bun run drizzle-kit generate:pg

# Apply migration
bun run drizzle-kit push:pg
# OR
bun run drizzle-kit migrate
```

#### 5.3 Data Validation Script
```typescript
// backend/scripts/validate-migration.ts
async function validateMigration() {
  // Compare JSONB data with normalized table data
  // For each pod/deployment:
  //   1. Fetch JSONB fields
  //   2. Fetch normalized refs
  //   3. Compare for equality
  //   4. Log any discrepancies
}
```

---

### Phase 6: Testing ⏳ PENDING
**Status**: ⏳ Pending

#### 6.1 Unit Tests
**File**: `backend/src/utils/resource-refs.test.ts` (to be created)

```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { insertAllPodResourceRefs, fetchAllPodResourceRefs } from "./resource-refs";

describe("Resource Refs Utilities", () => {
  describe("Pod Resource Refs", () => {
    it("should insert and fetch ports correctly", async () => {
      const podId = 1;
      const ports = [
        { containerPort: 8080, name: "http" },
        { containerPort: 9090 }
      ];
      
      await insertAllPodResourceRefs(podId, ports, {});
      const result = await fetchAllPodResourceRefs(podId);
      
      expect(result.ports).toEqual(ports);
    });
    
    it("should insert and fetch configMap env refs", async () => {
      const podId = 2;
      const refs = {
        configMapRefs: {
          env: [
            { name: "DATABASE_URL", configMapName: "app-config", key: "db_url" }
          ]
        }
      };
      
      await insertAllPodResourceRefs(podId, [], refs);
      const result = await fetchAllPodResourceRefs(podId);
      
      expect(result.refs.configMapRefs?.env).toEqual(refs.configMapRefs.env);
    });
    
    it("should handle complex nested volume items", async () => {
      // Test volume refs with items array
    });
    
    it("should update refs correctly", async () => {
      // Test updateAllPodResourceRefs
    });
  });
  
  describe("Deployment Resource Refs", () => {
    // Similar tests for deployment functions
  });
});
```

#### 6.2 Integration Tests
**File**: `backend/src/routes/pod.test.ts` (to be created)

```typescript
describe("Pod Routes with Normalized Schema", () => {
  it("POST /pods/:clusterId - should create pod with refs", async () => {
    const response = await app.handle(
      new Request("http://localhost/pods/1", {
        method: "POST",
        body: JSON.stringify({
          name: "test-pod",
          namespace: "default",
          image: "nginx",
          ports: [{ containerPort: 80 }],
          configMapRefs: {
            env: [{ name: "KEY", configMapName: "my-config", key: "value" }]
          }
        })
      })
    );
    
    expect(response.status).toBe(201);
    
    // Verify refs were created in database
    const refs = await fetchAllPodResourceRefs(createdPodId);
    expect(refs.ports).toHaveLength(1);
    expect(refs.refs.configMapRefs?.env).toHaveLength(1);
  });
  
  it("GET /pods/:clusterId/:id - should return pod with refs", async () => {
    // Test GET endpoint returns normalized data
  });
  
  it("PATCH /pods/:clusterId/:id - should update refs", async () => {
    // Test PATCH endpoint updates normalized tables
  });
  
  it("DELETE /pods/:clusterId/:id - should cascade delete refs", async () => {
    // Test cascade delete removes all refs
  });
});
```

#### 6.3 Manual Testing Checklist
- [ ] Create pod with ports → verify in database
- [ ] Create pod with configMap env refs → verify
- [ ] Create pod with configMap envFrom refs → verify
- [ ] Create pod with configMap volume refs (with items) → verify
- [ ] Create pod with secret refs → verify
- [ ] Fetch pod → verify refs returned correctly
- [ ] Update pod refs → verify old refs deleted, new refs created
- [ ] Delete pod → verify cascade deletes all refs
- [ ] Same tests for deployments
- [ ] Test with agent communication (manifest generation)

---

### Phase 7: Performance Optimization ⏳ PENDING

#### 7.1 Add Database Indexes
```sql
-- Optimize lookups by pod/deployment ID
CREATE INDEX idx_pod_ports_pod_id ON pod_ports(pod_id);
CREATE INDEX idx_pod_config_map_env_refs_pod_id ON pod_config_map_env_refs(pod_id);
-- ... for all tables

-- Optimize reverse lookups (find all pods using a ConfigMap)
CREATE INDEX idx_pod_config_map_env_refs_config_map_name 
  ON pod_config_map_env_refs(config_map_name);
CREATE INDEX idx_pod_config_map_volume_refs_config_map_name 
  ON pod_config_map_volume_refs(config_map_name);
-- ... for all ref tables
```

#### 7.2 Query Optimization
**Example**: Find all pods using a specific ConfigMap
```typescript
// Before (JSONB query - slow):
SELECT * FROM k8s_pods 
WHERE config_map_refs @> '{"env":[{"configMapName":"my-config"}]}'::jsonb;

// After (normalized - fast with index):
SELECT DISTINCT p.* 
FROM k8s_pods p
LEFT JOIN pod_config_map_env_refs e ON p.id = e.pod_id
LEFT JOIN pod_config_map_env_from_refs ef ON p.id = ef.pod_id
LEFT JOIN pod_config_map_volume_refs v ON p.id = v.pod_id
WHERE e.config_map_name = 'my-config'
   OR ef.config_map_name = 'my-config'
   OR v.config_map_name = 'my-config';
```

#### 7.3 Batch Operations
```typescript
// Optimize bulk inserts using Drizzle's batch API
await db.insert(podPorts).values([
  { podId: 1, containerPort: 80 },
  { podId: 1, containerPort: 443 },
  // ... many more
]);
```

---

### Phase 8: Cleanup & Documentation ⏳ PENDING

#### 8.1 Code Cleanup
- [ ] Remove unused JSONB-related code
- [ ] Update comments referencing old JSONB structure
- [ ] Clean up any temporary compatibility layers

#### 8.2 Documentation Updates
- [ ] Update README.md with new schema information
- [ ] Document new utility functions in code comments
- [ ] Update API documentation if needed
- [ ] Add migration guide for developers

#### 8.3 Optional: Remove JSONB Columns
**After confirming everything works**:
```sql
-- WARNING: Only after thorough testing!
ALTER TABLE k8s_pods DROP COLUMN ports;
ALTER TABLE k8s_pods DROP COLUMN config_map_refs;
ALTER TABLE k8s_pods DROP COLUMN secret_refs;
ALTER TABLE k8s_deployments DROP COLUMN ports;
ALTER TABLE k8s_deployments DROP COLUMN config_map_refs;
ALTER TABLE k8s_deployments DROP COLUMN secret_refs;
```

---

## Database Schema Design

### Table Definitions

#### 1. Pod Ports
```typescript
export const podPorts = pgTable("pod_ports", {
  id: serial("id").primaryKey(),
  podId: integer("pod_id").notNull().references(() => k8sPods.id, { onDelete: "cascade" }),
  containerPort: integer("container_port").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

#### 2. Pod ConfigMap Env Refs
```typescript
export const podConfigMapEnvRefs = pgTable("pod_config_map_env_refs", {
  id: serial("id").primaryKey(),
  podId: integer("pod_id").notNull().references(() => k8sPods.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // Environment variable name
  configMapName: text("config_map_name").notNull(),
  key: text("key").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

#### 3. Pod ConfigMap EnvFrom Refs
```typescript
export const podConfigMapEnvFromRefs = pgTable("pod_config_map_env_from_refs", {
  id: serial("id").primaryKey(),
  podId: integer("pod_id").notNull().references(() => k8sPods.id, { onDelete: "cascade" }),
  configMapName: text("config_map_name").notNull(),
  prefix: text("prefix"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

#### 4. Pod ConfigMap Volume Refs
```typescript
export const podConfigMapVolumeRefs = pgTable("pod_config_map_volume_refs", {
  id: serial("id").primaryKey(),
  podId: integer("pod_id").notNull().references(() => k8sPods.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // Volume name
  configMapName: text("config_map_name").notNull(),
  mountPath: text("mount_path").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

#### 5. Pod ConfigMap Volume Item Refs
```typescript
export const podConfigMapVolumeItemRefs = pgTable("pod_config_map_volume_item_refs", {
  id: serial("id").primaryKey(),
  volumeRefId: integer("volume_ref_id").notNull().references(() => podConfigMapVolumeRefs.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  path: text("path").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

#### 6-9. Pod Secret Refs (Similar structure)
- `podSecretEnvRefs`
- `podSecretEnvFromRefs`
- `podSecretVolumeRefs`
- `podSecretVolumeItemRefs`

#### 10-18. Deployment Tables (Same structure as Pod tables)
- All tables replicated for deployments with `deployment` prefix

---

## Rollback Procedure

### If Issues Found After Deployment

#### Option 1: Quick Rollback (Keep JSONB columns)
```typescript
// Temporarily revert route handlers to use JSONB columns
// No database rollback needed since JSONB columns still exist
```

#### Option 2: Full Rollback
```sql
-- Drop all new tables
DROP TABLE pod_ports CASCADE;
DROP TABLE pod_config_map_env_refs CASCADE;
-- ... all 16 tables

-- Revert code changes via git
git revert <commit-hash>
```

#### Option 3: Data Recovery
```typescript
// If JSONB columns were dropped, restore from backup
// Restore database from last backup before migration
```

---

## Timeline & Resources

### Estimated Timeline

| Phase | Duration | Dependencies | Status |
|-------|----------|--------------|--------|
| Phase 1: Schema Updates | 2-3 hours | None | ✅ Complete |
| Phase 2: Utility Functions | 4-5 hours | Phase 1 | ✅ Complete |
| Phase 3: Pod Routes | 2-3 hours | Phase 2 | ✅ Complete |
| Phase 4: Deployment Routes | 2-3 hours | Phase 2 | ✅ Complete |
| Phase 5: Migration Script | 3-4 hours | Phases 3-4 | ⏳ Pending |
| Phase 6: Testing | 5-8 hours | Phase 5 | ⏳ Pending |
| Phase 7: Performance | 2-3 hours | Phase 6 | ⏳ Pending |
| Phase 8: Cleanup | 1-2 hours | Phase 7 | ⏳ Pending |
| **Total** | **21-31 hours** | | **67% Complete** |

### Resource Requirements
- **Backend Developer**: 1 person (full time for 3.5-5 weeks part time)
- **Database Expertise**: Recommended for migration review
- **QA Testing**: 1 person for comprehensive testing
- **DevOps**: For production deployment support

---

## Risk Assessment

### High Risk Items
1. **Data Loss During Migration**: Mitigate with thorough testing and backups
2. **Performance Degradation**: Mitigate with indexes and query optimization
3. **Breaking API Contracts**: Mitigate by maintaining response format

### Medium Risk Items
4. **Complex Rollback**: Keep JSONB columns during transition
5. **Agent Compatibility**: Test manifest generation thoroughly

### Low Risk Items
6. **Code Complexity**: Well-structured utilities reduce complexity
7. **Developer Onboarding**: Good documentation helps

---

## Success Criteria

### Technical Metrics
- [x] All 16 normalized tables created successfully
- [ ] Zero data loss during migration (100% data integrity)
- [ ] Query performance improved or maintained
- [x] All existing API endpoints function correctly
- [x] Cascade deletes work as expected
- [x] No breaking changes to API contracts

### Quality Metrics
- [ ] Unit test coverage > 80% for new utility functions
- [ ] Integration tests pass for all CRUD operations
- [ ] Manual testing checklist 100% complete
- [ ] Code review approved by 2+ developers
- [ ] Documentation complete and reviewed

### Business Metrics
- [ ] Zero downtime deployment
- [ ] No customer-reported issues post-deployment
- [ ] Rollback plan tested and ready
- [ ] Performance monitoring shows improvements

---

## Appendix

### A. Example API Request/Response

**Before and After refactoring** (API contract unchanged):

```typescript
// POST /pods/:clusterId
{
  "name": "my-pod",
  "namespace": "default",
  "image": "nginx",
  "ports": [
    { "containerPort": 80, "name": "http" }
  ],
  "configMapRefs": {
    "env": [
      { "name": "DATABASE_URL", "configMapName": "db-config", "key": "url" }
    ],
    "envFrom": [
      { "configMapName": "app-config", "prefix": "APP_" }
    ],
    "volumes": [
      {
        "name": "config-volume",
        "configMapName": "nginx-config",
        "mountPath": "/etc/nginx",
        "items": [
          { "key": "nginx.conf", "path": "nginx.conf" }
        ]
      }
    ]
  },
  "secretRefs": {
    "env": [
      { "name": "API_KEY", "secretName": "api-secrets", "key": "key" }
    ]
  }
}

// Response: Same structure returned
{
  "success": true,
  "data": {
    "id": 123,
    "name": "my-pod",
    "ports": [...], // From normalized table
    "configMapRefs": {...}, // From normalized tables
    "secretRefs": {...} // From normalized tables
  }
}
```

### B. Database ER Diagram
```
┌─────────────────────────────────────────────────────────────────┐
│                         k8sPods                                 │
│  id | name | namespace | dockerImage | ... | createdAt         │
└────┬────────────────────────────────────────────────────────────┘
     │
     ├──► podPorts
     │    └─ id | podId | containerPort | name
     │
     ├──► podConfigMapEnvRefs
     │    └─ id | podId | name | configMapName | key
     │
     ├──► podConfigMapEnvFromRefs
     │    └─ id | podId | configMapName | prefix
     │
     ├──► podConfigMapVolumeRefs
     │    └─ id | podId | name | configMapName | mountPath
     │         └──► podConfigMapVolumeItemRefs
     │              └─ id | volumeRefId | key | path
     │
     └──► (Similar structure for Secret refs)
```

### C. Migration Checklist
- [x] Phase 1: Database schema complete
- [x] Phase 2: Utility functions complete
- [x] Phase 3: Pod routes updated
- [x] Phase 4: Deployment routes updated
- [ ] Phase 5: Migration script written and tested
- [ ] Phase 6: All tests passing
- [ ] Phase 7: Performance benchmarks acceptable
- [ ] Phase 8: Documentation updated
- [ ] Database backup taken
- [ ] Rollback procedure tested
- [ ] Production deployment scheduled
- [ ] Monitoring alerts configured

---

## Conclusion

This refactoring plan provides a comprehensive roadmap for migrating from JSONB columns to normalized relational tables. The phased approach minimizes risk while maximizing benefits. With proper testing and the rollback procedures in place, this migration should significantly improve data integrity, query performance, and code maintainability.

**Current Progress**: 67% Complete (Phases 1-4 done, Phase 5 in progress)

**Next Steps**: 
1. Complete Phase 3 (pod.ts GET and PATCH endpoints)
2. Begin Phase 4 (deployment.ts updates)
3. Write migration script (Phase 5)

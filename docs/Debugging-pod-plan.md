# 🧠 AGENT DESIGN SPEC — DEBUG / EXEC / EVENTS (UPDATED PLAN: EPHEMERAL CONTAINERS)

# =========================================
# 0. CORE PRINCIPLES (MUST FOLLOW)
# =========================================

* Agent is the ONLY component talking to Kubernetes API.
* Backend NEVER executes K8s operations directly.
* All mutations are triggered via agentCommands.
* Agent must be stateless except for in-memory caches.
* Streaming (exec/debug) is NOT part of Heartbeat. Handled as a separate real-time channel (`StreamData` over WebSocket).

# =========================================
# 1. FEATURE MODEL OVERVIEW
# =========================================

There are 3 interaction types:

1. **OBSERVE (read-only)**
   * Pods, Deployments (synced automatically via Heartbeat and stored in Postgres)
   * Events (fetched dynamically via `GET_ALL_EVENTS` command and REST endpoint `/api/clusters/:id/events`)
2. **MUTATE (via agentCommands)**
   * Create Ephemeral Container (requires new `CREATE_EPHEMERAL_CONTAINER` command in agent).
3. **STREAM (real-time session)**
   * Exec into container (uses the existing `EXEC` command and WebSocket binary `StreamData` relay from Backend)
   * We will Exec directly into the newly created ephemeral container.

# =========================================
# 2. DEBUG POD — DESIGN PRINCIPLES (NATIVE EPHEMERAL CONTAINERS)
# =========================================

**Definition**:
* Native `kubectl debug` functionality.
* Injects a temporary container *directly into a running Pod*.
* Shares the same Network, IPC, and Namespace boundaries as the original failing container.

**Rules**:
* Relies on the K8s API's `ephemeralContainers` subresource (requires K8s 1.25+ or feature gate enabled).
* We will inject an ephemeral container definition:
  * Image: user-selected (e.g. `nicolaka/netshoot`, or `busybox`).
  * `stdin: true` and `tty: true`.
  * `targetContainerName` optionally supplied to maximize namespace sharing.

**Lifecycle**:
1. User requests debug session → Backend issues `CREATE_EPHEMERAL_CONTAINER` command.
2. Agent executes K8s Patch on the Pod's `ephemeralcontainers` subresource.
3. Pulse/State update → Ephemeral container becomes "Running".
4. Frontend automatically pops open the "Exec Shell" into the Ephemeral Container name.

# =========================================
# 3. EXEC / ATTACH — DESIGN PRINCIPLES
# =========================================

* Uses the existing `Command_EXEC` implemented in `agent/stream.go`.
* Provides real-time stream relay to/from `xterm.js` via Backend WebSockets.
* Ephemeral containers are interacted with identically to standard containers using `client-go` remotecommand.

# =========================================
# 4. EVENTS — DESIGN PRINCIPLES
# =========================================

* Events are fetched on-demand via the `GET_ALL_EVENTS` command in the Agent.
* Frontend interacts with standard REST (`GET /api/cluster/:id/events`), while Backend handles retrieving from the agent.

# =========================================
# 5. IMPLEMENTATION PLAN & PHASES
# =========================================

## Phase 1: Protobuf & Agent Capabilities
1. Update `websocket.proto` to include `CREATE_EPHEMERAL_CONTAINER` in `Command.CommandType`. Run protoc/buf generator.
2. Implement `CreateEphemeralContainer` inside `agent/service/k8s/resources.go`. It must fetch the Pod, construct the `EphemeralContainer` spec, and Update the Pod's `ephemeralcontainers` subresource.
3. Map the command in `agent/command.go`.

## Phase 2: Backend Orchestration API
1. Add `POST /api/clusters/:id/pods/:podId/ephemeral-containers` in `backend/src/routes/pod.ts`.
2. This API accepts container targets (image, name), generates the command payload, and dispatches it via WebSockets to the agent.

## Phase 3: Frontend Manifestation (Debug Interface)
1. Add "Debug (Ephemeral Container)" to Pod Action menu.
2. Build `DebugPodConfigModal.tsx` asking for Target image (default `netshoot`).
3. Form submission calls backend and polls for completion.

## Phase 4: Exec Terminal UI
1. Add an "Exec Shell" action for any Running Pod container.
2. Build an `ExecTerminalModal.tsx` using `xterm.js`.
3. Support connecting directly to the ephemeral container. When an ephemeral container starts, standard exec stream routes logic seamlessly handles it.

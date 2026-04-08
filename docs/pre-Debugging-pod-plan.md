# 🧠 AGENT DESIGN SPEC — DEBUG / EXEC / EVENTS (ABSTRACT PLAN)

# =========================================

# 0. CORE PRINCIPLES (MUST FOLLOW)

# =========================================

* Agent is the ONLY component talking to Kubernetes API

* Backend NEVER executes K8s operations directly

* All mutations are triggered via agentCommands

* All state must flow back through Heartbeat

* Agent must be stateless except for in-memory caches (informers)

* Streaming (exec/debug) is NOT part of Heartbeat
  → handled as separate real-time channel

* All features must:

  1. Accept command
  2. Execute against K8s
  3. Return status (success/failure)
  4. Reflect state in next Heartbeat

# =========================================

# 1. FEATURE MODEL OVERVIEW

# =========================================

There are 3 interaction types:

1. OBSERVE (read-only, via Heartbeat)

   * Pods, Deployments, Events

2. MUTATE (via agentCommands)

   * Create Debug Pod
   * Delete Debug Pod

3. STREAM (real-time session)

   * Exec into container
   * Attach to debug pod

# =========================================

# 2. DEBUG POD — DESIGN PRINCIPLES

# =========================================

Definition:

* A temporary Pod created for debugging purposes
* Not managed by controllers (standalone)
* Has interactive shell (stdin + tty)

Source types:

* Pod
* Deployment (via PodTemplate)

---

Behavior Rules:

* MUST NOT modify original Pod/Deployment

* MUST create a NEW Pod

* MUST:

  * override container command → shell (sh/bash)
  * enable stdin + tty
  * disable probes (liveness/readiness/startup)
  * set restartPolicy = Never

* SHOULD:

  * reuse original container image (fallback)
  * allow debug image override

* MUST label resource:

  * debug-session = true
  * source reference (pod/deployment name)

---

Lifecycle:

1. Create → Pending
2. Running → attach allowed
3. Terminated → cleanup allowed

---

Failure Handling:

* If source not found → fail command
* If container not found → fail command
* If image invalid → surface error
* If pod cannot start → rely on Events

# =========================================

# 3. EXEC / ATTACH — DESIGN PRINCIPLES

# =========================================

Definition:

* Open interactive terminal into a container

Types:

* Exec into existing container
* Attach to debug pod container

---

Behavior Rules:

* MUST use Kubernetes exec API (not kubectl)

* MUST support:

  * stdin
  * stdout
  * stderr
  * tty

* MUST be real-time streaming

* MUST NOT go through Heartbeat

---

Session Model:

* One command → one session
* Session is ephemeral (not persisted in agent)
* Backend manages session lifecycle

---

Failure Cases:

* Pod not running → reject
* Container not found → reject
* Exec not allowed (security) → surface error

# =========================================

# 4. EVENTS — DESIGN PRINCIPLES

# =========================================

Definition:

* Cluster-generated records describing state changes and failures

---

Collection Strategy:

* MUST use informer (NOT polling)
* MUST maintain in-memory cache

---

Filtering Rules:

* MUST filter by relevant resources:

  * Pod
  * Deployment
  * Node

* SHOULD ignore noisy/unrelated events

---

Data Semantics:

* Events are NOT unique logs
* They are aggregated with:

  * count
  * firstTimestamp
  * lastTimestamp

---

Heartbeat Behavior:

* Events included in every Heartbeat
* MUST represent latest known state (not append-only)

---

Retention:

* Agent may keep full cache in memory
* Backend responsible for TTL cleanup

# =========================================

# 5. HEARTBEAT INTEGRATION

# =========================================

Heartbeat MUST include:

* Current Events snapshot
* Debug pods appear as normal pods (via labels)

---

Rules:

* Heartbeat is SOURCE OF TRUTH
* No partial updates
* Always full state snapshot

---

Implication:

* Debug pods DO NOT need separate tracking
* Identified via labels in normal Pod list

# =========================================

# 6. RESOURCE IDENTIFICATION MODEL

# =========================================

Every resource must be identifiable by:

* UID (primary identity)
* Name + Namespace (human reference)

---

For Debug:

* MUST include label:

  * debug-session = true

* SHOULD include:

  * source-pod OR source-deployment

---

For Events:

* MUST include:

  * involvedObject UID
  * involvedObject Name
  * involvedObject Kind

# =========================================

# 7. PERFORMANCE & SAFETY

# =========================================

Events:

* MUST avoid unbounded growth
* SHOULD filter early (agent-side)

Debug Pods:

* SHOULD support cleanup strategy
* SHOULD avoid resource-heavy configs

Exec:

* MUST handle disconnects gracefully
* MUST not block agent main loop

# =========================================

# 8. ERROR HANDLING MODEL

# =========================================

All command executions must:

1. Validate input
2. Attempt execution
3. Return structured result:

   * success
   * error message
   * optional metadata

---

Errors must NOT crash agent

---

# =========================================

# 9. EXTENSIBILITY

# =========================================

Design must allow:

* future support for:

  * Ephemeral containers
  * Node debugging
  * Network debugging pods

---

Avoid hardcoding logic:

* Use generic "source → debug pod" transformation model

# =========================================

# 10. MENTAL MODEL (FOR AGENT)

# =========================================

Think in flows:

USER ACTION
↓
BACKEND → agentCommand
↓
AGENT executes against K8s
↓
STATE changes in cluster
↓
AGENT observes via informer
↓
HEARTBEAT updates backend
↓
FRONTEND updates UI

---

Streaming (exec/debug) bypasses Heartbeat:
USER → backend → agent → stream → frontend

# =========================================

# END

# =========================================

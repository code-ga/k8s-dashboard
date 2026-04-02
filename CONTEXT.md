Project Blueprint: Cloud-Native K3s Platform (MVP)
1. Project Overview
A multi-cluster PaaS interface allowing users to deploy applications (via Docker Compose), Virtual Machines, and Game Servers (Minecraft) to K3s clusters. The platform features "Cloud Run" (scale-to-zero) behavior and centralized management.

2. Technology Stack
Frontend: React, TanStack Router, Vite, Xterm.js (Web Terminal), Monaco Editor.

Control Plane: TypeScript Backend (Centralized Logic).

Edge Agent: GoLang (Runs inside each K3s cluster, communicates via WebSocket).

Cluster Core: K3s (Lightweight Kubernetes).

3. Architecture & Key Decisions
A. Networking & Ingress
Ingress Controller: Traefik (Pinned to nodes with Public IPs).

Scale-to-Zero: Sablier.

Mechanism: Traefik Middleware pauses requests -> Sablier scales Deployment to 1 -> Request proceeds.

SSH Access: SSH Piper.

Strategy: Single Public Port (22/2222).

Routing: Routes based on username (e.g., ssh user-project@node.com) to internal Pod IP.

Internal Communication: Native K8s Services within a Namespace (mimics Docker Compose networking).

B. Multi-Tenancy (No vCluster)
Isolation: Namespace-as-a-Service.

Security: Agent enforces NetworkPolicy (Deny All Ingress/Egress by default, Allow only Traefik & Shared Services).

Storage Strategy:

S3: GarageHQ (Shared Cluster, Agent creates logical Buckets).

Database: CloudNativePG (Shared Cluster, Agent creates logical DBs + Users).

C. The "Self-Driving" Agent
The Go Agent is responsible for bootstrapping the cluster state using K3s HelmChart CRDs:

Auto-Deploy Infra: On startup, checks for/installs GarageHQ and CloudNativePG.

Deployment Logic: Parses user docker-compose.yml -> Converts to K8s Manifests (using kompose logic) -> Injects ENV vars for Shared DB/S3 -> Applies to Namespace.

4. Implementation Plan (4-Week MVP)
Week 1: Skeleton & Infra

Build WebSocket Tunnel (Agent <-> Backend).

Implement "Bootstrap" logic: Agent applies HelmChart manifests for Garage & CNPG.

Week 2: Deployment Pipeline

Implement Kompose conversion in Go.

Inject Sidecars/Env Vars for database connections.

Implement Traefik Ingress + Sablier Middleware generation.

Week 3: Interactive Features

Real-time Logs (Stream via WS).

SSH Piper setup & "Piper Script" for pod resolution.

Week 4: Frontend & UI

Dashboard for Projects.

Xterm.js integration.

5. Next Immediate Task
Write the Go function (ApplyManifest) in the Agent that uses client-go (dynamic client) to apply the HelmChart YAMLs for GarageHQ and CloudNativePG, effectively bootstrapping the cluster infrastructure.
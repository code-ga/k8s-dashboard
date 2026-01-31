# 🚀 K3s Cloud-Native PaaS Dashboard

A modern, "Cloud Run on Bare Metal" Platform-as-a-Service (PaaS) interface built on top of K3s. This project provides a developer-friendly experience for deploying applications with automatic scaling, isolation, and infrastructure provisioning.

---

## ✨ Features (Current)

- **🖥️ Multi-Cluster Dashboard**: Manage multiple K3s clusters from a single interface.
- **📊 Real-time Resource Sync**: Automated synchronization of Pods, Services, and Nodes via Go Agent heartbeats.
- **📺 Interactive Terminal**: Integrated `xterm.js` for direct WebSocket-based terminal access to Pods.
- **� Live Log Streaming**: Real-time log multiplexing for deployments and individual pods.
- **⚡ Batch Command System**: Reliable command execution tracking (Pending/Sent/Success/Failed) with WebSocket acknowledgments.
- **🎨 Modern UI/UX**: Premium dashboard built with React 19, featuring Monaco Editor and fluid animations.

## 🗺️ Roadmap (Upcoming Features)

- **�🛡️ Virtual Cluster Isolation**: Native namespace isolation with pre-configured `NetworkPolicies` and `RoleBindings`.
- **📉 Scale-to-Zero**: Integration with Sablier and Traefik for automatic scaling based on request traffic.
- **📦 Compose-to-K8s**: Native support for `docker-compose.yml` conversion via Kompose.
- **🏗️ Auto-Provisioning**: Automated infrastructure bootstrapping (GarageHQ S3 & CloudNativePG) via K3s Helm Controller.
- **🔐 Secure Access**: Built-in SSH access to pods via SSH Piper integration.

## 🏗️ Architecture

The project consists of three main components:

| Component | Stack | Role |
| :--- | :--- | :--- |
| **Frontend** | React + TanStack Router + Vite | Dashboard UI, Monaco Editor, Xterm.js |
| **Control Plane** | TypeScript + Bun + Elysia | Centralized Backend, Auth (Better Auth), Orchestration |
| **Cluster Agent** | GoLang | Runs in K3s clusters, WebSocket tunnel, K8s CRUD |

## 🛠️ Tech Stack

### Core
- **Database**: PostgreSQL (via Drizzle ORM)
- **Networking**: Traefik (Ingress), Sablier (Scale-to-zero)
- **Object Store**: GarageHQ (S3-compatible)
- **Communication**: Protobuf over WebSockets

### Frontend
- React 19, TanStack Router & Query, Tailwind CSS, Shadcn UI, Biome.

### Backend
- Bun, Elysia, Drizzle ORM, Better Auth.

### Agent
- Go, Kubernetes `client-go`, Protobuf.

---

## 🚀 Getting Started

### Prerequisites
- [Bun](https://bun.sh/) installed.
- [Go](https://golang.org/) installed (for the agent).
- A running [K3s](https://k3s.io/) cluster (for the agent).

### 1. Setup Backend
```bash
cd backend
bun install
cp .env.example .env # Configure your DB and Auth providers
bun run db:push
bun run dev
```

### 2. Setup Frontend
```bash
cd frontend
bun install
bun run dev
```

### 3. Setup Agent
Build and run the agent inside your K3s cluster nodes:
```bash
cd agent
go build -o agent .
./agent --addr <BACKEND_URL> --token <CLUSTER_TOKEN>
```

---

## 🧠 Key Technical Logic

### 1. The "Self-Driving" Bootstrap
The Go Agent uses the K3s Helm Controller (`HelmChart` CRD) to automatically install infrastructure components like GarageHQ and CloudNativePG if they are missing from the cluster.

### 2. Networking Strategy
Applications are isolated by default. The agent enforces `NetworkPolicies` that deny all ingress/egress except from the Traefik ingress controller and to the shared database/S3 services.

### 3. Pipeline Injection
When a user deploys via `docker-compose.yml`, the agent parses it and automatically injects `DATABASE_URL` and `S3_BUCKET` environment variables into the containers based on the auto-provisioned resources.

---

## 📝 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

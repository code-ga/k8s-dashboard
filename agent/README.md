# Agent Usage Guide

This document provides instructions for running and installing the agent in different modes, including auto-restart for development, normal running, and installation options with or without auto-update.

---

## 1. Configuration

The agent requires two configuration parameters: `addr` (backend server address) and `token` (authentication token). These can be set via:

1. **CLI flags** (highest priority)
   ```sh
   ./agent --addr "my-backend.example.com:3001" --token "secret-token"
   ```

2. **Config file** (YAML or JSON, auto-discovered)
   - Looks for `agent.yaml` or `agent.json` in the current directory
   - Or specify explicitly with `--config /path/to/config.yaml`

   Example `agent.yaml`:
   ```yaml
   addr: "my-backend.example.com:3001"
   token: "secret-token"
   skip_update: false
   ```

   Example `agent.json`:
   ```json
   {
     "addr": "my-backend.example.com:3001",
     "token": "secret-token",
     "skip_update": false
   }
   ```

3. **Environment variables** (lowest priority)
   ```sh
   export AGENT_ADDR="my-backend.example.com:3001"
   export AGENT_TOKEN="secret-token"
   export AGENT_SKIP_UPDATE="false"  # accepts: true/1/yes
   ./agent
   ```

**Priority order:** CLI flags → config file → environment variables

---

## 2. Running the Agent

### a. Normal Run (Production/Manual)

To run the agent normally (without auto-restart):

```sh
go run main.go
```
Or, if you have built the binary:
```sh
./agent
```

**With config file:**
```sh
./agent --config /etc/k8s-agent/config.yaml
```

**With environment variables:**
```sh
AGENT_ADDR="my-backend.example.com:3001" AGENT_TOKEN="secret-token" ./agent
```

### b. Auto-Restart (Development/Test)

For development or testing, you may want the agent to automatically restart on crash or file changes. You can use [air](https://github.com/cosmtrek/air) or [reflex](https://github.com/cespare/reflex):

#### Using `air` (recommended):
1. Install air:
   ```sh
   go install github.com/cosmtrek/air@latest
   ```
2. Run with auto-reload:
   ```sh
   air
   ```

#### Using `reflex`:
1. Install reflex:
   ```sh
   go install github.com/cespare/reflex@latest
   ```
2. Run with auto-reload:
   ```sh
   reflex -r '\.go$' -- sh -c 'go run main.go'
   ```

---

## 3. Systemd Service Installation

The agent can automatically install itself as a systemd service for auto-restart and persistent running.

### Installing as a Service

Run with `--install-service` flag (requires root):

```sh
sudo ./agent --install-service --config /etc/k8s-agent/config.yaml
```

This will:
1. Create `/etc/systemd/system/k8s-agent.service`
2. Enable the service to start on boot
3. Configure auto-restart on failure

To also start the service immediately:
```sh
sudo ./agent --install-service --config /etc/k8s-agent/config.yaml --start-service
```

**Check service status:**
```sh
systemctl status k8s-agent
```

**View logs:**
```sh
journalctl -u k8s-agent -f
```

**Manage the service:**
```sh
systemctl start k8s-agent      # Start
systemctl stop k8s-agent       # Stop
systemctl restart k8s-agent    # Restart
systemctl disable k8s-agent    # Remove from auto-start
```

---

## 4. Installation Options

### a. With Auto-Update

The agent supports auto-update via the built-in updater. To enable auto-update, run the agent with the default settings. The updater will periodically check for new versions and update the binary automatically.

- **Default behavior:**
  ```sh
  ./agent
  ```
- To configure update intervals or sources, edit the relevant configuration (see code or contact maintainer).

### b. Without Auto-Update

To disable auto-update, use the `--skip-update` flag:

```sh
./agent --skip-update
```

Or set via environment variable:
```sh
export AGENT_SKIP_UPDATE=true
./agent
```

Or in config file:
```yaml
skip_update: true
```

---

## 5. Building the Agent

To build the agent binary:

```sh
go build -o agent main.go
```

---

## 6. Additional Information

- **Dependencies:** Ensure you have Go installed (version 1.18+ recommended).
- **Configuration:** Check environment variables or configuration files for advanced options.
- **Logs:** Output is printed to stdout/stderr. Use systemd or a process manager for production.
- **Auto-Restart in Production:** For production, use a process manager like `systemd`, `supervisord`, or `pm2` for auto-restart and monitoring.

---

## 7. Manual systemd Service Setup (Legacy)

If you prefer to set up the systemd service manually instead of using `--install-service`, you can create the configuration files directly.

Create a file `/etc/systemd/system/k8s-agent.service`:

```
[Unit]
Description=Agent Service
After=network.target

[Service]
ExecStart=/path/to/agent --config /etc/k8s-agent/config.yaml --skip-update
Restart=always

[Install]
WantedBy=multi-user.target
```

Create the config file `/etc/k8s-agent/config.yaml`:
```yaml
addr: "my-backend.example.com:3001"
token: "secret-token"
skip_update: false
```

Then enable and start the service:
```sh
sudo systemctl daemon-reload
sudo systemctl enable agent
sudo systemctl start agent
```

**Alternative with environment variables:**
```
[Unit]
Description=Agent Service
After=network.target

[Service]
Environment="AGENT_ADDR=my-backend.example.com:3001"
Environment="AGENT_TOKEN=secret-token"
ExecStart=/path/to/agent --skip-update
Restart=always

[Install]
WantedBy=multi-user.target
```

---

For more details, see the source code or contact the project maintainer.

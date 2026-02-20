# Agent Usage Guide

This document provides instructions for running and installing the agent in different modes, including auto-restart for development, normal running, and installation options with or without auto-update.

---

## 1. Running the Agent

### a. Normal Run (Production/Manual)

To run the agent normally (without auto-restart):

```sh
go run main.go
```
Or, if you have built the binary:
```sh
./agent
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

## 2. Installation Options

### a. With Auto-Update

The agent supports auto-update via the built-in updater. To enable auto-update, run the agent with the default settings. The updater will periodically check for new versions and update the binary automatically.

- **Default behavior:**
  ```sh
  ./agent
  ```
- To configure update intervals or sources, edit the relevant configuration (see code or contact maintainer).

### b. Without Auto-Update


To disable auto-update, use the `--skip-update` flag when running the agent:

```sh
./agent --skip-update
```

There is currently no environment variable to disable auto-update. Only the command-line flag is supported.

---

## 3. Building the Agent

To build the agent binary:

```sh
go build -o agent main.go
```

---

## 4. Additional Information

- **Dependencies:** Ensure you have Go installed (version 1.18+ recommended).
- **Configuration:** Check environment variables or configuration files for advanced options.
- **Logs:** Output is printed to stdout/stderr. Use systemd or a process manager for production.
- **Auto-Restart in Production:** For production, use a process manager like `systemd`, `supervisord`, or `pm2` for auto-restart and monitoring.

---

## 5. Example: systemd Service (Linux)

Create a file `/etc/systemd/system/agent.service`:

```
[Unit]
Description=Agent Service
After=network.target

[Service]

ExecStart=/path/to/agent --skip-update
Restart=always

[Install]
WantedBy=multi-user.target
```

Then run:
```sh
sudo systemctl daemon-reload
sudo systemctl enable agent
sudo systemctl start agent
```

---

For more details, see the source code or contact the project maintainer.

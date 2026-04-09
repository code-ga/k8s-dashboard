package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
)

// isRoot checks if the process is running as root (UID 0).
func isRoot() bool {
	return os.Geteuid() == 0
}

// installSystemdService creates and enables a systemd service file for the agent.
func installSystemdService() error {
	if !isRoot() {
		return fmt.Errorf("installing systemd service requires root privileges")
	}

	// Get the absolute path to the current binary.
	executable, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}

	// Build the ExecStart command.
	execStart := executable
	if *configFile != "" {
		execStart += fmt.Sprintf(" --config %s", *configFile)
	}

	workingDir, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("failed to get working directory: %w", err)
	}

	// Create the systemd service file content.
	serviceContent := fmt.Sprintf(`[Unit]
Description=K8s Dashboard Agent
Documentation=https://github.com/code-ga/k8s-dashboard
After=network.target

[Service]
Type=simple
ExecStart=%s
Restart=always
RestartSec=30
StandardOutput=journal
StandardError=journal
SyslogIdentifier=k8s-agent
WorkingDirectory=%s

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
`, execStart, workingDir)

	// Ensure the systemd directory exists.
	serviceDir := "/etc/systemd/system"
	if err := os.MkdirAll(serviceDir, 0755); err != nil {
		return fmt.Errorf("failed to create systemd directory: %w", err)
	}

	// Write the service file.
	servicePath := filepath.Join(serviceDir, "k8s-agent.service")
	if err := os.WriteFile(servicePath, []byte(serviceContent), 0644); err != nil {
		return fmt.Errorf("failed to write service file to %s: %w", servicePath, err)
	}
	log.Printf("Service file created at %s", servicePath)

	// Reload systemd daemon.
	cmd := exec.Command("systemctl", "daemon-reload")
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("systemctl daemon-reload failed: %w\n%s", err, string(out))
	}
	log.Println("Systemd daemon reloaded")

	// Enable the service.
	cmd = exec.Command("systemctl", "enable", "k8s-agent.service")
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("systemctl enable failed: %w\n%s", err, string(out))
	}
	log.Println("Service enabled")

	// Optionally start the service.
	if *startService {
		cmd = exec.Command("systemctl", "start", "k8s-agent.service")
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("systemctl start failed: %w\n%s", err, string(out))
		}
		log.Println("Service started")
	}

	return nil
}

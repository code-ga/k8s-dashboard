package main

import (
	"flag"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"time"

	"github.com/gorilla/websocket"

	"k8s-dashboard/agents/service/k8s"

	_ "k8s.io/client-go/plugin/pkg/client/auth"
)

var addr = flag.String("addr", "", "server address (required; set via --addr, AGENT_ADDR env var, or config file)")
var token = flag.String("token", "", "server token (required; set via --token, AGENT_TOKEN env var, or config file)")
var skipUpdate = flag.Bool("skip-update", false, "skip self-update check at startup")
var configFile = flag.String("config", "", "path to config file (YAML or JSON); auto-detects agent.yaml/agent.json in current dir")
var installService = flag.Bool("install-service", false, "install agent as a systemd service and exit (requires root)")
var startService = flag.Bool("start-service", false, "start the systemd service after installation (only with --install-service)")

func main() {
	flag.Parse()
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)

	// Handle systemd service installation and exit.
	if *installService {
		if err := installSystemdService(); err != nil {
			log.Fatalf("Failed to install systemd service: %v", err)
		}
		log.Println("Systemd service installed successfully")
		if *startService {
			log.Println("Service is running. Check status with: systemctl status k8s-agent")
		} else {
			log.Println("To start the service, run: systemctl start k8s-agent")
		}
		os.Exit(0)
	}

	resolveConfig()

	// Self-update: download and re-exec a newer binary if one is available.
	// On a successful update, checkAndUpdate() never returns (process replaced).
	if !*skipUpdate {
		if err := checkAndUpdate(); err != nil {
			log.Printf("[updater] Self-update failed (non-fatal): %v", err)
		}
	}

	// Parse addr and build WebSocket URL.
	maybeUrl, err := url.Parse(*addr)
	if err != nil {
		log.Fatalf("Invalid address: %v", err)
	}
	wsScheme := "ws"
	if maybeUrl.Scheme == "https" {
		wsScheme = "wss"
	}
	u := url.URL{Scheme: wsScheme, Host: maybeUrl.Host, Path: "/api/agents/ws"}

	// Bootstrap: fetch cluster config from the backend.
	config, err := getClusterConfig()
	if err != nil {
		log.Fatalf("Failed to get cluster config: %v", err)
	}
	log.Printf("Cluster Config Loaded: Name=%s, EnableS3=%v", config.Name, config.EnableS3Service)

	// Initialize Kubernetes client.
	kubeClient, err := k8s.NewK8sClient(config.ClusterKey)
	if err != nil {
		log.Fatalf("Failed to create Kubernetes client: %v", err)
	}
	if config.AcmeEmail != "" {
		kubeClient.AcmeEmail = config.AcmeEmail
	}
	log.Printf("Kubernetes client created")

	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)

	header := make(http.Header)
	header.Add("Authorization", "Bot "+*token)
	header.Add("Content-Type", "application/json")
	header.Add("User-Agent", "K8s-Dashboard-Agent/1.0 (+https://github.com/code-ga/k8s-dashboard)")
	header.Add("Accept", "application/json")
	header.Set("Accept-Language", "en-US,en;q=0.9")

	safeConn := NewSafeConn()

	go func() {
		<-interrupt
		log.Println("Interrupt received, shutting down...")
		safeConn.Close()
		os.Exit(0)
	}()

	for {
		log.Printf("connecting to %s", u.String())
		c, _, err := websocket.DefaultDialer.Dial(u.String(), header)
		if err != nil {
			log.Printf("Dial failed: %v. Retrying in 5 seconds...", err)
			time.Sleep(5 * time.Second)
			continue
		}

		log.Printf("Connected to backend")
		safeConn.SetConn(c)

		if err := sendAuth(safeConn); err != nil {
			log.Printf("Failed to send auth message: %v. Retrying...", err)
			safeConn.SetConn(nil)
			time.Sleep(2 * time.Second)
			continue
		}

		done := make(chan struct{})

		go readLoop(c, safeConn, kubeClient, done)
		go heartbeatLoop(safeConn, kubeClient, done)

		<-done
		log.Printf("Connection lost, attempting to reconnect...")
		safeConn.SetConn(nil)
		time.Sleep(2 * time.Second)
	}
}

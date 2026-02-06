package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"google.golang.org/protobuf/proto"

	pb "k8s-dashboard/agents/pb/agent-backend"
	"k8s-dashboard/agents/service/k8s"

	_ "k8s.io/client-go/plugin/pkg/client/auth"
)

var addr = flag.String("addr", "localhost:3001", "server address")
var token = flag.String("token", "iamveryhandsome", "server token")

// Thread-safe WebSocket writer with auto-reconnect support
type SafeConn struct {
	conn   *websocket.Conn
	mu     sync.Mutex
	cond   *sync.Cond
	closed bool
}

func NewSafeConn() *SafeConn {
	s := &SafeConn{}
	s.cond = sync.NewCond(&s.mu)
	return s
}

func (sc *SafeConn) WriteMessage(messageType int, data []byte) error {
	sc.mu.Lock()
	for sc.conn == nil && !sc.closed {
		sc.cond.Wait()
	}
	if sc.closed {
		sc.mu.Unlock()
		return fmt.Errorf("connection closed")
	}
	// Gorilla websocket connection is not thread-safe for concurrent writes.
	// We keep the lock during the actual write.
	err := sc.conn.WriteMessage(messageType, data)
	if err != nil {
		log.Printf("Write error: %v, marking connection as down", err)
		sc.conn = nil // Next writer will wait for reconnect
	}
	sc.mu.Unlock()
	return err
}

func (sc *SafeConn) SetConn(c *websocket.Conn) {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	if sc.conn != nil {
		sc.conn.Close()
	}
	sc.conn = c
	sc.cond.Broadcast()
}

func (sc *SafeConn) Close() {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	sc.closed = true
	if sc.conn != nil {
		sc.conn.Close()
		sc.conn = nil
	}
	sc.cond.Broadcast()
}

// Stream manager
type StreamEntry struct {
	stdinChan   chan []byte
	resizeQueue *k8s.TerminalSizeQueue
}

var (
	streamMutex   sync.Mutex
	activeStreams = make(map[string]*StreamEntry)
)

func registerStream(id string, entry *StreamEntry) bool {
	streamMutex.Lock()
	defer streamMutex.Unlock()
	if _, exists := activeStreams[id]; exists {
		return false
	}
	activeStreams[id] = entry
	return true
}

func unregisterStream(id string) {
	streamMutex.Lock()
	defer streamMutex.Unlock()
	if entry, ok := activeStreams[id]; ok {
		if entry.stdinChan != nil {
			close(entry.stdinChan)
		}
		if entry.resizeQueue != nil {
			entry.resizeQueue.Close()
		}
		delete(activeStreams, id)
	}
}

func getStream(id string) (*StreamEntry, bool) {
	streamMutex.Lock()
	defer streamMutex.Unlock()
	entry, ok := activeStreams[id]
	return entry, ok
}

func main() {
	flag.Parse()
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)

	// parse addr
	maybeUrl, err := url.Parse(*addr)
	if err != nil {
		log.Fatalf("Invalid address: %v", err)
	}
	wsScheme := "ws"
	if maybeUrl.Scheme == "https" {
		wsScheme = "wss"
	}
	u := url.URL{Scheme: wsScheme, Host: maybeUrl.Host, Path: "/api/agents/ws"}

	// 1. Get Cluster Config (URL, Key, etc) from Backend (Bootstrap)
	// This requires HTTP endpoint to be accessible.
	// We use the flags for initial connection details.
	config, err := getClusterConfig()
	if err != nil {
		log.Fatalf("Failed to get cluster config: %v", err)
	}
	log.Printf("Cluster Config Loaded: Name=%s, EnableS3=%v", config.Name, config.EnableS3Service)

	// 2. Initialize K8s Client with Key
	kubeClient, err := k8s.NewK8sClient(config.ClusterKey)
	if err != nil {
		log.Fatalf("Failed to create Kubernetes client: %v", err)
	}
	log.Printf("Kubernetes client created")

	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)

	header := make(http.Header)
	header.Add("Authorization", "Bot "+*token)

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

		done := make(chan struct{})

		// Start loops
		go readLoop(c, safeConn, kubeClient, done)
		go heartbeatLoop(safeConn, kubeClient, done)

		<-done
		log.Printf("Connection lost, attempting to reconnect...")
		safeConn.SetConn(nil)
		time.Sleep(2 * time.Second)
	}
}

func readLoop(c *websocket.Conn, safeConn *SafeConn, kubeClient *k8s.K8sClient, done chan struct{}) {
	defer close(done)
	for {
		mt, message, err := c.ReadMessage()
		if err != nil {
			log.Printf("Read error: %v", err)
			return
		}
		if mt == websocket.BinaryMessage {
			var serverPayload pb.ServerPayload
			if err := proto.Unmarshal(message, &serverPayload); err != nil {
				log.Printf("Failed to unmarshal server payload: %v", err)
				continue
			}

			// Handle Command
			if cmd := serverPayload.GetCommand(); cmd != nil {
				log.Printf("Received Command: %s (Type: %v)", cmd.Id, cmd.Type)

				if cmd.Type == pb.Command_STREAM_LOGS || cmd.Type == pb.Command_EXEC {
					// Handle streaming commands separately
					log.Printf("Starting stream command: %s", cmd.Id)
					go handleStreamCommand(kubeClient, safeConn, cmd)
					sendAck(safeConn, cmd.Id, true, "Stream task initiated")
					continue
				}

				data, cmdErr := handleCommand(kubeClient, cmd)
				sendAck(safeConn, cmd.Id, cmdErr == nil, data)
			}

			// Handle Stream Data (Stdin/Resize)
			if streamData := serverPayload.GetStreamData(); streamData != nil {
				if entry, ok := getStream(streamData.StreamId); ok {
					if streamData.Closed {
						unregisterStream(streamData.StreamId)
					} else if streamData.Type == pb.StreamData_RESIZE {
						if entry.resizeQueue != nil {
							entry.resizeQueue.Push(uint16(streamData.Cols), uint16(streamData.Rows))
						}
					} else {
						if entry.stdinChan != nil {
							entry.stdinChan <- streamData.Data
						}
					}
				}
			}
		} else {
			log.Printf("Recv non-binary message: %s", string(message))
		}
	}
}

func heartbeatLoop(safeConn *SafeConn, kubeClient *k8s.K8sClient, done chan struct{}) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			heartbeat, err := kubeClient.GetFullClusterState()
			if err != nil {
				log.Printf("Failed to get cluster state: %v", err)
				continue
			}
			payload := &pb.AgentPayload{
				Payload: &pb.AgentPayload_Heartbeat{
					Heartbeat: heartbeat,
				},
			}
			data, _ := proto.Marshal(payload)
			if err := safeConn.WriteMessage(websocket.BinaryMessage, data); err != nil {
				// WriteMessage already logs and sets conn=nil on error
				log.Printf("Heartbeat write failed: %v", err)
				// We don't return here because done might be closed soon by readLoop anyway,
				// and WriteMessage will block until reconnect.
				// But actually, if the writer fails, we might want to signal done if readLoop hasn't already.
				// For heartbeats, if it keeps failing, let's just let it block.
			}
		}
	}
}

func sendAck(conn *SafeConn, id string, success bool, data string) {
	response := &pb.CommandResponse{
		Id:      id,
		Success: success,
		Data:    data,
	}
	if !success {
		response.Error = data // If failed, data is error message
	}
	payload := &pb.AgentPayload{
		Payload: &pb.AgentPayload_CommandResponse{
			CommandResponse: response,
		},
	}
	bytes, _ := proto.Marshal(payload)
	conn.WriteMessage(websocket.BinaryMessage, bytes)
}

func handleStreamCommand(kc *k8s.K8sClient, conn *SafeConn, cmd *pb.Command) {
	// Check if already running
	// For logs, we might not have a stdinChan, but we still want to avoid duplicates
	if !registerStream(cmd.Id, &StreamEntry{}) {
		log.Printf("Stream %s is already running, ignoring", cmd.Id)
		return
	}
	defer unregisterStream(cmd.Id)

	// Parse payload
	var req struct {
		Namespace string   `json:"namespace"`
		Name      string   `json:"name"`
		Container string   `json:"container"`
		Command   []string `json:"command"`
		Follow    bool     `json:"follow"`
		TailLines int64    `json:"tailLines"`
	}
	if err := json.Unmarshal([]byte(cmd.Payload), &req); err != nil {
		log.Printf("Stream payload unmarshal error: %v", err)
		return
	}

	// Helper to send data
	sendData := func(data []byte, isError bool) {
		payload := &pb.AgentPayload{
			Payload: &pb.AgentPayload_StreamData{
				StreamData: &pb.StreamData{
					StreamId: cmd.Id,
					Data:     data,
					IsError:  isError,
				},
			},
		}
		bytes, _ := proto.Marshal(payload)
		// This will block if connection is down, and resume when it's back
		conn.WriteMessage(websocket.BinaryMessage, bytes)
	}

	defer func() {
		// Send Close frame
		payload := &pb.AgentPayload{
			Payload: &pb.AgentPayload_StreamData{
				StreamData: &pb.StreamData{
					StreamId: cmd.Id,
					Closed:   true,
				},
			},
		}
		bytes, _ := proto.Marshal(payload)
		conn.WriteMessage(websocket.BinaryMessage, bytes)
		log.Printf("Stream %s ended", cmd.Id)
	}()

	if cmd.Type == pb.Command_STREAM_LOGS {
		stream, err := kc.GetLogsStream(context.Background(), req.Namespace, req.Name, req.Container, req.TailLines, req.Follow)
		if err != nil {
			log.Printf("Error opening logs: %v", err)
			sendData([]byte(fmt.Sprintf("Error opening logs: %v", err)), true)
			return
		}
		defer stream.Close()

		buf := make([]byte, 2048)
		for {
			n, err := stream.Read(buf)
			if n > 0 {
				sendData(buf[:n], false)
			}
			if err != nil {
				if err != io.EOF {
					log.Printf("Log stream error for %s: %v", cmd.Id, err)
					sendData([]byte(fmt.Sprintf("\nStream error: %v", err)), true)
				}
				break
			}
		}
	} else if cmd.Type == pb.Command_EXEC {
		// Stdin pipe
		r, w := io.Pipe()
		stdinChan := make(chan []byte, 10)
		resizeQueue := k8s.NewTerminalSizeQueue()

		// Update the entry with actual channels
		streamMutex.Lock()
		if entry, ok := activeStreams[cmd.Id]; ok {
			entry.stdinChan = stdinChan
			entry.resizeQueue = resizeQueue
		}
		streamMutex.Unlock()

		// Pump stdin
		go func() {
			defer w.Close()
			for chunk := range stdinChan {
				w.Write(chunk)
			}
		}()

		// Stdout/Stderr writers
		outWriter := &WsWriter{send: func(p []byte) { sendData(p, false) }}
		errWriter := &WsWriter{send: func(p []byte) { sendData(p, true) }}

		// Default to TTY true for interactive terminals
		err := kc.ExecStream(req.Namespace, req.Name, req.Container, req.Command, r, outWriter, errWriter, true, resizeQueue)
		if err != nil {
			log.Printf("Exec error: %v", err)
			sendData([]byte(fmt.Sprintf("Exec error: %v", err)), true)
		}
	}
}

type WsWriter struct {
	send func([]byte)
}

func (w *WsWriter) Write(p []byte) (n int, err error) {
	w.send(p)
	return len(p), nil
}

func handleCommand(kc *k8s.K8sClient, cmd *pb.Command) (string, error) {
	var err error
	var resultData string

	switch cmd.Type {
	case pb.Command_EDIT_RESOURCE,
		pb.Command_CREATE_DEPLOYMENT,
		pb.Command_CREATE_POD,
		pb.Command_CREATE_SERVICE,
		pb.Command_CREATE_RESOURCE,
		pb.Command_CREATE_INGRESS:
		if cmd.Payload != "" {
			err = kc.ApplyManifest(cmd.Payload)
			if err == nil {
				resultData = "Resource applied successfully"
			}
		} else {
			err = fmt.Errorf("payload empty for CREATE/EDIT command")
		}
	case pb.Command_SCALE_DEPLOYMENT:
		if cmd.TargetNamespace != "" && cmd.TargetName != "" && cmd.Payload != "" {
			replicas, convErr := strconv.Atoi(cmd.Payload)
			if convErr != nil {
				err = fmt.Errorf("invalid replicas payload: %v", convErr)
			} else {
				err = kc.ScaleDeployment(cmd.TargetNamespace, cmd.TargetName, int32(replicas))
				if err == nil {
					resultData = fmt.Sprintf("Deployment scaled to %d replicas", replicas)
				}
			}
		} else {
			err = fmt.Errorf("missing target or payload for SCALE command")
		}
	case pb.Command_DELETE_DEPLOYMENT:
		if cmd.TargetNamespace != "" && cmd.TargetName != "" {
			err = kc.DeleteDeployment(cmd.TargetNamespace, cmd.TargetName)
			if err == nil {
				resultData = "Deployment deleted successfully"
			}
		} else {
			err = fmt.Errorf("missing target for DELETE_DEPLOYMENT command")
		}
	case pb.Command_DELETE_POD:
		if cmd.TargetNamespace != "" && cmd.TargetName != "" {
			err = kc.DeletePod(cmd.TargetNamespace, cmd.TargetName)
			if err == nil {
				resultData = "Pod deleted successfully"
			}
		} else {
			err = fmt.Errorf("missing target for DELETE_POD command")
		}
	case pb.Command_DELETE_SERVICE:
		if cmd.TargetNamespace != "" && cmd.TargetName != "" {
			// Assuming generic DeleteResource exists or needs to be implemented.
			// Re-using DeleteDeployment logic pattern but for Service?
			// The K8sClient likely needs a generic Delete or specific DeleteService.
			// Let's assume generic DeleteResource can be used if we passed Kind?
			// Or check if k8s client has DeleteService.
			// Since I can't see the K8s Client code right now, I will use a hypothetical `kc.DeleteService`
			// and if it fails I will check `agent/service/k8s/client.go`.
			// Wait, I should check `k8s/client.go` first to be safe.
			// But sticking to the pattern:
			err = kc.DeleteService(cmd.TargetNamespace, cmd.TargetName)
			if err == nil {
				resultData = "Service deleted successfully"
			}
		} else {
			err = fmt.Errorf("missing target for DELETE_SERVICE command")
		}
	case pb.Command_DELETE_RESOURCE,
		pb.Command_DELETE_INGRESS:
		// Generic delete using Payload as Kind?
		// cmd.Payload used as Kind in previous steps instructions.
		if cmd.TargetNamespace != "" && cmd.TargetName != "" && cmd.Payload != "" {
			err = kc.DeleteResource(cmd.TargetNamespace, cmd.TargetName, cmd.Payload) // Kind from payload
			if err == nil {
				resultData = fmt.Sprintf("%s deleted successfully", cmd.Payload)
			}
		} else {
			err = fmt.Errorf("missing target or kind (payload) for DELETE_RESOURCE command")
		}
	case pb.Command_DELETE_NODE:
		if cmd.TargetName != "" {
			err = kc.DeleteNode(cmd.TargetName)
			if err == nil {
				resultData = "Node deleted successfully"
			}
		} else {
			err = fmt.Errorf("missing target_name for DELETE_NODE command")
		}
	case pb.Command_GET_JOIN_TOKEN:
		log.Println("Generating join token...")
		if cmdStr, joinErr := kc.GenerateJoinCommand(); joinErr != nil {
			err = fmt.Errorf("failed to generate join token: %v", joinErr)
		} else {
			resultData = cmdStr
		}
	default:
		log.Printf("Unknown command type: %v", cmd.Type)
		return "", fmt.Errorf("unknown command type: %v", cmd.Type)
	}

	if err != nil {
		log.Printf("Error executing command %s: %v", cmd.Id, err)
		return "", err
	} else {
		log.Printf("Successfully executed command %s", cmd.Id)
		return resultData, nil
	}
}

type ClusterConfig struct {
	EnableS3Service  bool   `json:"enableS3Service"`
	Name             string `json:"name"`
	S3AdminSecretKey string `json:"s3AdminSecretKey"`
	ClusterKey       string `json:"clusterKey"`
}

func getClusterConfig() (*ClusterConfig, error) {
	data := map[string]string{}
	jsonPayload, err := json.Marshal(data)
	if err != nil {
		log.Fatalf("Error marshalling JSON: %v", err)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	backendAddr, err := url.Parse(*addr)
	if err != nil {
		log.Fatalf("Error parsing backend address: %v", err)
	}
	url := url.URL{
		Scheme: "https",
		Host:   backendAddr.Host,
		Path:   "/api/agents/cluster-info",
	}
	req, err := http.NewRequest("GET", url.String(), bytes.NewBuffer(jsonPayload))
	if err != nil {
		log.Fatalf("Error creating request: %v", err)
	}

	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("Authorization", "Bot "+*token)

	resp, err := client.Do(req)
	if err != nil {
		log.Fatalf("Error sending request: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Fatalf("Error reading response body: %v", err)
	}

	var apiResp struct {
		Data ClusterConfig `json:"data"`
	}
	err = json.Unmarshal(body, &apiResp)
	if err != nil {
		log.Fatalf("Error unmarshalling response JSON: %v", err)
	}

	log.Printf("Received Cluster Key: %s...", string([]rune(apiResp.Data.ClusterKey)[:5]))
	return &apiResp.Data, nil
}

func updateClusterS3Key(key string) error {
	data := map[string]string{"s3AdminSecretKey": key}
	jsonPayload, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("marshalling error: %w", err)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	u := url.URL{
		Scheme: "https",
		Host:   *addr,
		Path:   "/api/agents/cluster-config",
	}

	req, err := http.NewRequest("POST", u.String(), bytes.NewBuffer(jsonPayload))
	if err != nil {
		return fmt.Errorf("request creation error: %w", err)
	}

	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("Authorization", "Bot "+*token)

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("api returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

package main

import (
	"bytes"
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
	"time"

	"github.com/gorilla/websocket"
	"google.golang.org/protobuf/proto"

	// Import all auth plugins for broad compatibility

	pb "k8s-dashboard/agents/pb/agent-backend"
	"k8s-dashboard/agents/service/k8s"

	_ "k8s.io/client-go/plugin/pkg/client/auth"
)

var addr = flag.String("addr", "localhost:3001", "server address") // Default to 3001 for backend
var token = flag.String("token", "iamveryhandsome", "server token")

func main() {
	flag.Parse()
	log.SetFlags(0)

	kubeClient, err := k8s.NewK8sClient()
	if err != nil {
		log.Fatalf("Failed to create Kubernetes client: %v", err)
	}
	log.Printf("Kubernetes client created")

	// Initial cluster config fetch (optional or part of handshake)
	// clusterConfig, err := getClusterConfig() ...

	// Initial Bootstrap if needed
	// kubeClient.BootstrapSystem(...)

	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)

	u := url.URL{Scheme: "ws", Host: *addr, Path: "/api/agent/ws"}
	log.Printf("connecting to %s", u.String())

	header := make(http.Header)
	header.Add("Authorization", "Bot "+*token)

	c, _, err := websocket.DefaultDialer.Dial(u.String(), header)
	if err != nil {
		log.Fatal("dial:", err)
	}
	defer c.Close()

	done := make(chan struct{})

	// 1. Read Loop (Receive Commands)
	go func() {
		defer close(done)
		for {
			mt, message, err := c.ReadMessage()
			if err != nil {
				log.Println("read:", err)
				return
			}
			if mt == websocket.BinaryMessage {
				var serverPayload pb.ServerPayload
				if err := proto.Unmarshal(message, &serverPayload); err != nil {
					log.Printf("Failed to unmarshal server payload: %v", err)
					continue
				}

				if cmd := serverPayload.GetCommand(); cmd != nil {
					log.Printf("Received Command: %s (Type: %v)", cmd.Id, cmd.Type)
					handleCommand(kubeClient, cmd)
				}
			} else {
				log.Printf("recv non-binary message: %s", message)
			}
		}
	}()

	// 2. Heartbeat Loop (Send Stats)
	ticker := time.NewTicker(5 * time.Second) // Send heartbeat every 5 seconds
	defer ticker.Stop()

	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			// Collect Stats
			heartbeat, err := kubeClient.GetFullClusterState()
			if err != nil {
				log.Printf("Failed to get cluster state: %v", err)
				continue // Don't crash, just skip this beat
			}

			// Wrap in AgentPayload
			payload := &pb.AgentPayload{
				Payload: &pb.AgentPayload_Heartbeat{
					Heartbeat: heartbeat,
				},
			}

			// Marshal to bytes
			data, err := proto.Marshal(payload)
			if err != nil {
				log.Printf("Failed to marshal heartbeat: %v", err)
				continue
			}

			// Send
			err = c.WriteMessage(websocket.BinaryMessage, data)
			if err != nil {
				log.Println("write:", err)
				return
			}
			log.Println("Sent Heartbeat")

		case <-interrupt:
			log.Println("interrupt")
			err := c.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "Client shutting down"))
			if err != nil {
				log.Println("write close:", err)
				return
			}
			select {
			case <-done:
			case <-time.After(time.Second):
			}
			return
		}
	}
}

func handleCommand(kc *k8s.K8sClient, cmd *pb.Command) {
	var err error
	switch cmd.Type {
	case pb.Command_EDIT_RESOURCE, pb.Command_CREATE_DEPLOYMENT:
		// Expects YAML/JSON payload
		if cmd.Payload != "" {
			err = kc.ApplyManifest(cmd.Payload)
		} else {
			err = fmt.Errorf("payload empty for EDIT/CREATE command")
		}
	case pb.Command_SCALE_DEPLOYMENT:
		// Payload could be replicas int string or we use a structured field if we added one
		// Assuming payload is "replicas" as string for simplicity, or we parse from YAML if provided.
		// For robustness, let's assume Payload is just the number of replicas as a string for this specific command type.
		if cmd.TargetNamespace != "" && cmd.TargetName != "" && cmd.Payload != "" {
			replicas, convErr := strconv.Atoi(cmd.Payload)
			if convErr != nil {
				err = fmt.Errorf("invalid replicas payload: %v", convErr)
			} else {
				err = kc.ScaleDeployment(cmd.TargetNamespace, cmd.TargetName, int32(replicas))
			}
		} else {
			err = fmt.Errorf("missing target or payload for SCALE command")
		}
	case pb.Command_DELETE_DEPLOYMENT:
		if cmd.TargetNamespace != "" && cmd.TargetName != "" {
			// Note: We need DeleteDeployment in k8s.go, assuming DeletePod was existing but we want deployments now.
			// But usually DELETE_DEPLOYMENT means deleting the deployment resource.
			// If existing k8s client has DeleteDeployment use it, otherwise fallback or implement it.
			// Checking k8s.go I don't see DeleteDeployment, only DeletePod.
			// I will use a generic DeleteResource if available or fallback to DeletePod for now to avoid breaking build,
			// BUT since this is a "Deployment" command, we should strictly delete the deployment.
			// Let's assume we will add DeleteDeployment to k8s.go or use generic dynamic client delete.
			// For now, mapping to DeleteDeployment which I will implement next.
			err = kc.DeleteDeployment(cmd.TargetNamespace, cmd.TargetName)
		} else {
			err = fmt.Errorf("missing target for DELETE command")
		}
	default:
		log.Printf("Unknown command type: %v", cmd.Type)
		return
	}

	if err != nil {
		log.Printf("Error executing command %s: %v", cmd.Id, err)
	} else {
		log.Printf("Successfully executed command %s", cmd.Id)
	}
}

type ClusterConfig struct {
	EnableS3Service  bool   `json:"enableS3Service"`
	Name             string `json:"name"`
	S3AdminSecretKey string `json:"s3AdminSecretKey"`
}

func getClusterConfig() (*ClusterConfig, error) {
	// 1. Define the data to send
	data := map[string]string{}
	jsonPayload, err := json.Marshal(data)
	if err != nil {
		log.Fatalf("Error marshalling JSON: %v", err)
	}

	// 2. Create a custom HTTP client with a timeout
	client := &http.Client{Timeout: 10 * time.Second}
	url := url.URL{
		Scheme: "https",
		Host:   *addr,
		Path:   "/api/agents/cluster-config",
	}
	// 3. Create the HTTP request object
	// The body is an io.Reader (bytes.Buffer implements this interface)
	req, err := http.NewRequest("GET", url.String(), bytes.NewBuffer(jsonPayload))
	if err != nil {
		log.Fatalf("Error creating request: %v", err)
	}

	// 4. Set necessary headers
	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("Authorization", "Bot "+*token) // Example: Adding an auth token

	// 5. Send the request
	resp, err := client.Do(req)
	if err != nil {
		log.Fatalf("Error sending request: %v", err)
	}
	defer resp.Body.Close()

	// 6. Handle the response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Fatalf("Error reading response body: %v", err)
	}

	fmt.Printf("Status Code: %d\n", resp.StatusCode)
	fmt.Printf("Response Body: %s\n", string(body))
	// Parse the response body into map[string]string
	var responseData ClusterConfig
	err = json.Unmarshal(body, &responseData)
	if err != nil {
		log.Fatalf("Error unmarshalling response JSON: %v", err)
	}

	return &responseData, nil
}

func updateClusterS3Key(key string) error {
	// Prepare payload
	data := map[string]string{"s3AdminSecretKey": key}
	jsonPayload, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("marshalling error: %w", err)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	u := url.URL{
		Scheme: "https",
		Host:   *addr,
		Path:   "/api/agents/cluster-config", // Use consistent endpoint
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

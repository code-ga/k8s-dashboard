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
					data, cmdErr := handleCommand(kubeClient, cmd)

					// Construct response
					response := &pb.CommandResponse{
						Id:      cmd.Id,
						Success: cmdErr == nil,
						Data:    data,
					}
					if cmdErr != nil {
						response.Error = cmdErr.Error()
					}

					// Wrap in AgentPayload
					payload := &pb.AgentPayload{
						Payload: &pb.AgentPayload_CommandResponse{
							CommandResponse: response,
						},
					}

					// Marshal and send response
					respData, respErr := proto.Marshal(payload)
					if respErr != nil {
						log.Printf("Failed to marshal command response: %v", respErr)
					} else {
						if err := c.WriteMessage(websocket.BinaryMessage, respData); err != nil {
							log.Printf("Failed to send command response: %v", err)
						} else {
							log.Printf("Sent response for command %s", cmd.Id)
						}
					}
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

func handleCommand(kc *k8s.K8sClient, cmd *pb.Command) (string, error) {
	var err error
	var resultData string

	switch cmd.Type {
	case pb.Command_EDIT_RESOURCE, pb.Command_CREATE_DEPLOYMENT, pb.Command_CREATE_POD:
		// Expects YAML/JSON payload
		if cmd.Payload != "" {
			err = kc.ApplyManifest(cmd.Payload)
			if err == nil {
				resultData = "Resource applied successfully"
			}
		} else {
			err = fmt.Errorf("payload empty for EDIT/CREATE command")
		}
	case pb.Command_SCALE_DEPLOYMENT:
		// ...
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
			err = fmt.Errorf("missing target for DELETE command")
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

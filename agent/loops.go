package main

import (
	"log"
	"time"

	"github.com/gorilla/websocket"
	"google.golang.org/protobuf/proto"

	pb "k8s-dashboard/agents/pb/agent-backend"
	"k8s-dashboard/agents/service/k8s"
)

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

			if cmd := serverPayload.GetCommand(); cmd != nil {
				log.Printf("Received Command: %s (Type: %v)", cmd.Id, cmd.Type)

				if cmd.Type == pb.Command_STREAM_LOGS || cmd.Type == pb.Command_EXEC {
					log.Printf("Starting stream command: %s", cmd.Id)
					go handleStreamCommand(kubeClient, safeConn, cmd)
					sendAck(safeConn, cmd.Id, true, "Stream task initiated")
					continue
				}

				data, cmdErr := handleCommand(kubeClient, cmd)
				sendAck(safeConn, cmd.Id, cmdErr == nil, data)
			}

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
				log.Printf("Heartbeat write failed: %v", err)
			}
		}
	}
}

// sendAuth sends an AGENT_AUTHORIZE_USER message over the connection.
// It must be called immediately after every new WebSocket connection is established
// so the server can verify the agent's identity before processing any other messages.
func sendAuth(conn *SafeConn) error {
	payload := &pb.AgentPayload{
		Payload: &pb.AgentPayload_AuthorizeUser{
			AuthorizeUser: &pb.AGENT_AUTHORIZE_USER{
				Token: *token,
			},
		},
	}
	data, err := proto.Marshal(payload)
	if err != nil {
		return err
	}
	if err := conn.WriteMessage(websocket.BinaryMessage, data); err != nil {
		return err
	}
	log.Println("Auth message sent")
	return nil
}

func sendAck(conn *SafeConn, id string, success bool, data string) {
	response := &pb.CommandResponse{
		Id:      id,
		Success: success,
		Data:    data,
	}
	if !success {
		response.Error = data
	}
	payload := &pb.AgentPayload{
		Payload: &pb.AgentPayload_CommandResponse{
			CommandResponse: response,
		},
	}
	bytes, _ := proto.Marshal(payload)
	conn.WriteMessage(websocket.BinaryMessage, bytes)
}

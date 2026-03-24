package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"sync"

	"github.com/gorilla/websocket"
	"google.golang.org/protobuf/proto"

	pb "k8s-dashboard/agents/pb/agent-backend"
	"k8s-dashboard/agents/service/k8s"
)

// StreamEntry holds the channels used to communicate with an active stream.
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

func handleStreamCommand(kc *k8s.K8sClient, conn *SafeConn, cmd *pb.Command) {
	log.Printf("[Stream] Handling ID:%s Type:%v Namespace:%s Name:%s", cmd.Id, cmd.Type, cmd.TargetNamespace, cmd.TargetName)
	if !registerStream(cmd.Id, &StreamEntry{}) {
		log.Printf("[Stream] Stream %s is already running, ignoring", cmd.Id)
		return
	}
	defer unregisterStream(cmd.Id)

	var req struct {
		Namespace string   `json:"namespace"`
		Name      string   `json:"name"`
		Container string   `json:"container"`
		Command   []string `json:"command"`
		Follow    bool     `json:"follow"`
		TailLines int64    `json:"tailLines"`
	}
	if err := json.Unmarshal([]byte(cmd.Payload), &req); err != nil {
		log.Printf("[Stream] Stream %s payload unmarshal error: %v", cmd.Id, err)
		return
	}

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
		conn.WriteMessage(websocket.BinaryMessage, bytes)
	}

	defer func() {
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
		log.Printf("[Stream] Stream %s ended", cmd.Id)
	}()

	if cmd.Type == pb.Command_STREAM_LOGS {
		log.Printf("[Stream] Opening logs for %s/%s/%s (ID:%s)", req.Namespace, req.Name, req.Container, cmd.Id)
		stream, err := kc.GetLogsStream(context.Background(), req.Namespace, req.Name, req.Container, req.TailLines, req.Follow)
		if err != nil {
			log.Printf("[Stream] Error opening logs for %s: %v", cmd.Id, err)
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
					log.Printf("[Stream] Log stream error for %s: %v", cmd.Id, err)
					sendData([]byte(fmt.Sprintf("\nStream error: %v", err)), true)
				}
				break
			}
		}
	} else if cmd.Type == pb.Command_EXEC {
		log.Printf("[Stream] Starting exec for %s/%s/%s with command %v (ID:%s)", req.Namespace, req.Name, req.Container, req.Command, cmd.Id)
		r, w := io.Pipe()
		stdinChan := make(chan []byte, 10)
		resizeQueue := k8s.NewTerminalSizeQueue()

		streamMutex.Lock()
		if entry, ok := activeStreams[cmd.Id]; ok {
			entry.stdinChan = stdinChan
			entry.resizeQueue = resizeQueue
		}
		streamMutex.Unlock()

		go func() {
			defer w.Close()
			for chunk := range stdinChan {
				w.Write(chunk)
			}
		}()

		outWriter := &WsWriter{send: func(p []byte) { sendData(p, false) }}
		errWriter := &WsWriter{send: func(p []byte) { sendData(p, true) }}

		err := kc.ExecStream(req.Namespace, req.Name, req.Container, req.Command, r, outWriter, errWriter, true, resizeQueue)
		if err != nil {
			log.Printf("[Stream] Exec error for %s: %v", cmd.Id, err)
			sendData([]byte(fmt.Sprintf("Exec error: %v", err)), true)
		}
	}
}


// WsWriter adapts a send function to the io.Writer interface.
type WsWriter struct {
	send func([]byte)
}

func (w *WsWriter) Write(p []byte) (n int, err error) {
	w.send(p)
	return len(p), nil
}

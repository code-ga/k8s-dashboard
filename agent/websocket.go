package main

import (
	"fmt"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

// SafeConn is a thread-safe WebSocket writer with auto-reconnect support.
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

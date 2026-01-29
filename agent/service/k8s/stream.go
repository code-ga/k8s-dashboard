package k8s

import (
	"bytes"
	"context"
	"fmt"
	"io"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/remotecommand"
)

// TerminalSizeQueue implements remotecommand.TerminalSizeQueue
type TerminalSizeQueue struct {
	resizeChan chan remotecommand.TerminalSize
}

func NewTerminalSizeQueue() *TerminalSizeQueue {
	return &TerminalSizeQueue{
		resizeChan: make(chan remotecommand.TerminalSize, 1),
	}
}

func (q *TerminalSizeQueue) Next() *remotecommand.TerminalSize {
	size, ok := <-q.resizeChan
	if !ok {
		return nil
	}
	return &size
}

func (q *TerminalSizeQueue) Push(width, height uint16) {
	select {
	case q.resizeChan <- remotecommand.TerminalSize{Width: width, Height: height}:
	default:
		// Drop old resize if channel is full
	}
}

func (q *TerminalSizeQueue) Close() {
	close(q.resizeChan)
}

// ExecStream starts a remote command execution and links it to the provided IO streams.
func (k *K8sClient) ExecStream(namespace, podName, containerName string, cmd []string, stdin io.Reader, stdout, stderr io.Writer, tty bool, sizeQueue *TerminalSizeQueue) error {
	req := k.Clientset.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(podName).
		Namespace(namespace).
		SubResource("exec")

	option := &corev1.PodExecOptions{
		Command: cmd,
		Stdin:   stdin != nil,
		Stdout:  stdout != nil,
		Stderr:  stderr != nil,
		TTY:     tty,
	}
	if containerName != "" {
		option.Container = containerName
	}

	req.VersionedParams(
		option,
		scheme.ParameterCodec,
	)

	exec, err := remotecommand.NewSPDYExecutor(k.RestConfig, "POST", req.URL())
	if err != nil {
		return fmt.Errorf("failed to create executor: %w", err)
	}

	streamOpts := remotecommand.StreamOptions{
		Stdin:  stdin,
		Stdout: stdout,
		Stderr: stderr,
		Tty:    tty,
	}
	if tty && sizeQueue != nil {
		streamOpts.TerminalSizeQueue = sizeQueue
	}

	err = exec.Stream(streamOpts)

	return err
}

func (k *K8sClient) GetLogsStream(ctx context.Context, namespace, podName, containerName string, tailLines int64, follow bool) (io.ReadCloser, error) {
	opts := &corev1.PodLogOptions{
		Follow:    follow,
		TailLines: &tailLines,
	}
	if containerName != "" {
		opts.Container = containerName
	}

	req := k.Clientset.CoreV1().Pods(namespace).GetLogs(podName, opts)
	stream, err := req.Stream(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to open log stream: %w", err)
	}
	return stream, nil
}

// ExecInPod is a helper for synchronous execution, used by bootstrap logic.
func (k *K8sClient) ExecInPod(namespace, podName, containerName string, cmd []string) (string, string, error) {
	var stdout, stderr bytes.Buffer
	err := k.ExecStream(namespace, podName, containerName, cmd, nil, &stdout, &stderr, false, nil)
	return stdout.String(), stderr.String(), err
}

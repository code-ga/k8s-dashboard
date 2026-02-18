//go:build linux

package main

import (
	"os"
	"syscall"
)

// reexec replaces the current process image with the binary at path using
// execve(2). On success this function never returns.
func reexec(path string) error {
	return syscall.Exec(path, os.Args, os.Environ())
}

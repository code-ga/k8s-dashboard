//go:build !linux

package main

import (
	"os"
	"os/exec"
)

// reexec starts the binary at path with the same arguments and environment,
// then exits the current process. Used on non-Linux platforms where
// syscall.Exec is not available.
func reexec(path string) error {
	cmd := exec.Command(path, os.Args[1:]...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return err
	}
	os.Exit(0)
	return nil
}

//go:build !windows

package main

import (
	"os/exec"
	"syscall"
)

func prepareProcess(cmd *exec.Cmd) { cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true} }
func killProcess(cmd *exec.Cmd)    { _ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL) }

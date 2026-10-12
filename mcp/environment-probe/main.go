// Fixed native application version probes. This is not an MCP replacement.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"
)

type boundedBuffer struct {
	mu        sync.Mutex
	buffer    bytes.Buffer
	truncated bool
}

func (b *boundedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	n := len(p)
	remain := 65536 - b.buffer.Len()
	if remain < len(p) {
		b.truncated = true
		p = p[:remain]
	}
	_, _ = b.buffer.Write(p)
	return n, nil
}

func (b *boundedBuffer) String() string { b.mu.Lock(); defer b.mu.Unlock(); return b.buffer.String() }

type Result struct {
	OK        bool   `json:"ok"`
	ExitCode  int    `json:"exitCode"`
	Stdout    string `json:"stdout"`
	Stderr    string `json:"stderr"`
	TimedOut  bool   `json:"timedOut"`
	Cancelled bool   `json:"cancelled"`
	Truncated bool   `json:"truncated"`
	Error     string `json:"error,omitempty"`
}

func probe(asset, executable string, timeout time.Duration) Result {
	result := Result{ExitCode: -1}
	args, ok := map[string][]string{"godot": {"--version"}, "kicad": {"--version"}, "freecad": {"--keep-deprecated-paths", "--version"}}[asset]
	if !ok || !filepath.IsAbs(executable) || timeout <= 0 || timeout > 120*time.Second {
		result.Error = "unsupported fixed application probe"
		return result
	}
	stat, err := os.Stat(executable)
	if err != nil || !stat.Mode().IsRegular() {
		result.Error = "probe executable must be a regular file"
		return result
	}
	cmd := exec.Command(executable, args...)
	out, stderr := &boundedBuffer{}, &boundedBuffer{}
	cmd.Stdout = out
	cmd.Stderr = stderr
	prepareProcess(cmd)
	cmd.Stdin = bytes.NewReader(nil)
	cmd.WaitDelay = time.Second
	if err = cmd.Start(); err != nil {
		result.Error = err.Error()
		return result
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	signals := make(chan os.Signal, 2)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(signals)
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case err = <-done:
	case <-timer.C:
		result.TimedOut = true
		killProcess(cmd)
		err = <-done
	case <-signals:
		result.Cancelled = true
		killProcess(cmd)
		err = <-done
	}
	killProcess(cmd) // Clean up any descendant retaining probe pipes.
	result.Stdout = out.String()
	result.Stderr = stderr.String()
	result.Truncated = out.truncated || stderr.truncated
	if err == nil {
		result.ExitCode = 0
	} else {
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			result.ExitCode = exit.ExitCode()
		} else {
			result.Error = err.Error()
		}
	}
	result.OK = result.ExitCode == 0 && !result.TimedOut && !result.Cancelled && !result.Truncated
	return result
}
func main() {
	asset := flag.String("asset", "", "owner-declared native asset ID")
	executable := flag.String("executable", "", "host-selected native executable")
	timeout := flag.Int("timeout-ms", 5000, "bounded probe timeout")
	flag.Parse()
	if flag.NArg() != 0 {
		fmt.Fprintln(os.Stderr, "unexpected arguments")
		os.Exit(2)
	}
	result := probe(*asset, *executable, time.Duration(*timeout)*time.Millisecond)
	_ = json.NewEncoder(os.Stdout).Encode(result)
	if !result.OK {
		os.Exit(1)
	}
}

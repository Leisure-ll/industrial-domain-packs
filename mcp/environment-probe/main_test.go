package main

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"
)

func TestMain(m *testing.M) {
	_ = os.Setenv("GORACE", "atexit_sleep_ms=0")
	if len(os.Args) > 1 && (os.Args[1] == "--version" || os.Args[1] == "-V") {
		switch os.Getenv("PROBE_FIXTURE") {
		case "failure":
			fmt.Fprintln(os.Stderr, "native failure")
			os.Exit(3)
		case "timeout":
			time.Sleep(10 * time.Second)
		case "overflow":
			fmt.Print(strings.Repeat("x", 70000))
		default:
			fmt.Println("4.7.2.stable.fixture")
		}
		os.Exit(0)
	}
	os.Exit(m.Run())
}
func TestFixedVersionProbe(t *testing.T) {
	executable, _ := os.Executable()
	t.Setenv("PROBE_FIXTURE", "success")
	result := probe("version", executable, time.Second)
	if !result.OK || !strings.Contains(result.Stdout, "4.7.2") {
		t.Fatalf("unexpected probe: %+v", result)
	}
	if result = probe("arbitrary", executable, time.Second); result.OK || result.Error == "" {
		t.Fatal("accepted arbitrary worker")
	}
}
func TestFailedNativeProbe(t *testing.T) {
	executable, _ := os.Executable()
	t.Setenv("PROBE_FIXTURE", "failure")
	result := probe("godot", executable, time.Second)
	if result.OK || result.ExitCode != 3 {
		t.Fatalf("%+v", result)
	}
}
func TestTimeout(t *testing.T) {
	executable, _ := os.Executable()
	t.Setenv("PROBE_FIXTURE", "timeout")
	result := probe("godot", executable, 50*time.Millisecond)
	if result.OK || !result.TimedOut {
		t.Fatalf("%+v", result)
	}
}
func TestOutputLimit(t *testing.T) {
	executable, _ := os.Executable()
	t.Setenv("PROBE_FIXTURE", "overflow")
	result := probe("godot", executable, time.Second)
	if result.OK || !result.Truncated || len(result.Stdout) != 65536 {
		t.Fatalf("bad output limit: ok=%v length=%v", result.OK, len(result.Stdout))
	}
}

func TestGenericShortProbe(t *testing.T) {
	executable, _ := os.Executable()
	t.Setenv("PROBE_FIXTURE", "success")
	result := probe("version-short", executable, time.Second)
	if !result.OK || !strings.Contains(result.Stdout, "4.7.2") {
		t.Fatalf("%+v", result)
	}
}

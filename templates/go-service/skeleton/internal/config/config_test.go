package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/spf13/viper"
)

// Config is read once at startup and never revalidated, so a wrong default or a
// silently-ignored override is a setting that is wrong for the process's whole
// life. The timeouts in particular have no visible symptom until a slow client
// ties up a connection.

func reset() { viper.Reset() }

func TestDefaultsAreUsableWithoutAnyConfig(t *testing.T) {
	reset()
	t.Chdir(t.TempDir())

	if err := Load(""); err != nil {
		t.Fatalf("Load: %v", err)
	}
	cfg, err := Get()
	if err != nil {
		t.Fatalf("Get: %v", err)
	}

	if cfg.Port == "" {
		t.Error("Port has no default — the server cannot bind")
	}
	// Zero timeouts mean "no timeout" in net/http, which is the difference
	// between a bounded server and one a single stalled client can exhaust.
	for name, d := range map[string]time.Duration{
		"ReadTimeout":  cfg.ReadTimeout,
		"WriteTimeout": cfg.WriteTimeout,
		"IdleTimeout":  cfg.IdleTimeout,
	} {
		if d <= 0 {
			t.Errorf("%s = %v, want a positive default", name, d)
		}
	}
}

func TestExplicitConfigFileIsRead(t *testing.T) {
	reset()
	dir := t.TempDir()
	path := filepath.Join(dir, "svc.yaml")
	body := "port: \"9999\"\nread_timeout: 3s\nlog_format: text\n"
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatalf("writing config: %v", err)
	}

	if err := Load(path); err != nil {
		t.Fatalf("Load: %v", err)
	}
	cfg, err := Get()
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if cfg.Port != "9999" {
		t.Errorf("Port = %q, want %q", cfg.Port, "9999")
	}
	// Durations arrive as strings and are decoded by viper's hook; a missing
	// hook yields a zero duration rather than an error.
	if cfg.ReadTimeout != 3*time.Second {
		t.Errorf("ReadTimeout = %v, want 3s", cfg.ReadTimeout)
	}
	if cfg.LogFormat != "text" {
		t.Errorf("LogFormat = %q, want %q", cfg.LogFormat, "text")
	}
}

func TestMalformedExplicitConfigIsAnError(t *testing.T) {
	reset()
	path := filepath.Join(t.TempDir(), "broken.yaml")
	if err := os.WriteFile(path, []byte("port: [nope\n"), 0o600); err != nil {
		t.Fatalf("writing config: %v", err)
	}
	// Named explicitly and unreadable must fail. Falling back to defaults here
	// starts a server on the wrong port while looking configured.
	if err := Load(path); err == nil {
		t.Fatal("Load accepted a malformed config file that was named explicitly")
	}
}

func TestMissingOptionalConfigIsNotAnError(t *testing.T) {
	reset()
	t.Chdir(t.TempDir())
	if err := Load(""); err != nil {
		t.Fatalf("an absent optional config should not fail: %v", err)
	}
}

func TestEnvironmentOverridesDefaults(t *testing.T) {
	reset()
	t.Chdir(t.TempDir())
	// viper joins the prefix and key with an underscore, and the prefix here is
	// the project-name placeholder, which already ends in one.
	t.Setenv("__PROJECT_NAME___PORT", "7070")

	if err := Load(""); err != nil {
		t.Fatalf("Load: %v", err)
	}
	cfg, err := Get()
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if cfg.Port != "7070" {
		t.Errorf("Port = %q, want the environment value", cfg.Port)
	}
}

func TestGetSurfacesAnUnmarshalFailure(t *testing.T) {
	reset()
	viper.Set("read_timeout", "not-a-duration")
	if _, err := Get(); err == nil {
		t.Fatal("Get accepted a value that cannot unmarshal into Config")
	}
}

package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/spf13/viper"
)

// Config resolution is the part of a CLI that fails quietly: a precedence bug
// means a flag or an env var is read but ignored, the program starts fine, and
// the wrong value is used for the whole run. These pin the order the docs
// promise — explicit file, then environment, then default — and the one error
// path that must not be swallowed.

// reset clears viper's global state between cases. viper keeps a package-level
// singleton, so without this each case inherits whatever the previous one set
// and the suite passes or fails depending on the order it happens to run in.
func reset() { viper.Reset() }

func TestLoadAppliesDefaultsWithNoConfigFile(t *testing.T) {
	reset()
	if err := Load(""); err != nil {
		t.Fatalf("Load with no config file: %v", err)
	}

	cfg, err := Get()
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	// A missing config file is the normal case for a fresh install, not an
	// error — the defaults are what make the CLI runnable out of the box.
	if cfg.LogFormat == "" {
		t.Error("LogFormat default was not applied")
	}
	if cfg.Verbose {
		t.Error("Verbose should default to false")
	}
}

func TestLoadReadsAnExplicitConfigFile(t *testing.T) {
	reset()
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(path, []byte("log_format: text\nverbose: true\n"), 0o600); err != nil {
		t.Fatalf("writing config: %v", err)
	}

	if err := Load(path); err != nil {
		t.Fatalf("Load: %v", err)
	}
	cfg, err := Get()
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if cfg.LogFormat != "text" {
		t.Errorf("LogFormat = %q, want %q", cfg.LogFormat, "text")
	}
	if !cfg.Verbose {
		t.Error("Verbose = false, want true from the config file")
	}
}

func TestLoadReportsAnUnreadableExplicitConfigFile(t *testing.T) {
	reset()
	dir := t.TempDir()
	path := filepath.Join(dir, "broken.yaml")
	if err := os.WriteFile(path, []byte("log_format: [unterminated\n"), 0o600); err != nil {
		t.Fatalf("writing config: %v", err)
	}

	// The asymmetry that matters: a *missing* file is fine, but a file the user
	// named explicitly and that cannot be parsed must fail loudly. Starting with
	// silent defaults after the user pointed at a config is the worst outcome —
	// it looks like the config was applied.
	if err := Load(path); err == nil {
		t.Fatal("Load accepted a malformed config file that was named explicitly")
	}
}

func TestLoadIgnoresAMissingFileItWasNotToldAbout(t *testing.T) {
	reset()
	// Searching $HOME and . for an optional file that is not there is not an
	// error, and this is the branch that distinguishes it from the case above.
	t.Chdir(t.TempDir())
	if err := Load(""); err != nil {
		t.Fatalf("Load should tolerate an absent optional config: %v", err)
	}
}

func TestEnvironmentOverridesTheDefault(t *testing.T) {
	reset()
	// The prefix is derived from the project name with `-` mapped to `_`, and
	// the key replacer maps `.`/`-` the same way. A wrong prefix means every
	// documented env var is silently inert.
	// viper joins the prefix and the key with an underscore, and the prefix
	// here is the project-name placeholder — which already ends in one.
	t.Setenv("__PROJECT_NAME___LOG_FORMAT", "json-from-env")

	if err := Load(""); err != nil {
		t.Fatalf("Load: %v", err)
	}
	cfg, err := Get()
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if cfg.LogFormat != "json-from-env" {
		t.Errorf("LogFormat = %q, want the environment value", cfg.LogFormat)
	}
}

func TestGetSurfacesAnUnmarshalFailure(t *testing.T) {
	reset()
	// `verbose` is a bool; a string that is not parseable as one makes Unmarshal
	// fail. Get must return that error rather than a half-populated struct.
	viper.Set("verbose", "not-a-bool")
	if _, err := Get(); err == nil {
		t.Fatal("Get accepted a value that cannot unmarshal into Config")
	}
}

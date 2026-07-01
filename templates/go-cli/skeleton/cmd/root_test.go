package cmd

import (
	"bytes"
	"strings"
	"testing"
)

func TestExecute(t *testing.T) {
	tests := []struct {
		name    string
		args    []string
		wantErr bool
		wantOut string // substring expected in combined output; "" skips the check
		check   func(t *testing.T)
	}{
		{
			name:    "no args prints help",
			args:    []string{},
			wantErr: false,
			wantOut: "Usage:",
		},
		{
			name:    "help flag prints usage",
			args:    []string{"--help"},
			wantErr: false,
			wantOut: "__PROJECT_NAME__",
		},
		{
			name:    "version subcommand runs",
			args:    []string{"version"},
			wantErr: false,
		},
		{
			name:    "unknown command errors",
			args:    []string{"definitely-not-a-command"},
			wantErr: true,
		},
		{
			name:    "unknown flag errors",
			args:    []string{"--no-such-flag"},
			wantErr: true,
		},
		{
			name:    "log-format flag parses",
			args:    []string{"version", "--log-format", "text"},
			wantErr: false,
			check: func(t *testing.T) {
				if logFormat != "text" {
					t.Errorf("logFormat = %q, want %q", logFormat, "text")
				}
			},
		},
		{
			name:    "verbose flag parses",
			args:    []string{"version", "--verbose"},
			wantErr: false,
			check: func(t *testing.T) {
				if !verbose {
					t.Error("verbose = false, want true")
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			defer func() {
				logFormat = "__LOG_FORMAT__"
				verbose = false
				cfgFile = ""
			}()

			out := &bytes.Buffer{}
			rootCmd.SetOut(out)
			rootCmd.SetErr(out)
			rootCmd.SetArgs(tt.args)

			err := rootCmd.Execute()

			if tt.wantErr && err == nil {
				t.Fatalf("Execute(%v) = nil error, want error", tt.args)
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("Execute(%v) = %v, want nil", tt.args, err)
			}
			if tt.wantOut != "" && !strings.Contains(out.String(), tt.wantOut) {
				t.Errorf("output %q does not contain %q", out.String(), tt.wantOut)
			}
			if tt.check != nil {
				tt.check(t)
			}
		})
	}
}

func TestFindResolvesCommands(t *testing.T) {
	tests := []struct {
		name     string
		args     []string
		wantName string
	}{
		{"empty args resolve to root", []string{}, rootCmd.Name()},
		{"version resolves to version subcommand", []string{"version"}, "version"},
		{"flags alone resolve to root", []string{"--verbose"}, rootCmd.Name()},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cmd, _, err := rootCmd.Find(tt.args)
			if err != nil {
				t.Fatalf("Find(%v) error: %v", tt.args, err)
			}
			if cmd.Name() != tt.wantName {
				t.Errorf("Find(%v) = %q, want %q", tt.args, cmd.Name(), tt.wantName)
			}
		})
	}
}

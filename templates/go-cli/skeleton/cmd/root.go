package cmd

import (
	"fmt"
	"log/slog"
	"os"
	"strings"

	"__GO_MODULE__/internal/config"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var (
	cfgFile   string
	logFormat string
	verbose   bool
)

var rootCmd = &cobra.Command{
	Use:   "__PROJECT_NAME__",
	Short: "__DESCRIPTION__",
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		if err := config.Load(cfgFile); err != nil {
			return fmt.Errorf("loading config: %w", err)
		}
		setupLogging()
		slog.Info("cli.start", "command", cmd.Name())
		return nil
	},
}

// Execute runs the root command.
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "config file (default is $HOME/.__PROJECT_NAME__.yaml)")
	rootCmd.PersistentFlags().StringVar(&logFormat, "log-format", "__LOG_FORMAT__", "log format (json, text, pretty)")
	rootCmd.PersistentFlags().BoolVar(&verbose, "verbose", false, "enable verbose (debug) logging")
}

func setupLogging() {
	level := slog.LevelInfo
	if verbose {
		level = slog.LevelDebug
	}

	format := viper.GetString("log_format")
	if format == "" {
		format = logFormat
	}

	var handler slog.Handler
	switch strings.ToLower(format) {
	case "text", "pretty":
		handler = slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level})
	default:
		handler = slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: level})
	}

	slog.SetDefault(slog.New(handler))
}

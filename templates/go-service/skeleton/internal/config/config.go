package config

import (
	"fmt"
	"strings"
	"time"

	"github.com/spf13/viper"
)

// Config holds the application configuration.
type Config struct {
	Port         string        `mapstructure:"port"`
	LogFormat    string        `mapstructure:"log_format"`
	DatabaseURL  string        `mapstructure:"database_url"`
	Database     string        `mapstructure:"database"`
	ReadTimeout  time.Duration `mapstructure:"read_timeout"`
	WriteTimeout time.Duration `mapstructure:"write_timeout"`
	IdleTimeout  time.Duration `mapstructure:"idle_timeout"`
}

// Load reads configuration from the given file (if any), environment
// variables, and defaults. Environment variables are prefixed with
// the project name in uppercase with hyphens replaced by underscores.
func Load(cfgFile string) error {
	if cfgFile != "" {
		viper.SetConfigFile(cfgFile)
	} else {
		viper.SetConfigName(".__PROJECT_NAME__")
		viper.SetConfigType("yaml")
		viper.AddConfigPath(".")
		viper.AddConfigPath("$HOME")
	}

	prefix := strings.ReplaceAll(strings.ToUpper("__PROJECT_NAME__"), "-", "_")
	viper.SetEnvPrefix(prefix)
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_", "-", "_"))
	viper.AutomaticEnv()

	viper.SetDefault("port", "8080")
	viper.SetDefault("log_format", "json")
	viper.SetDefault("database", "__DATABASE__")
	viper.SetDefault("database_url", "postgres://localhost:5432/__PROJECT_NAME__?sslmode=disable")
	viper.SetDefault("read_timeout", 15*time.Second)
	viper.SetDefault("write_timeout", 15*time.Second)
	viper.SetDefault("idle_timeout", 60*time.Second)

	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok && cfgFile != "" {
			return fmt.Errorf("reading config file: %w", err)
		}
	}

	return nil
}

// Get unmarshals the current configuration into a Config struct.
func Get() (*Config, error) {
	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("unmarshaling config: %w", err)
	}
	return &cfg, nil
}

package config

import (
	"fmt"
	"strings"

	"github.com/spf13/viper"
)

// Config holds the application configuration.
type Config struct {
	LogFormat string `mapstructure:"log_format"`
	Verbose   bool   `mapstructure:"verbose"`
}

// Load reads configuration from the given file (if any), environment
// variables, and defaults. Environment variables are prefixed with
// the project name in uppercase (e.g. __PROJECT_NAME__ -> MYAPP_LOG_FORMAT
// when the project name is "myapp").
func Load(cfgFile string) error {
	if cfgFile != "" {
		viper.SetConfigFile(cfgFile)
	} else {
		viper.SetConfigName(".__PROJECT_NAME__")
		viper.SetConfigType("yaml")
		viper.AddConfigPath("$HOME")
		viper.AddConfigPath(".")
	}

	prefix := strings.ReplaceAll(strings.ToUpper("__PROJECT_NAME__"), "-", "_")
	viper.SetEnvPrefix(prefix)
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_", "-", "_"))
	viper.AutomaticEnv()

	viper.SetDefault("log_format", "__LOG_FORMAT__")
	viper.SetDefault("verbose", false)

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

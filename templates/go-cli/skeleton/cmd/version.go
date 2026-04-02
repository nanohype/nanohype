package cmd

import (
	"fmt"
	"runtime/debug"

	"github.com/spf13/cobra"
)

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print build and version information",
	Run: func(cmd *cobra.Command, args []string) {
		info, ok := debug.ReadBuildInfo()
		if !ok {
			fmt.Println("__PROJECT_NAME__ version: (unknown)")
			return
		}

		fmt.Printf("__PROJECT_NAME__ version: %s\n", info.Main.Version)
		fmt.Printf("  go: %s\n", info.GoVersion)

		for _, setting := range info.Settings {
			switch setting.Key {
			case "vcs.revision":
				fmt.Printf("  commit: %s\n", setting.Value)
			case "vcs.time":
				fmt.Printf("  built: %s\n", setting.Value)
			case "vcs.modified":
				if setting.Value == "true" {
					fmt.Println("  dirty: true")
				}
			}
		}
	},
}

func init() {
	rootCmd.AddCommand(versionCmd)
}

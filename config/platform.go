package config

import (
	"os"
	"strings"
)

// DetectRailway returns true if 3 or more environment variables with the
// "RAILWAY_" prefix are present, indicating a Railway.com deployment.
func DetectRailway() bool {
	count := 0
	for _, env := range os.Environ() {
		if strings.HasPrefix(env, "RAILWAY_") {
			count++
		}
	}
	return count >= 3
}

// CheckBlockedPlatforms returns an error if the application is running on a
// platform that is no longer supported. No platforms are currently blocked.
func CheckBlockedPlatforms() error {
	return nil
}

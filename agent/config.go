package main

import (
	"encoding/json"
	"flag"
	"log"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// agentFileConfig mirrors the fields that can be set via a config file.
// Priority order: CLI flags > config file > environment variables > built-in defaults.
//
// Supported environment variables:
//
//	AGENT_ADDR        – equivalent to --addr
//	AGENT_TOKEN       – equivalent to --token
//	AGENT_SKIP_UPDATE – equivalent to --skip-update (accepted: true/1/yes)
//
// Example agent.yaml:
//
//	addr: "my-backend.example.com:3001"
//	token: "secret-token"
//	skip_update: false
type agentFileConfig struct {
	Addr       string `yaml:"addr"        json:"addr"`
	Token      string `yaml:"token"       json:"token"`
	SkipUpdate bool   `yaml:"skip_update" json:"skip_update"`
}

func loadFileConfig(path string) (*agentFileConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	cfg := &agentFileConfig{}
	if strings.ToLower(filepath.Ext(path)) == ".json" {
		err = json.Unmarshal(data, cfg)
	} else {
		err = yaml.Unmarshal(data, cfg)
	}
	return cfg, err
}

// resolveConfig merges values from the config file and environment variables
// into the flag variables for any flag that was not explicitly set on the CLI.
func resolveConfig() {
	flagsSet := map[string]bool{}
	flag.Visit(func(f *flag.Flag) { flagsSet[f.Name] = true })

	// Locate a config file.
	cfgPath := *configFile
	if cfgPath == "" {
		for _, candidate := range []string{"agent.yaml", "agent.json"} {
			if _, err := os.Stat(candidate); err == nil {
				cfgPath = candidate
				break
			}
		}
	}

	fileCfg := &agentFileConfig{}
	if cfgPath != "" {
		loaded, err := loadFileConfig(cfgPath)
		if err != nil {
			log.Fatalf("Failed to load config file %q: %v", cfgPath, err)
		}
		fileCfg = loaded
		log.Printf("Loaded config from %s", cfgPath)
	}

	// Apply values: CLI flag wins, then config file, then env var, then default.
	if !flagsSet["addr"] {
		if fileCfg.Addr != "" {
			*addr = fileCfg.Addr
		} else if v := os.Getenv("AGENT_ADDR"); v != "" {
			*addr = v
		}
	}
	if !flagsSet["token"] {
		if fileCfg.Token != "" {
			*token = fileCfg.Token
		} else if v := os.Getenv("AGENT_TOKEN"); v != "" {
			*token = v
		}
	}
	if !flagsSet["skip-update"] {
		if fileCfg.SkipUpdate {
			*skipUpdate = true
		} else if v := os.Getenv("AGENT_SKIP_UPDATE"); v != "" {
			*skipUpdate = v == "true" || v == "1" || v == "yes"
		}
	}

	// Validate required fields
	if *addr == "" {
		log.Fatalf("addr is required. Set it via --addr flag, AGENT_ADDR environment variable, or config file")
	}
	if *token == "" {
		log.Fatalf("token is required. Set it via --token flag, AGENT_TOKEN environment variable, or config file")
	}
}

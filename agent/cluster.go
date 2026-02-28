package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"time"
)

// ClusterConfig holds the cluster configuration returned from the backend.
type ClusterConfig struct {
	EnableS3Service  bool   `json:"enableS3Service"`
	Name             string `json:"name"`
	S3AdminSecretKey string `json:"s3AdminSecretKey"`
	ClusterKey       string `json:"clusterKey"`
	// ClusterDomain is the public-facing domain for this cluster,
	// used when generating IngressRoutes and ACME certificates.
	ClusterDomain string `json:"clusterDomain"`
	// AcmeEmail is the email address used for Let's Encrypt ACME registration.
	// Overrides the ACME_EMAIL environment variable when set.
	AcmeEmail string `json:"acmeEmail"`
}

func getClusterConfig() (*ClusterConfig, error) {
	data := map[string]string{}
	jsonPayload, err := json.Marshal(data)
	if err != nil {
		log.Fatalf("Error marshalling JSON: %v", err)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	backendAddr, err := url.Parse(*addr)
	if err != nil {
		log.Fatalf("Error parsing backend address: %v", err)
	}
	u := url.URL{
		Scheme: "https",
		Host:   backendAddr.Host,
		Path:   "/api/agents/cluster-info",
	}
	req, err := http.NewRequest("GET", u.String(), bytes.NewBuffer(jsonPayload))
	if err != nil {
		log.Fatalf("Error creating request: %v", err)
	}

	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("Authorization", "Bot "+*token)
	req.Header.Add("User-Agent", "K8s-Dashboard-Agent/1.0 (+https://github.com/code-ga/k8s-dashboard)")
	req.Header.Add("Accept", "application/json")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := client.Do(req)
	if err != nil {
		log.Fatalf("Error sending request: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Fatalf("Error reading response body: %v", err)
	}

	var apiResp struct {
		Data ClusterConfig `json:"data"`
	}
	err = json.Unmarshal(body, &apiResp)
	if err != nil {
		log.Fatalf("Error unmarshalling response JSON: %v with body: %s", err, string(body))
	}

	log.Printf("Received Cluster Key: %s...", string([]rune(apiResp.Data.ClusterKey)[:5]))
	return &apiResp.Data, nil
}

func updateClusterS3Key(key string) error {
	data := map[string]string{"s3AdminSecretKey": key}
	jsonPayload, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("marshalling error: %w", err)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	u := url.URL{
		Scheme: "https",
		Host:   *addr,
		Path:   "/api/agents/cluster-config",
	}

	req, err := http.NewRequest("POST", u.String(), bytes.NewBuffer(jsonPayload))
	if err != nil {
		return fmt.Errorf("request creation error: %w", err)
	}

	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("Authorization", "Bot "+*token)

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("api returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

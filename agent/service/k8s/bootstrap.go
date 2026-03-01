package k8s

import (
	"fmt"
	"log"
	"os"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func (kc *K8sClient) EnsureGatewayInstalled() error {
	namespace := "platform-system"

	// 1. Create Namespace
	_, err := kc.Clientset.CoreV1().Namespaces().Get(kc.Context, namespace, metav1.GetOptions{})
	if err != nil {
		log.Printf("Creating namespace %s...", namespace)
		_, err = kc.Clientset.CoreV1().Namespaces().Create(kc.Context, &corev1.Namespace{
			ObjectMeta: metav1.ObjectMeta{Name: namespace},
		}, metav1.CreateOptions{})
		if err != nil {
			return fmt.Errorf("failed to create namespace: %w", err)
		}
	}

	// 2. Detect and Label Edge Nodes
	err = kc.DetectAndLabelEdgeNodes()
	if err != nil {
		log.Printf("Warning: failed to label edge nodes: %v", err)
	}

	// 3. Resolve ACME email.
	// Priority: K8sClient.AcmeEmail (from cluster config) > ACME_EMAIL env var > placeholder.
	// ACME_EMAIL is required for Let's Encrypt certificate registration.
	acmeEmail := kc.AcmeEmail
	if acmeEmail == "" {
		acmeEmail = os.Getenv("ACME_EMAIL")
	}
	if acmeEmail == "" {
		log.Printf("Warning: ACME_EMAIL not set (env or cluster config); using placeholder. " +
			"Set ACME_EMAIL env var or acmeEmail in cluster config for valid Let's Encrypt certificates.")
		acmeEmail = "admin@example.com"
	}

	// 4. Traefik CRDs & Gateway installation
	// Construct values for Traefik chart.
	// Note: expose must be an object {default: bool} in Traefik Helm chart v32+.
	// Note: certResolvers is not a valid top-level schema key in newer chart versions;
	//       ACME is configured via additionalArguments instead.
	expose := map[string]interface{}{"default": true}
	values := map[string]interface{}{
		"service": map[string]interface{}{
			"type": "LoadBalancer",
		},
		"nodeSelector": map[string]interface{}{
			"role.k8s.io/edge": "true",
		},
		"providers": map[string]interface{}{
			"kubernetesCRD": map[string]interface{}{
				"enabled": true,
			},
			"kubernetesIngress": map[string]interface{}{
				"enabled": true,
			},
		},
		"ports": map[string]interface{}{
			"web": map[string]interface{}{
				"exposedPort": 80,
				"expose":      expose,
			},
			"websecure": map[string]interface{}{
				"exposedPort": 443,
				"expose":      expose,
			},
		},
		// ACME / Let's Encrypt certificate resolver using HTTP-01 challenge.
		// Passed as CLI arguments because certResolvers is not a valid top-level
		// schema key in newer Traefik Helm chart versions.
		"additionalArguments": []any{
			"--certificatesresolvers.letsencrypt.acme.email=" + acmeEmail,
			"--certificatesresolvers.letsencrypt.acme.storage=/data/acme.json",
			"--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web",
		},
		// Persistence is required to store the ACME JSON file across restarts.
		// Without persistence, Traefik requests new certificates on every restart,
		// which can hit Let's Encrypt rate limits.
		"persistence": map[string]interface{}{
			"enabled":    true,
			"name":       "data",
			"accessMode": "ReadWriteOnce",
			"size":       "128Mi",
			"path":       "/data",
		},
	}

	// Add dynamic ports for user applications (30000-30100)
	ports := values["ports"].(map[string]interface{})
	for i := 30000; i <= 30100; i++ {
		ports[fmt.Sprintf("p%d", i)] = map[string]interface{}{
			"port":        i,
			"expose":      expose,
			"exposedPort": i,
			"protocol":    "TCP",
		}
		ports[fmt.Sprintf("u%d", i)] = map[string]interface{}{
			"port":        i,
			"expose":      expose,
			"exposedPort": i,
			"protocol":    "UDP",
		}
	}

	err = kc.InstallOrUpgradeChart("https://traefik.github.io/charts", "traefik", "traefik", namespace, values)
	if err != nil {
		return fmt.Errorf("failed to install/upgrade traefik: %w", err)
	}

	log.Printf("Traefik gateway installation initiated in %s using Helm (ACME email: %s)", namespace, acmeEmail)
	return nil
}

func (kc *K8sClient) DetectAndLabelEdgeNodes() error {
	nodes, err := kc.GetNodes()
	if err != nil {
		return err
	}

	var labeledCount int
	for _, node := range nodes.Items {
		isEdge := false
		for _, addr := range node.Status.Addresses {
			if addr.Type == corev1.NodeExternalIP {
				isEdge = true
				break
			}
		}

		// Fallback: If no external IP and this is a single node cluster OR
		// we haven't found any edge node yet, mark it.
		// For hackathon, if it's the only node or has no control-plane label.
		if !isEdge {
			_, isMaster := node.Labels["node-role.kubernetes.io/control-plane"]
			if !isMaster {
				isEdge = true
			}
		}

		if isEdge {
			if node.Labels == nil {
				node.Labels = make(map[string]string)
			}
			if node.Labels["role.k8s.io/edge"] != "true" {
				node.Labels["role.k8s.io/edge"] = "true"
				_, err := kc.Clientset.CoreV1().Nodes().Update(kc.Context, &node, metav1.UpdateOptions{})
				if err != nil {
					log.Printf("Failed to update node %s: %v", node.Name, err)
				} else {
					labeledCount++
				}
			} else {
				labeledCount++
			}
		}
	}

	log.Printf("Labeled %d edge nodes", labeledCount)
	return nil
}

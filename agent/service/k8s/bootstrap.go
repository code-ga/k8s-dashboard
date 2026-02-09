package k8s

import (
	"fmt"
	"log"

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

	// 3. Traefik CRDs & Gateway installation
	// Construct values for Traefik chart
	values := map[string]interface{}{
		"service": map[string]interface{}{
			"type": "LoadBalancer",
		},
		"nodeSelector": map[string]string{
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
				"expose":      true,
			},
			"websecure": map[string]interface{}{
				"exposedPort": 443,
				"expose":      true,
			},
		},
	}

	// Add dynamic ports for user applications (30000-30100)
	ports := values["ports"].(map[string]interface{})
	for i := 30000; i <= 30100; i++ {
		ports[fmt.Sprintf("p%d", i)] = map[string]interface{}{
			"port":        i,
			"expose":      true,
			"exposedPort": i,
			"protocol":    "TCP",
		}
		ports[fmt.Sprintf("u%d", i)] = map[string]interface{}{
			"port":        i,
			"expose":      true,
			"exposedPort": i,
			"protocol":    "UDP",
		}
	}

	err = kc.InstallOrUpgradeChart("https://traefik.github.io/charts", "traefik", "traefik", namespace, values)
	if err != nil {
		return fmt.Errorf("failed to install/upgrade traefik: %w", err)
	}

	log.Printf("Traefik gateway installation initiated in %s using Helm", namespace)
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

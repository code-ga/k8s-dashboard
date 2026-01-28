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
	manifest := kc.getTraefikManifest(namespace)
	err = kc.ApplyManifest(manifest)
	if err != nil {
		return fmt.Errorf("failed to apply traefik manifest: %w", err)
	}

	log.Printf("Traefik gateway installation initiated in %s", namespace)
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

func (kc *K8sClient) getTraefikManifest(namespace string) string {
	entrypointsArgs := `--entrypoints.web.address=:80 --entrypoints.websecure.address=:443`
	for i := 30000; i <= 30100; i++ {
		entrypointsArgs += fmt.Sprintf(" --entrypoints.p%d.address=:%d", i, i)
		entrypointsArgs += fmt.Sprintf(" --entrypoints.u%d.address=:%d/udp", i, i)
	}

	return fmt.Sprintf(`
apiVersion: v1
kind: ServiceAccount
metadata:
  name: traefik-ingress-controller
  namespace: %s
---
kind: ClusterRole
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: traefik-ingress-controller
rules:
  - apiGroups: [""]
    resources: ["services", "endpoints", "secrets"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["extensions", "networking.k8s.io"]
    resources: ["ingresses", "ingressclasses"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["traefik.io"]
    resources: ["ingressroutes", "ingressroutetcps", "ingressrouteudps", "middlewares", "tlsoptions", "tlsstores", "traefikservices", "serverstransports"]
    verbs: ["get", "list", "watch"]
---
kind: ClusterRoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: traefik-ingress-controller
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: traefik-ingress-controller
subjects:
  - kind: ServiceAccount
    name: traefik-ingress-controller
    namespace: %s
---
kind: Deployment
apiVersion: apps/v1
metadata:
  name: traefik
  namespace: %s
  labels:
    app: traefik
spec:
  replicas: 1
  selector:
    matchLabels:
      app: traefik
  template:
    metadata:
      labels:
        app: traefik
    spec:
      serviceAccountName: traefik-ingress-controller
      nodeSelector:
        role.k8s.io/edge: "true"
      containers:
        - name: traefik
          image: traefik:v3.1
          args:
            - --providers.kubernetesingress
            - --providers.kubernetescrd
            - %s
          ports:
            - name: web
              containerPort: 80
            - name: websecure
              containerPort: 443
---
kind: Service
apiVersion: v1
metadata:
  name: traefik
  namespace: %s
spec:
  type: LoadBalancer
  selector:
    app: traefik
  ports:
    - name: web
      port: 80
      targetPort: 80
    - name: websecure
      port: 443
      targetPort: 443
`, namespace, namespace, namespace, entrypointsArgs, namespace)
}

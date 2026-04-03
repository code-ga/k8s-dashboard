package k8s

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"k8s.io/client-go/discovery"
	"k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	_ "k8s.io/client-go/plugin/pkg/client/auth"

	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/version"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/restmapper"
	"k8s.io/client-go/tools/clientcmd"
)

type K8sClient struct {
	// Add fields as necessary for your K8s client
	Context         context.Context
	Clientset       *kubernetes.Clientset
	DynamicClient   dynamic.Interface // <--- Added this to handle CRDs like HelmChart
	DiscoveryClient discovery.DiscoveryInterface
	RESTMapper      meta.RESTMapper
	RestConfig      *rest.Config
	ClusterKey      string
	// AcmeEmail is the Let's Encrypt registration email used by EnsureGatewayInstalled.
	// When set it takes priority over the ACME_EMAIL environment variable.
	AcmeEmail string
}

func NewK8sClient(clusterKey string) (*K8sClient, error) {
	log.Printf("[K8sClient] Creating new K8sClient for clusterKey: %s", clusterKey)

	// Initialize and return a new K8sClient

	// if client run in cluster, use in-cluster config
	// else use kubeconfig file
	var config *rest.Config
	var err error
	var configSource string

	// 1. Determine Config (In-Cluster vs Local)
	if _, exists := os.LookupEnv("KUBERNETES_SERVICE_HOST"); exists {
		log.Printf("[K8sClient] Using in-cluster config")
		config, err = rest.InClusterConfig()
		configSource = "in-cluster"
	} else {
		if _, exists := os.LookupEnv("KUBECONFIG"); exists {
			log.Printf("[K8sClient] Using kubeconfig from KUBECONFIG env: %s", os.Getenv("KUBECONFIG"))
			config, err = clientcmd.BuildConfigFromFlags("", os.Getenv("KUBECONFIG"))
			configSource = "KUBECONFIG env"
		} else {
			// Check for k3s kubeconfig
			k3sConfigPath := "/etc/rancher/k3s/k3s.yaml"
			if _, err := os.Stat(k3sConfigPath); err == nil {
				log.Printf("[K8sClient] Using k3s kubeconfig: %s", k3sConfigPath)
				config, err = clientcmd.BuildConfigFromFlags("", k3sConfigPath)
				configSource = "k3s"
			} else {
				homeDir, _ := os.UserHomeDir()
				kubeconfigPath := filepath.Join(homeDir, ".kube", "config")
				log.Printf("[K8sClient] Using default kubeconfig: %s", kubeconfigPath)
				config, err = clientcmd.BuildConfigFromFlags("", kubeconfigPath)
				configSource = "default"
			}
		}
	}

	if err != nil {
		return nil, fmt.Errorf("failed to load kubeconfig: %w", err)
	}

	log.Printf("[K8sClient] Config source: %s", configSource)

	// 2. Initialize Standard Client
	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create clientset: %w", err)
	}
	log.Printf("[K8sClient] Clientset initialized")

	// 3. Initialize Dynamic Client (Required for HelmChart CRDs)
	dynClient, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create dynamic client: %w", err)
	}
	log.Printf("[K8sClient] Dynamic client initialized")

	// 4. Initialize Discovery Client (Required for Generic Deletion)
	discoClient, err := discovery.NewDiscoveryClientForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create discovery client: %w", err)
	}
	log.Printf("[K8sClient] Discovery client initialized")

	// 5. Initialize RESTMapper (Required for dynamic GVR resolution)
	// We need a cached discovery client for the mapper
	cachedDiscovery := memory.NewMemCacheClient(discoClient)
	mapper := restmapper.NewDeferredDiscoveryRESTMapper(cachedDiscovery)
	log.Printf("[K8sClient] RESTMapper initialized")

	log.Printf("[K8sClient] K8sClient created successfully")

	return &K8sClient{
		Clientset:       clientset,
		DynamicClient:   dynClient,
		DiscoveryClient: discoClient,
		RESTMapper:      mapper,
		Context:         context.Background(),
		RestConfig:      config,
		ClusterKey:      clusterKey,
	}, nil
}

func (kc *K8sClient) GetClientset() *kubernetes.Clientset {
	log.Printf("[K8sClient] GetClientset called")
	return kc.Clientset
}

func (kc *K8sClient) GetRestConfig() (*rest.Config, error) {
	log.Printf("[K8sClient] GetRestConfig called")
	// if client run in cluster, use in-cluster config
	// else use kubeconfig file
	if _, exists := os.LookupEnv("KUBERNETES_SERVICE_HOST"); exists {
		log.Printf("[K8sClient] Using in-cluster config")
		return rest.InClusterConfig()
	}
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	kubeconfigPath := filepath.Join(homeDir, ".kube", "config")
	log.Printf("[K8sClient] Using kubeconfig: %s", kubeconfigPath)
	return clientcmd.BuildConfigFromFlags("", kubeconfigPath)
}

func (kc *K8sClient) Close() error {
	// Clean up resources if necessary
	return nil
}

func (kc *K8sClient) Ping() error {
	log.Printf("[K8sClient] Ping called - attempting to reach API server")
	_, err := kc.Clientset.ServerVersion()
	if err != nil {
		log.Printf("[K8sClient] Ping failed: %v", err)
		return err
	}
	log.Printf("[K8sClient] Ping succeeded")
	return nil
}

func (kc *K8sClient) ClientInfo() (*version.Info, error) {
	log.Printf("[K8sClient] ClientInfo called - retrieving server version")
	versionInfo, err := kc.Clientset.ServerVersion()
	if err != nil {
		log.Printf("[K8sClient] Failed to get server version: %v", err)
		return nil, err
	}
	log.Printf("[K8sClient] Server version: %s", versionInfo.String())
	return versionInfo, nil
}

func (kc *K8sClient) GetClusterDomain() (string, error) {
	log.Printf("[K8sClient] GetClusterDomain called - retrieving cluster domain")
	// Attempt to get the cluster domain from the API server
	corefile, err := kc.Clientset.CoreV1().ConfigMaps("kube-system").Get(kc.Context, "coredns", metav1.GetOptions{})
	if err != nil {
		log.Printf("[K8sClient] Failed to get cluster domain: %v", err)
		return "", err
	}

	// Extract cluster domain from Corefile data
	if corefile.Data != nil {
		if corefile.Data["Corefile"] != "" {
			// Parse Corefile to extract cluster domain
			lines := strings.Split(corefile.Data["Corefile"], "\n")
			for _, line := range lines {
				if strings.Contains(line, "kubernetes") && strings.Contains(line, "cluster.local") {
					// Example line: "kubernetes cluster.local in-addr.arpa ip6.arpa { ... }"
					parts := strings.Fields(line)
					for i, part := range parts {
						if part == "kubernetes" && i+1 < len(parts) {
							log.Printf("[K8sClient] Cluster domain: %s", parts[i+1])
							return parts[i+1], nil
						}
					}
				}
			}
		}
	}
	log.Printf("[K8sClient] Using default cluster domain: cluster.local")
	return "cluster.local", nil // default fallback
}

type EventInfo struct {
	LastSeen  string `json:"lastSeen"`
	Type      string `json:"type"`
	Reason    string `json:"reason"`
	Message   string `json:"message"`
	Object    string `json:"object"`
	Namespace string `json:"namespace"`
}

func (kc *K8sClient) GetAllEvents(ctx context.Context) (string, error) {
	log.Printf("[K8sClient] GetAllEvents called")
	events, err := kc.Clientset.CoreV1().Events("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to list all events: %w", err)
	}

	log.Printf("[K8sClient] Retrieved %d events", len(events.Items))

	resultEvents := make([]EventInfo, 0)
	for _, e := range events.Items {
		lastSeen := e.LastTimestamp.Time.String()
		if e.LastTimestamp.IsZero() {
			if !e.EventTime.IsZero() {
				lastSeen = e.EventTime.Time.String()
			} else {
				lastSeen = e.CreationTimestamp.Time.String()
			}
		}
		resultEvents = append(resultEvents, EventInfo{
			LastSeen:  lastSeen,
			Type:      e.Type,
			Reason:    e.Reason,
			Message:   e.Message,
			Object:    fmt.Sprintf("%s/%s", e.InvolvedObject.Kind, e.InvolvedObject.Name),
			Namespace: e.Namespace,
		})
	}

	jsonData, err := json.Marshal(resultEvents)
	if err != nil {
		return "", fmt.Errorf("failed to marshal all events: %w", err)
	}

	return string(jsonData), nil
}

func (kc *K8sClient) DescribeResource(namespace, name, kind string) (string, error) {
	log.Printf("[K8sClient] DescribeResource called for namespace=%s, name=%s, kind=%s", namespace, name, kind)
	// 1. Fetch Events
	fieldSelector := fmt.Sprintf("involvedObject.name=%s,involvedObject.kind=%s", name, kind)
	events, err := kc.Clientset.CoreV1().Events(namespace).List(kc.Context, metav1.ListOptions{
		FieldSelector: fieldSelector,
	})
	if err != nil {
		return "", fmt.Errorf("failed to list events: %w", err)
	}

	resultEvents := make([]EventInfo, 0)
	for _, e := range events.Items {
		lastSeen := e.LastTimestamp.Time.String()
		if e.LastTimestamp.IsZero() {
			if !e.EventTime.IsZero() {
				lastSeen = e.EventTime.Time.String()
			} else {
				lastSeen = e.CreationTimestamp.Time.String()
			}
		}
		resultEvents = append(resultEvents, EventInfo{
			LastSeen:  lastSeen,
			Type:      e.Type,
			Reason:    e.Reason,
			Message:   e.Message,
			Object:    fmt.Sprintf("%s/%s", e.InvolvedObject.Kind, e.InvolvedObject.Name),
			Namespace: e.Namespace,
		})
	}

	// 2. Fetch basic metadata/status
	var resourceData interface{}
	if strings.ToLower(kind) == "pod" {
		pod, err := kc.Clientset.CoreV1().Pods(namespace).Get(kc.Context, name, metav1.GetOptions{})
		if err == nil {
			resourceData = pod
		}
	} else if strings.ToLower(kind) == "deployment" {
		dep, err := kc.Clientset.AppsV1().Deployments(namespace).Get(kc.Context, name, metav1.GetOptions{})
		if err == nil {
			resourceData = dep
		}
	}

	res := map[string]interface{}{
		"kind":      kind,
		"name":      name,
		"namespace": namespace,
		"events":    resultEvents,
		"resource":  resourceData,
	}

	jsonData, err := json.Marshal(res)
	if err != nil {
		return "", fmt.Errorf("failed to marshal describe data: %w", err)
	}

	return string(jsonData), nil
}

// RedeployDeployment triggers a rolling restart of a deployment by updating its pod template annotations.
func (kc *K8sClient) RedeployDeployment(ctx context.Context, namespace, name string) error {
	log.Printf("[K8sClient] RedeployDeployment called for namespace=%s, name=%s", namespace, name)
	deployment, err := kc.Clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		log.Printf("[K8sClient] Failed to get deployment: %v", err)
		return err
	}

	if deployment.Spec.Template.Annotations == nil {
		deployment.Spec.Template.Annotations = make(map[string]string)
	}

	deployment.Spec.Template.Annotations["kubectl.kubernetes.io/restartedAt"] = time.Now().Format(time.RFC3339)

	log.Printf("[K8sClient] Updating deployment with restart annotation")
	_, err = kc.Clientset.AppsV1().Deployments(namespace).Update(ctx, deployment, metav1.UpdateOptions{})
	if err != nil {
		log.Printf("[K8sClient] Failed to update deployment: %v", err)
		return err
	}
	log.Printf("[K8sClient] Deployment redeployed successfully")
	return nil
}

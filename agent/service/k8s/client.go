package k8s

import (
	"context"
	"encoding/json"
	"fmt"
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
	// Initialize and return a new K8sClient

	// if client run in cluster, use in-cluster config
	// else use kubeconfig file
	var config *rest.Config
	var err error

	// 1. Determine Config (In-Cluster vs Local)
	if _, exists := os.LookupEnv("KUBERNETES_SERVICE_HOST"); exists {
		config, err = rest.InClusterConfig()
	} else {
		if _, exists := os.LookupEnv("KUBECONFIG"); exists {
			config, err = clientcmd.BuildConfigFromFlags("", os.Getenv("KUBECONFIG"))
		} else {
			// Check for k3s kubeconfig
			k3sConfigPath := "/etc/rancher/k3s/k3s.yaml"
			if _, err := os.Stat(k3sConfigPath); err == nil {
				config, err = clientcmd.BuildConfigFromFlags("", k3sConfigPath)
			} else {
				homeDir, _ := os.UserHomeDir()
				kubeconfigPath := filepath.Join(homeDir, ".kube", "config")
				config, err = clientcmd.BuildConfigFromFlags("", kubeconfigPath)
			}
		}
	}

	if err != nil {
		return nil, fmt.Errorf("failed to load kubeconfig: %w", err)
	}

	// 2. Initialize Standard Client
	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create clientset: %w", err)
	}

	// 3. Initialize Dynamic Client (Required for HelmChart CRDs)
	dynClient, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create dynamic client: %w", err)
	}

	// 4. Initialize Discovery Client (Required for Generic Deletion)
	discoClient, err := discovery.NewDiscoveryClientForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create discovery client: %w", err)
	}

	// 5. Initialize RESTMapper (Required for dynamic GVR resolution)
	// We need a cached discovery client for the mapper
	cachedDiscovery := memory.NewMemCacheClient(discoClient)
	mapper := restmapper.NewDeferredDiscoveryRESTMapper(cachedDiscovery)

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
	return kc.Clientset
}

func (kc *K8sClient) GetRestConfig() (*rest.Config, error) {
	// if client run in cluster, use in-cluster config
	// else use kubeconfig file
	if _, exists := os.LookupEnv("KUBERNETES_SERVICE_HOST"); exists {
		return rest.InClusterConfig()
	}
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	kubeconfigPath := filepath.Join(homeDir, ".kube", "config")
	return clientcmd.BuildConfigFromFlags("", kubeconfigPath)
}

func (kc *K8sClient) Close() error {
	// Clean up resources if necessary
	return nil
}

func (kc *K8sClient) Ping() error {
	// Implement a simple ping to the Kubernetes API server
	_, err := kc.Clientset.ServerVersion()
	return err
}

func (kc *K8sClient) ClientInfo() (*version.Info, error) {
	versionInfo, err := kc.Clientset.ServerVersion()
	if err != nil {
		return nil, err
	}
	return versionInfo, nil
}

func (kc *K8sClient) GetClusterDomain() (string, error) {
	// Attempt to get the cluster domain from the API server
	corefile, err := kc.Clientset.CoreV1().ConfigMaps("kube-system").Get(kc.Context, "coredns", metav1.GetOptions{})
	if err != nil {
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
							return parts[i+1], nil
						}
					}
				}
			}
		}
	}
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
	events, err := kc.Clientset.CoreV1().Events("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to list all events: %w", err)
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

	jsonData, err := json.Marshal(resultEvents)
	if err != nil {
		return "", fmt.Errorf("failed to marshal all events: %w", err)
	}

	return string(jsonData), nil
}

func (kc *K8sClient) DescribeResource(namespace, name, kind string) (string, error) {
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
	deployment, err := kc.Clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return err
	}

	if deployment.Spec.Template.Annotations == nil {
		deployment.Spec.Template.Annotations = make(map[string]string)
	}

	deployment.Spec.Template.Annotations["kubectl.kubernetes.io/restartedAt"] = time.Now().Format(time.RFC3339)

	_, err = kc.Clientset.AppsV1().Deployments(namespace).Update(ctx, deployment, metav1.UpdateOptions{})
	return err
}

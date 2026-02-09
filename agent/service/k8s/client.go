package k8s

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"k8s.io/client-go/discovery"
	"k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	_ "k8s.io/client-go/plugin/pkg/client/auth"

	"k8s.io/apimachinery/pkg/api/meta"
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
			homeDir, _ := os.UserHomeDir()
			kubeconfigPath := filepath.Join(homeDir, ".kube", "config")
			config, err = clientcmd.BuildConfigFromFlags("", kubeconfigPath)
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

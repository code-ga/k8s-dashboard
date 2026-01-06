package k8s

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"k8s-dashboard/agents/infra/garageHQ"
	"k8s-dashboard/agents/infra/traefik"
	"os"
	"path/filepath"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/util/yaml"
	"k8s.io/apimachinery/pkg/version"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	_ "k8s.io/client-go/plugin/pkg/client/auth"

	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/remotecommand"
)

type K8sClient struct {
	// Add fields as necessary for your K8s client
	Context       context.Context
	Clientset     *kubernetes.Clientset
	DynamicClient dynamic.Interface // <--- Added this to handle CRDs like HelmChart
	RestConfig    *rest.Config
}

func NewK8sClient() (*K8sClient, error) {
	// Initialize and return a new K8sClient

	// if client run in cluster, use in-cluster config
	// else use kubeconfig file
	var config *rest.Config
	var err error

	// 1. Determine Config (In-Cluster vs Local)
	if _, exists := os.LookupEnv("KUBERNETES_SERVICE_HOST"); exists {
		config, err = rest.InClusterConfig()
	} else {
		homeDir, _ := os.UserHomeDir()
		kubeconfigPath := filepath.Join(homeDir, ".kube", "config")
		config, err = clientcmd.BuildConfigFromFlags("", kubeconfigPath)
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

	return &K8sClient{
		Clientset:     clientset,
		DynamicClient: dynClient,
		Context:       context.Background(),
		RestConfig:    config,
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

func (kc *K8sClient) GetPods(namespace string) (*corev1.PodList, error) {
	pods, err := kc.Clientset.CoreV1().Pods(namespace).List(kc.Context, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	return pods, nil
}

func (kc *K8sClient) GetNamespaces() (*corev1.NamespaceList, error) {
	namespaces, err := kc.Clientset.CoreV1().Namespaces().List(kc.Context, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	return namespaces, nil
}

func (kc *K8sClient) GetNodes() (*corev1.NodeList, error) {
	nodes, err := kc.Clientset.CoreV1().Nodes().List(kc.Context, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	return nodes, nil
}

// get cluster info like used resources, total resources etc.
func (kc *K8sClient) GetClusterInfo() (map[string]string, error) {
	info := make(map[string]string)
	nodes, err := kc.GetNodes()
	if err != nil {
		return nil, err
	}
	var totalCPU, totalMemory int64
	for _, node := range nodes.Items {
		cpu := node.Status.Capacity[corev1.ResourceCPU]
		memory := node.Status.Capacity[corev1.ResourceMemory]
		totalCPU += cpu.MilliValue()
		totalMemory += memory.Value() / (1024 * 1024) // in Mi
	}
	info["totalCPU(millicores)"] = string(totalCPU)
	info["totalMemory(Mi)"] = string(totalMemory)

	// get used resources
	usedCPU, usedMemory, err := kc.GetUsedResources()
	if err != nil {
		return nil, err
	}
	info["usedCPU(millicores)"] = string(usedCPU)
	info["usedMemory(Mi)"] = string(usedMemory)
	return info, nil
}

func (kc *K8sClient) GetUsedResources() (int64, int64, error) {
	var usedCPU, usedMemory int64
	pods, err := kc.Clientset.CoreV1().Pods("").List(kc.Context, metav1.ListOptions{})
	if err != nil {
		return 0, 0, err
	}
	for _, pod := range pods.Items {
		for _, container := range pod.Spec.Containers {
			if cpuReq, ok := container.Resources.Requests[corev1.ResourceCPU]; ok {
				usedCPU += cpuReq.MilliValue()
			}
			if memReq, ok := container.Resources.Requests[corev1.ResourceMemory]; ok {
				usedMemory += memReq.Value() / (1024 * 1024) // in Mi
			}
		}
	}
	return usedCPU, usedMemory, nil
}

// ApplyManifest accepts a raw YAML string (containing one or multiple documents)
// and applies them to the cluster using the Dynamic Client.
func (k *K8sClient) ApplyManifest(yamlContent string) error {
	decoder := yaml.NewYAMLOrJSONDecoder(bytes.NewReader([]byte(yamlContent)), 4096)

	for {
		// 1. Decode YAML into Unstructured map
		var rawObj unstructured.Unstructured
		if err := decoder.Decode(&rawObj); err != nil {
			if err == io.EOF {
				break // End of YAML file
			}
			return fmt.Errorf("failed to decode YAML: %w", err)
		}

		// Skip empty documents
		if len(rawObj.Object) == 0 {
			continue
		}

		// 2. Get GVR (Group Version Resource) mapping
		// This tells the client "where" to send this object (e.g., /apis/helm.cattle.io/v1/namespaces/x/helmcharts)
		gvk := rawObj.GroupVersionKind()

		// Simple mapping logic (In production, use RESTMapper for 100% accuracy, but this works for standard CRDs)
		// We convert Kind "HelmChart" -> Resource "helmcharts"
		gvr := schema.GroupVersionResource{
			Group:    gvk.Group,
			Version:  gvk.Version,
			Resource: toPlural(gvk.Kind),
		}

		// 3. Prepare the Resource Interface
		var dr dynamic.ResourceInterface
		ns := rawObj.GetNamespace()
		if ns == "" {
			// Cluster-scoped resource
			dr = k.DynamicClient.Resource(gvr)
		} else {
			// Namespaced resource
			dr = k.DynamicClient.Resource(gvr).Namespace(ns)
		}

		// 4. Apply Logic (Create or Update)
		name := rawObj.GetName()
		fmt.Printf("Applying %s/%s (%s)...\n", gvk.Kind, name, ns)

		// Try to Get existing resource
		existing, err := dr.Get(k.Context, name, metav1.GetOptions{})
		if err != nil {
			if errors.IsNotFound(err) {
				// CREATE
				_, err = dr.Create(k.Context, &rawObj, metav1.CreateOptions{})
				if err != nil {
					return fmt.Errorf("failed to create %s: %w", name, err)
				}
				fmt.Printf("Created %s\n", name)
			} else {
				return fmt.Errorf("failed to get existing %s: %w", name, err)
			}
		} else {
			// UPDATE (Optimistic Locking)
			// We must set the ResourceVersion of the new obj to match existing to allow update
			rawObj.SetResourceVersion(existing.GetResourceVersion())
			_, err = dr.Update(k.Context, &rawObj, metav1.UpdateOptions{})
			if err != nil {
				return fmt.Errorf("failed to update %s: %w", name, err)
			}
			fmt.Printf("Updated %s\n", name)
		}
	}
	return nil
}

// Simple helper to pluralize Kinds (HelmChart -> helmcharts)
// A real implementation would use discovery client, but this is safe for your known types.
func toPlural(kind string) string {
	switch kind {
	case "HelmChart":
		return "helmcharts"
	case "Cluster":
		return "clusters" // for CNPG
	default:
		// Fallback: simple English pluralization
		return kind + "s"
	}
}

type BootstrapConfig struct {
	EnableGarageHQ   bool
	ClusterDomain    string
	S3AdminSecretKey string
	UpdateS3Key      func(string) error
}

func (k *K8sClient) DeployGarageHQ(ns string, host string) error {
	k.Clientset.CoreV1().ConfigMaps(ns).Create(k.Context, garageHQ.GarageConfig(garageHQ.GarageHQConfig{
		AdminToken: os.Getenv("GARAGE_ADMIN_TOKEN"),
	}), metav1.CreateOptions{})
	k.Clientset.CoreV1().Services(ns).Create(k.Context, garageHQ.GarageHeadlessSvc(), metav1.CreateOptions{})
	k.Clientset.AppsV1().StatefulSets(ns).Create(k.Context, garageHQ.GarageStatefulSet(), metav1.CreateOptions{})
	// Add Traefik IngressRoute for S3 access if needed
	// ingressRoute := traefik.S3IngressRoute(
	// 	"garage-s3-ingressroute",
	// 	ns,
	// 	host,
	// 	"garage-headless",
	// )
	ingressRoute := traefik.S3WildcardIngressRoute(
		ns,
		"garage-headless",
		host,
	)
	unstructuredObj := &unstructured.Unstructured{
		Object: ingressRoute.Object,
	}
	gvr := schema.GroupVersionResource{
		Group:    "traefik.io",
		Version:  "v1alpha1",
		Resource: "ingressroutes",
	}
	dr := k.DynamicClient.Resource(gvr).Namespace(ns)
	_, err := dr.Create(k.Context, unstructuredObj, metav1.CreateOptions{}) // Handle already exists potentially?
	if err != nil {
		if !errors.IsAlreadyExists(err) {
			return fmt.Errorf("failed to create Traefik IngressRoute: %w", err)
		}
	}
	return nil
}

func (k *K8sClient) WaitForDeployment(namespace, name string, timeout time.Duration) error {
	startTime := time.Now()
	for {
		deployment, err := k.Clientset.AppsV1().Deployments(namespace).Get(k.Context, name, metav1.GetOptions{})
		if err != nil {
			return fmt.Errorf("failed to get deployment: %w", err)
		}

		if deployment.Status.ReadyReplicas == *deployment.Spec.Replicas {
			return nil
		}

		if time.Since(startTime) > timeout {
			return fmt.Errorf("timeout waiting for deployment %s to be ready", name)
		}

		time.Sleep(5 * time.Second)
	}
}

func (k *K8sClient) BootstrapSystem(config BootstrapConfig) error {
	// 1. GarageHQ (S3) Manifest
	if config.EnableGarageHQ {
		// Check if namespace exists, if not create it
		garageNamespace := "garage-system"
		_, err := k.Clientset.CoreV1().Namespaces().Get(k.Context, garageNamespace, metav1.GetOptions{})
		if err != nil {
			if errors.IsNotFound(err) {
				_, err = k.Clientset.CoreV1().Namespaces().Create(k.Context, &corev1.Namespace{
					ObjectMeta: metav1.ObjectMeta{
						Name: garageNamespace,
					},
				}, metav1.CreateOptions{})
				if err != nil {
					return fmt.Errorf("failed to create garage-system namespace: %w", err)
				}
			} else {
				return fmt.Errorf("failed to get garage-system namespace: %w", err)
			}
		}

		// Check if GarageHQ is already deployed
		garageStatefulSet, err := k.Clientset.AppsV1().StatefulSets(garageNamespace).Get(k.Context, "garage", metav1.GetOptions{})
		garageDeployed := err == nil

		// Logic:
		// 1. If cluster info don't have s3AdminSecretKey
		//    a. If already have deployment -> create new key via garage cli -> update backend
		//    b. If don't have deployment -> deploy -> create new key -> update backend
		// 2. If cluster info HAVE s3AdminSecretKey
		//    a. If don't have deployment -> deploy -> assume new key needed or try to match? (User says deploy with key, but for now we create new)
		//    b. If have deployment ->
		//          If key mismatch -> create new key -> update backend

		if !garageDeployed {
			// Case 1b & 2a: Not deployed
			fmt.Println("Deploying GarageHQ...")
			if err := k.DeployGarageHQ(garageNamespace, config.ClusterDomain); err != nil {
				return fmt.Errorf("failed to deploy GarageHQ: %w", err)
			}
			fmt.Println("GarageHQ deployed successfully.")

			// Wait for GarageHQ to be ready (Pod running)
			fmt.Println("Waiting for GarageHQ to be ready...")
			if err := k.WaitForPodRunning(garageNamespace, "garage-0", 5*time.Minute); err != nil {
				return fmt.Errorf("failed to wait for GarageHQ pod: %w", err)
			}

			// Freshly deployed.
			// Regardless of whether we have S3AdminSecretKey or not, we likely need to create one
			// because we can't easily inject it into Garage Config (Store is internal).
			// If we could import, we would. Assuming we create new for now.

			newKey, err := k.CreateGarageKey(garageNamespace)
			if err != nil {
				return fmt.Errorf("failed to create garage key: %w", err)
			}

			// Always update backend with the new key (whether it was empty or mismatched/overwritten)
			if config.UpdateS3Key != nil {
				if err := config.UpdateS3Key(newKey); err != nil {
					fmt.Printf("Failed to update backend with new s3 key: %v\n", err)
				}
			}

		} else {
			// Already deployed.
			// Wait for it to be accessible
			if err := k.WaitForPodRunning(garageNamespace, "garage-0", 5*time.Minute); err != nil {
				return fmt.Errorf("failed to wait for GarageHQ pod: %w", err)
			}

			// Check existing key
			currentSecret, err := k.GetGarageAccessKey(garageNamespace)
			if err != nil {
				fmt.Printf("Error checking key: %v\n", err)
				// Assuming no key or error, proceed to create?
			}

			if config.S3AdminSecretKey == "" {
				// Case 1a: No backend key.
				if currentSecret != "" {
					// Found existing in Pod, update Backend
					if config.UpdateS3Key != nil {
						config.UpdateS3Key(currentSecret)
					}
				} else {
					// No key in Pod, create new
					newKey, err := k.CreateGarageKey(garageNamespace)
					if err == nil && config.UpdateS3Key != nil {
						config.UpdateS3Key(newKey)
					}
				}
			} else {
				// Case 2b: Have backend key.
				if currentSecret != config.S3AdminSecretKey {
					// Mismatch -> Create New -> Update Backend
					// "if both have but not equal we do like when have deployment but dont have s3AdminSecretKey"
					newKey, err := k.CreateGarageKey(garageNamespace)
					if err == nil && config.UpdateS3Key != nil {
						config.UpdateS3Key(newKey)
					}
				}
				// If equal, all good.
			}
		}

	}

	return nil
}

func (k *K8sClient) ExecInPod(namespace, podName, containerName string, cmd []string) (string, string, error) {
	req := k.Clientset.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(podName).
		Namespace(namespace).
		SubResource("exec")

	option := &corev1.PodExecOptions{
		Command: cmd,
		Stdin:   false,
		Stdout:  true,
		Stderr:  true,
		TTY:     false,
	}
	if containerName != "" {
		option.Container = containerName
	}

	req.VersionedParams(
		option,
		scheme.ParameterCodec,
	)

	exec, err := remotecommand.NewSPDYExecutor(k.RestConfig, "POST", req.URL())
	if err != nil {
		return "", "", err
	}

	var stdout, stderr bytes.Buffer
	err = exec.Stream(remotecommand.StreamOptions{
		Stdout: &stdout,
		Stderr: &stderr,
	})

	return stdout.String(), stderr.String(), err
}

func (k *K8sClient) WaitForPodRunning(namespace, podName string, timeout time.Duration) error {
	startTime := time.Now()
	for {
		pod, err := k.Clientset.CoreV1().Pods(namespace).Get(k.Context, podName, metav1.GetOptions{})
		if err == nil && pod.Status.Phase == corev1.PodRunning {
			return nil
		}
		if time.Since(startTime) > timeout {
			return fmt.Errorf("timeout waiting for pod %s", podName)
		}
		time.Sleep(5 * time.Second)
	}
}

func (k *K8sClient) GetGarageAccessKey(namespace string) (string, error) {
	// Execute 'garage key list'
	// Output format usually:
	// Key ID         | Secret key                               | Name
	// GK...          | ...                                      | ...
	stdout, _, err := k.ExecInPod(namespace, "garage-0", "garage", []string{"garage", "key", "list"})
	if err != nil {
		return "", err
	}

	lines := strings.Split(stdout, "\n")
	for _, line := range lines {
		if strings.Contains(line, "GK") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				if parts[0] == "Key" {
					continue
				}
				return parts[1], nil
			}
		}
	}
	return "", nil
}

func (k *K8sClient) CreateGarageKey(namespace string) (string, error) {
	// garage key create admin
	stdout, _, err := k.ExecInPod(namespace, "garage-0", "garage", []string{"garage", "key", "create", "admin"})
	if err != nil {
		// Maybe it already exists? "Error: key already exists"
		// If so, we should just get it?
		// But instructions say "create new key".
		// If "admin" key exists, we might need to delete it first or use a different name?
		// Retrying with random name? Or deleting 'admin' first?
		// I'll try to delete 'admin' key first to ensuring 'new one'.
		k.ExecInPod(namespace, "garage-0", "garage", []string{"garage", "key", "delete", "admin"})
		// Retry create
		stdout, _, err = k.ExecInPod(namespace, "garage-0", "garage", []string{"garage", "key", "create", "admin"})
		if err != nil {
			return "", err
		}
	}

	// Output:
	// Key ID: GK...
	// Secret key: ...

	var secret string
	lines := strings.Split(stdout, "\n")
	for _, line := range lines {
		if strings.Contains(line, "Secret key:") {
			parts := strings.Split(line, ":")
			if len(parts) > 1 {
				secret = strings.TrimSpace(parts[1])
			}
		}
	}

	if secret != "" {
		return secret, nil
	}
	return "", fmt.Errorf("could not parse secret from output: %s", stdout)
}

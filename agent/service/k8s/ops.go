package k8s

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"

	pb "k8s-dashboard/agents/pb/agent-backend"

	"github.com/google/uuid"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/util/yaml"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/tools/clientcmd"
)

func (k *K8sClient) DeleteDeployment(namespace, deploymentName string) error {
	return k.Clientset.AppsV1().Deployments(namespace).Delete(k.Context, deploymentName, metav1.DeleteOptions{})
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

func (k *K8sClient) DeletePod(namespace, podName string) error {
	return k.Clientset.CoreV1().Pods(namespace).Delete(k.Context, podName, metav1.DeleteOptions{})
}

func (k *K8sClient) ScaleDeployment(namespace, deploymentName string, replicas int32) error {
	scale, err := k.Clientset.AppsV1().Deployments(namespace).GetScale(k.Context, deploymentName, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get scale for deployment %s: %w", deploymentName, err)
	}

	scale.Spec.Replicas = replicas
	_, err = k.Clientset.AppsV1().Deployments(namespace).UpdateScale(k.Context, deploymentName, scale, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("failed to update scale for deployment %s: %w", deploymentName, err)
	}
	return nil
}

func (k *K8sClient) DeleteNode(nodeName string) error {
	return k.Clientset.CoreV1().Nodes().Delete(k.Context, nodeName, metav1.DeleteOptions{})
}

func (k *K8sClient) DeleteService(namespace, serviceName string) error {
	return k.Clientset.CoreV1().Services(namespace).Delete(k.Context, serviceName, metav1.DeleteOptions{})
}

func (k *K8sClient) DeleteResource(namespace, name, kind string) error {
	// Generic delete using Dynamic Client
	// We need to map Kind -> GVR. Simple mapping or discovery.
	// Re-using toPlural helper from ApplyManifest
	// resource := toPlural(kind) // Unused variable

	// We need Group and Version. Ideally passed in, but if we only have Kind, we might guess or need discovery.
	// For standard resources:
	// Pod -> v1
	// Service -> v1
	// Deployment -> apps/v1
	// This is tricky without GVK.
	// However, if we assume the agent handles standard types or we use a smarter mapper.

	// Better approach for "DeleteResource": use DynamicClient but we need GVR.
	// If Kind is simple (Pod, Service), we can guess.
	// If it's CRD, we might fail without more info.

	// Let's try to find GVR using Discovery/Mapper?
	// For now, let's just support common types explicitly or use a simple mapper if possible.

	// Simplistic switch for common types, fallback to dynamic if we can guess.
	switch kind {
	case "Pod":
		return k.DeletePod(namespace, name)
	case "Service":
		return k.DeleteService(namespace, name)
	case "Deployment":
		return k.DeleteDeployment(namespace, name)
	case "Node":
		return k.DeleteNode(name)
	}

	// Fallback to dynamic if we can construct GVR
	// Assuming core/v1 or apps/v1 is hard.
	// Let's return error for unknown kinds for now, or assume "v1" for core?
	return fmt.Errorf("unsupported kind for generic delete: %s", kind)
}

func (k *K8sClient) GenerateJoinCommand() (string, error) {
	// 1. Generate Token ID and Secret using UUID
	// kubeadm tokens must be [a-z0-9]{6}.[a-z0-9]{16}
	u1 := uuid.New().String()
	tokenID := strings.ReplaceAll(u1, "-", "")[:6]
	u2 := uuid.New().String()
	tokenSecret := strings.ReplaceAll(u2, "-", "")[:16]
	token := fmt.Sprintf("%s.%s", tokenID, tokenSecret)

	// 2. Create Bootstrap Token Secret
	secretName := fmt.Sprintf("bootstrap-token-%s", tokenID)
	expiration := time.Now().Add(24 * time.Hour).Format(time.RFC3339)

	data := map[string][]byte{
		"token-id":                       []byte(tokenID),
		"token-secret":                   []byte(tokenSecret),
		"expiration":                     []byte(expiration),
		"usage-bootstrap-authentication": []byte("true"),
		"usage-bootstrap-signing":        []byte("true"),
		"extra-groups":                   []byte("system:bootstrappers:kubeadm:default-node-token"),
	}

	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      secretName,
			Namespace: "kube-system",
		},
		Type: corev1.SecretTypeBootstrapToken,
		Data: data,
	}

	_, err := k.Clientset.CoreV1().Secrets("kube-system").Create(k.Context, secret, metav1.CreateOptions{})
	if err != nil {
		if errors.IsAlreadyExists(err) {
			// Try to update if exists? Or just fail? For random token, collision is rare.
			return "", fmt.Errorf("bootstrap token collision: %w", err)
		}
		return "", fmt.Errorf("failed to create bootstrap token secret: %w", err)
	}

	// 3. Get Cluster Info for CA Hash and Endpoint
	cm, err := k.Clientset.CoreV1().ConfigMaps("kube-public").Get(k.Context, "cluster-info", metav1.GetOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to get cluster-info configmap: %w", err)
	}

	kubeconfigStr, ok := cm.Data["kubeconfig"]
	if !ok {
		return "", fmt.Errorf("cluster-info configmap does not contain kubeconfig")
	}

	// Simple parsing of kubeconfig to get CA cert and server
	// We could use clientcmd, but manual parsing for specific fields avoids heavy dependencies if simple
	// Format is typically standard YAML.
	config, err := clientcmd.Load([]byte(kubeconfigStr))
	if err != nil {
		return "", fmt.Errorf("failed to parse cluster-info kubeconfig: %w", err)
	}

	if len(config.Clusters) == 0 {
		return "", fmt.Errorf("no clusters found in cluster-info kubeconfig")
	}

	// Pick the first cluster (usually only one)
	var server string
	var caData []byte
	for _, c := range config.Clusters {
		server = c.Server
		caData = c.CertificateAuthorityData
		break
	}

	// Calculate SHA256 hash of the decoded CA cert
	// NOTE: cluster.CertificateAuthorityData is []byte
	hash := sha256.Sum256(caData)
	hashStr := hex.EncodeToString(hash[:])

	// 4. Construct Command
	// kubeadm join <endpoint> --token <token> --discovery-token-ca-cert-hash sha256:<hash>
	// Endpoint usually includes https://, strip it for host:port if needed?
	// kubeadm join expects host:port.
	endpoint := strings.TrimPrefix(server, "https://")
	endpoint = strings.TrimPrefix(endpoint, "http://")

	cmd := fmt.Sprintf("kubeadm join %s --token %s --discovery-token-ca-cert-hash sha256:%s", endpoint, token, hashStr)

	// Return structured data using the new Protobuf message
	response := &pb.JoinTokenData{
		Command:                  cmd,
		Token:                    token,
		DiscoveryTokenCaCertHash: "sha256:" + hashStr,
		ApiServerEndpoint:        endpoint,
		Expiration:               expiration,
	}

	jsonBytes, err := json.Marshal(response)
	if err != nil {
		return "", fmt.Errorf("failed to marshal join token response: %w", err)
	}

	return string(jsonBytes), nil
}

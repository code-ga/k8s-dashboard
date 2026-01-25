package k8s

import (
	"fmt"
	"os"
	"strings"
	"time"

	"k8s-dashboard/agents/infra/garageHQ"
	"k8s-dashboard/agents/infra/traefik"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

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
		_, err = k.Clientset.AppsV1().StatefulSets(garageNamespace).Get(k.Context, "garage", metav1.GetOptions{})
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

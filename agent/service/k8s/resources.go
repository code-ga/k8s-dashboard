package k8s

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	pb "k8s-dashboard/agents/pb/agent-backend"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	storagev1 "k8s.io/api/storage/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

func (kc *K8sClient) GetPods(namespace string) (*corev1.PodList, error) {
	pods, err := kc.Clientset.CoreV1().Pods(namespace).List(kc.Context, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	return pods, nil
}

func (kc *K8sClient) GetServices(namespace string) (*corev1.ServiceList, error) {
	services, err := kc.Clientset.CoreV1().Services(namespace).List(kc.Context, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	return services, nil
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

func (kc *K8sClient) GetDeployments(namespace string) (*appsv1.DeploymentList, error) {
	deployments, err := kc.Clientset.AppsV1().Deployments(namespace).List(kc.Context, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	return deployments, nil
}

func (kc *K8sClient) GetConfigMaps(namespace string) (*corev1.ConfigMapList, error) {
	configMaps, err := kc.Clientset.CoreV1().ConfigMaps(namespace).List(kc.Context, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	return configMaps, nil
}

func (kc *K8sClient) GetSecrets(namespace string) (*corev1.SecretList, error) {
	secrets, err := kc.Clientset.CoreV1().Secrets(namespace).List(kc.Context, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	return secrets, nil
}

func (kc *K8sClient) GetPVCs(namespace string) (*corev1.PersistentVolumeClaimList, error) {
	pvcs, err := kc.Clientset.CoreV1().PersistentVolumeClaims(namespace).List(kc.Context, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	return pvcs, nil
}

func (kc *K8sClient) GetStorageClasses() (*storagev1.StorageClassList, error) {
	scs, err := kc.Clientset.StorageV1().StorageClasses().List(kc.Context, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	return scs, nil
}

func (kc *K8sClient) GetPVs() (*corev1.PersistentVolumeList, error) {
	pvs, err := kc.Clientset.CoreV1().PersistentVolumes().List(kc.Context, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	return pvs, nil
}

// traefikGVR returns the GroupVersionResource for a Traefik CRD type.
func traefikGVR(resource string) schema.GroupVersionResource {
	return schema.GroupVersionResource{Group: "traefik.io", Version: "v1alpha1", Resource: resource}
}

// parseEntryPointPort converts a Traefik entrypoint name to an external port number.
// "websecure" → 0 (HTTP uses default HTTPS entrypoint, no explicit gateway port)
// "p30000"    → 30000 (TCP)
// "u30001"    → 30001 (UDP)
func parseEntryPointPort(ep string) int32 {
	if ep == "web" || ep == "websecure" {
		return 0
	}
	if strings.HasPrefix(ep, "p") || strings.HasPrefix(ep, "u") {
		if n, err := strconv.Atoi(ep[1:]); err == nil {
			return int32(n)
		}
	}
	return 0
}

var (
	reHost       = regexp.MustCompile(`Host\(` + "`" + `([^` + "`" + `]+)` + "`" + `\)`)
	rePathPrefix = regexp.MustCompile(`PathPrefix\(` + "`" + `([^` + "`" + `]+)` + "`" + `\)`)
)

// parseMatchRule extracts domain and path from a Traefik route match rule.
// e.g. "Host(`example.com`) && PathPrefix(`/api`)" → ("example.com", "/api")
func parseMatchRule(match string) (domain, path string) {
	if m := reHost.FindStringSubmatch(match); len(m) == 2 {
		domain = m[1]
	}
	if m := rePathPrefix.FindStringSubmatch(match); len(m) == 2 {
		path = m[1]
	}
	return
}

// nestedString safely extracts a string from an unstructured nested map.
func nestedString(obj map[string]any, fields ...string) string {
	val, found, _ := nestedFieldNoCopy(obj, fields...)
	if !found {
		return ""
	}
	s, _ := val.(string)
	return s
}

func nestedFieldNoCopy(obj map[string]any, fields ...string) (any, bool, error) {
	current := any(obj)
	for _, f := range fields {
		m, ok := current.(map[string]any)
		if !ok {
			return nil, false, nil
		}
		current, ok = m[f]
		if !ok {
			return nil, false, nil
		}
	}
	return current, true, nil
}

func nestedSlice(obj map[string]any, fields ...string) []any {
	val, found, _ := nestedFieldNoCopy(obj, fields...)
	if !found {
		return nil
	}
	s, _ := val.([]any)
	return s
}

// firstMap returns the first element of a slice cast to map[string]any, or nil.
func firstMap(s []any) map[string]any {
	if len(s) == 0 {
		return nil
	}
	m, _ := s[0].(map[string]any)
	return m
}

func nestedInt64(obj map[string]any, fields ...string) int64 {
	val, found, _ := nestedFieldNoCopy(obj, fields...)
	if !found {
		return 0
	}
	switch v := val.(type) {
	case int64:
		return v
	case float64:
		return int64(v)
	case int32:
		return int64(v)
	}
	return 0
}

// GetIngressRoutes lists all Traefik IngressRoute, IngressRouteTCP, and IngressRouteUDP
// resources across all namespaces and converts them to pb.Ingress protos.
// If Traefik CRDs are not installed, an empty slice is returned without error.
func (kc *K8sClient) GetIngressRoutes() ([]*pb.Ingress, error) {
	var ingresses []*pb.Ingress

	type ingressKind struct {
		gvr      schema.GroupVersionResource
		protocol string
	}
	kinds := []ingressKind{
		{traefikGVR("ingressroutes"), "http"},
		{traefikGVR("ingressroutetcps"), "tcp"},
		{traefikGVR("ingressrouteudps"), "udp"},
	}

	for _, k := range kinds {
		list, err := kc.DynamicClient.Resource(k.gvr).Namespace("").List(kc.Context, metav1.ListOptions{})
		if err != nil {
			// CRD not installed or API group unavailable — skip silently
			fmt.Printf("Warning: could not list %s: %v\n", k.gvr.Resource, err)
			continue
		}

		for _, item := range list.Items {
			obj := item.Object
			spec, _ := obj["spec"].(map[string]any)
			if spec == nil {
				continue
			}

			name := item.GetName()
			namespace := item.GetNamespace()
			uid := string(item.GetUID())
			labels := item.GetLabels()

			// External port from first entrypoint
			var externalPort int32
			if eps := nestedSlice(spec, "entryPoints"); len(eps) > 0 {
				if ep, ok := eps[0].(string); ok {
					externalPort = parseEntryPointPort(ep)
				}
			}

			// Service name, internal port, domain, path from first route
			var serviceName string
			var internalPort int32
			var domain, path string

			if route := firstMap(nestedSlice(spec, "routes")); route != nil {
				domain, path = parseMatchRule(nestedString(route, "match"))
				if svc := firstMap(nestedSlice(route, "services")); svc != nil {
					serviceName = nestedString(svc, "name")
					internalPort = int32(nestedInt64(svc, "port"))
				}
			}

			ingressJSON, err := json.Marshal(item)
			if err != nil {
				return nil, fmt.Errorf("failed to marshal ingress: %w", err)
			}

			ingresses = append(ingresses, &pb.Ingress{
				Name:           name,
				Namespace:      namespace,
				Uid:            uid,
				Labels:         labels,
				Protocol:       k.protocol,
				Port:           externalPort,
				InternalPort:   internalPort,
				ServiceName:    serviceName,
				Domain:         domain,
				Path:           path,
				ResourceConfig: string(ingressJSON),
			})
		}
	}

	return ingresses, nil
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

func (kc *K8sClient) DeleteStorageClass(name string) error {
	return kc.Clientset.StorageV1().StorageClasses().Delete(kc.Context, name, metav1.DeleteOptions{})
}

func (kc *K8sClient) SetDefaultStorageClass(name string, isDefault bool) error {
	sc, err := kc.Clientset.StorageV1().StorageClasses().Get(kc.Context, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get StorageClass %s: %w", name, err)
	}

	annotations := sc.Annotations
	if annotations == nil {
		annotations = make(map[string]string)
	}

	if isDefault {
		annotations["storageclass.kubernetes.io/is-default-class"] = "true"
	} else {
		delete(annotations, "storageclass.kubernetes.io/is-default-class")
	}

	sc.Annotations = annotations
	_, err = kc.Clientset.StorageV1().StorageClasses().Update(kc.Context, sc, metav1.UpdateOptions{})
	return err
}

func (kc *K8sClient) DeletePV(name string) error {
	return kc.Clientset.CoreV1().PersistentVolumes().Delete(kc.Context, name, metav1.DeleteOptions{})
}

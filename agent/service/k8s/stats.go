package k8s

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	pb "k8s-dashboard/agents/pb/agent-backend"
	"k8s-dashboard/agents/utils/crypto"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

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
	info["totalCPU(millicores)"] = fmt.Sprintf("%d", totalCPU)
	info["totalMemory(Mi)"] = fmt.Sprintf("%d", totalMemory)

	// get used resources
	usedCPU, usedMemory, err := kc.GetUsedResources()
	if err != nil {
		return nil, err
	}
	info["usedCPU(millicores)"] = fmt.Sprintf("%d", usedCPU)
	info["usedMemory(Mi)"] = fmt.Sprintf("%d", usedMemory)
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

func (kc *K8sClient) GetFullClusterState() (*pb.Heartbeat, error) {
	// 1. Cluster Resource
	nodes, err := kc.GetNodes()
	if err != nil {
		return nil, fmt.Errorf("failed to get nodes: %w", err)
	}

	var totalCPUCap, totalMemCap int64
	var pbNodes []*pb.Node

	for _, node := range nodes.Items {
		cpu := node.Status.Capacity[corev1.ResourceCPU]
		memory := node.Status.Capacity[corev1.ResourceMemory]
		cpuCap := cpu.MilliValue()
		memCap := memory.Value() / (1024 * 1024)

		totalCPUCap += cpuCap
		totalMemCap += memCap

		// Node usage calculation could be more complex (e.g. metrics server),
		// but here we can try to estimate from pods on the node or just leave 0 if not available easily without metrics API
		// For now, let's leave per-node usage as 0 or implement aggregation later.

		labels := make(map[string]string)
		for k, v := range node.Labels {
			labels[k] = v
		}

		// Extract roles from labels
		var roles []string
		for k := range node.Labels {
			if strings.HasPrefix(k, "node-role.kubernetes.io/") {
				role := strings.TrimPrefix(k, "node-role.kubernetes.io/")
				if role != "" {
					roles = append(roles, role)
				}
			}
		}

		// Extract status (Ready condition)
		status := "Unknown"
		for _, condition := range node.Status.Conditions {
			if condition.Type == corev1.NodeReady {
				if condition.Status == corev1.ConditionTrue {
					status = "Ready"
				} else {
					status = "NotReady"
				}
				break
			}
		}
		annotations := make(map[string]string)
		for k, v := range node.Annotations {
			annotations[k] = v
		}

		nodeJSON, err := json.Marshal(node)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal node: %w", err)
		}

		pbNodes = append(pbNodes, &pb.Node{
			Name:        node.Name,
			CpuCapacity: cpuCap,
			RamCapacity: memCap,
			Labels:      labels,
			Uid:         string(node.UID),
			Status:      status,
			Roles:       roles,
			Annotations:  annotations,
			ResourceConfig: string(nodeJSON),
			// CpuUsage: ... (requires metrics server or manual aggregation)
			// RamUsage: ...
		})
	}

	pods, err := kc.GetPods("") // All namespaces
	if err != nil {
		return nil, fmt.Errorf("failed to get pods: %w", err)
	}

	// Fetch Pod Metrics
	podMetricsMap := make(map[string]map[string]int64) // key: namespace/name -> {cpu, memory}
	metricsGVR := schema.GroupVersionResource{Group: "metrics.k8s.io", Version: "v1beta1", Resource: "pods"}
	metricsList, err := kc.DynamicClient.Resource(metricsGVR).List(kc.Context, metav1.ListOptions{})
	if err == nil {
		for _, item := range metricsList.Items {
			obj := item.Object
			name := nestedString(obj, "metadata", "name")
			namespace := nestedString(obj, "metadata", "namespace")
			if name == "" || namespace == "" {
				continue
			}

			var cpuUsed, memUsed int64
			for _, c := range nestedSlice(obj, "containers") {
				cont, ok := c.(map[string]any)
				if !ok {
					continue
				}
				if cpuStr := nestedString(cont, "usage", "cpu"); cpuStr != "" {
					if q, err := resource.ParseQuantity(cpuStr); err == nil {
						cpuUsed += q.MilliValue()
					}
				}
				if memStr := nestedString(cont, "usage", "memory"); memStr != "" {
					if q, err := resource.ParseQuantity(memStr); err == nil {
						memUsed += q.Value() / (1024 * 1024)
					}
				}
			}
			podMetricsMap[fmt.Sprintf("%s/%s", namespace, name)] = map[string]int64{"cpu": cpuUsed, "memory": memUsed}
		}
	} else {
		fmt.Printf("Warning: Failed to fetch pod metrics: %v\n", err)
	}

	var pbPods []*pb.Pod
	var totalCPUUsage, totalMemUsage int64

	for _, pod := range pods.Items {
		var cpuReq, memReq, cpuLim, memLim int64
		// Aggregate container resources
		for _, container := range pod.Spec.Containers {
			if q, ok := container.Resources.Requests[corev1.ResourceCPU]; ok {
				cpuReq += q.MilliValue()
			}
			if q, ok := container.Resources.Requests[corev1.ResourceMemory]; ok {
				memReq += q.Value() / (1024 * 1024)
			}
			if q, ok := container.Resources.Limits[corev1.ResourceCPU]; ok {
				cpuLim += q.MilliValue()
			}
			if q, ok := container.Resources.Limits[corev1.ResourceMemory]; ok {
				memLim += q.Value() / (1024 * 1024)
			}
		}

		totalCPUUsage += cpuReq
		totalMemUsage += memReq

		// Get main image
		image := ""
		if len(pod.Spec.Containers) > 0 {
			image = pod.Spec.Containers[0].Image
		}

		var replicas int32 = 1
		// If controlled by a ReplicaSet/Deployment, we might want to know desired replicas.
		// However, for a single Pod, it is just 1. The server can aggregate.

		cmdStr := ""
		if len(pod.Spec.Containers) > 0 {
			if len(pod.Spec.Containers[0].Command) > 0 {
				cmdStr = strings.Join(pod.Spec.Containers[0].Command, " ")
			}
		}

		// Ports
		var pbPorts []*pb.ContainerPort
		if len(pod.Spec.Containers) > 0 {
			for _, p := range pod.Spec.Containers[0].Ports {
				pbPorts = append(pbPorts, &pb.ContainerPort{
					ContainerPort: p.ContainerPort,
					Name:          p.Name,
					Protocol:      string(p.Protocol),
				})
			}
		}

		// EnvVariables
		var envEncrypted string
		if len(pod.Spec.Containers) > 0 {
			envConf := map[string]string{}
			for _, env := range pod.Spec.Containers[0].Env {
				envConf[env.Name] = env.Value
			}
			if len(envConf) > 0 {
				jsonBytes, _ := json.Marshal(envConf)
				if enc, err := crypto.Encrypt(string(jsonBytes), kc.ClusterKey); err == nil {
					envEncrypted = enc
				} else {
					fmt.Printf("Error encrypting env vars for pod %s: %v\n", pod.Name, err)
				}
			}
		}

		argsStr := ""
		if len(pod.Spec.Containers) > 0 {
			argsStr = strings.Join(pod.Spec.Containers[0].Args, " ")
		}

		// Add deployment name annotation if it's from a deployment/replicaset
		annotations := make(map[string]string)
		for k, v := range pod.Annotations {
			annotations[k] = v
		}
		if depName := kc.getDeploymentNameForPod(&pod); depName != "" {
			annotations["k8s-dashboard/deployment-name"] = depName
		}

		podJSON, err := json.Marshal(pod)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal pod: %w", err)
		}

		pbPods = append(pbPods, &pb.Pod{
			Name:          pod.Name,
			Namespace:     pod.Namespace,
			NodeName:      pod.Spec.NodeName,
			DockerImage:   image,
			Replicas:      replicas,
			Status:        string(pod.Status.Phase),
			CpuRequest:    cpuReq,
			CpuLimit:      cpuLim,
			MemoryRequest: memReq,
			MemoryLimit:   memLim,
			Command:       cmdStr,
			Args:          argsStr,
			Uid:           string(pod.UID),
			EnvVariables:  envEncrypted,
			Ports:         pbPorts,
			CpuUsage:      podMetricsMap[fmt.Sprintf("%s/%s", pod.Namespace, pod.Name)]["cpu"],
			RamUsage:      podMetricsMap[fmt.Sprintf("%s/%s", pod.Namespace, pod.Name)]["memory"],
			Labels:        pod.Labels,
			Annotations:   annotations,
			ResourceConfig: string(podJSON),
		})

	}

	services, err := kc.GetServices("")
	if err != nil {
		return nil, fmt.Errorf("failed to get services: %w", err)
	}
	var pbServices []*pb.Service
	for _, scv := range services.Items {
		var ports []*pb.ServicePort
		for _, p := range scv.Spec.Ports {
			ports = append(ports, &pb.ServicePort{
				Name:       p.Name,
				Protocol:   string(p.Protocol),
				Port:       p.Port,
				TargetPort: p.TargetPort.IntVal,
				NodePort:   p.NodePort,
			})
		}

		serviceJSON, err := json.Marshal(scv)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal service: %w", err)
		}
		pbServices = append(pbServices, &pb.Service{
			Name:      scv.Name,
			Namespace: scv.Namespace,
			Type:      string(scv.Spec.Type),
			ClusterIp: scv.Spec.ClusterIP,
			Selector:  scv.Spec.Selector,
			Uid:       string(scv.UID),
			Labels:    scv.Labels,
			Ports:     ports,
			Annotations: scv.Annotations,
			ResourceConfig: string(serviceJSON),
		})
	}

	deployments, err := kc.GetDeployments("")
	if err != nil {
		return nil, fmt.Errorf("failed to get deployments: %w", err)
	}
	var pbDeployments []*pb.Deployment
	for _, dep := range deployments.Items {
		var replicas int32
		if dep.Spec.Replicas != nil {
			replicas = *dep.Spec.Replicas
		}

		image := ""
		var cpuReq, memReq, cpuLim, memLim int64
		var pbPorts []*pb.ContainerPort
		var envEncrypted string
		cmdStr := ""
		argsStr := ""

		if len(dep.Spec.Template.Spec.Containers) > 0 {
			container := dep.Spec.Template.Spec.Containers[0]
			image = container.Image

			// Resources
			if q, ok := container.Resources.Requests[corev1.ResourceCPU]; ok {
				cpuReq = q.MilliValue()
			}
			if q, ok := container.Resources.Requests[corev1.ResourceMemory]; ok {
				memReq = q.Value() / (1024 * 1024)
			}
			if q, ok := container.Resources.Limits[corev1.ResourceCPU]; ok {
				cpuLim = q.MilliValue()
			}
			if q, ok := container.Resources.Limits[corev1.ResourceMemory]; ok {
				memLim = q.Value() / (1024 * 1024)
			}

			// Command & Args
			cmdStr = strings.Join(container.Command, " ")
			argsStr = strings.Join(container.Args, " ")

			// Ports
			for _, p := range container.Ports {
				pbPorts = append(pbPorts, &pb.ContainerPort{
					ContainerPort: p.ContainerPort,
					Name:          p.Name,
					Protocol:      string(p.Protocol),
				})
			}

			// Env
			envConf := map[string]string{}
			for _, env := range container.Env {
				envConf[env.Name] = env.Value
			}
			if len(envConf) > 0 {
				jsonBytes, _ := json.Marshal(envConf)
				if enc, err := crypto.Encrypt(string(jsonBytes), kc.ClusterKey); err == nil {
					envEncrypted = enc
				}
			}
		}

		deploymentJSON, err := json.Marshal(dep)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal deployment: %w", err)
		}

		pbDeployments = append(pbDeployments, &pb.Deployment{
			Name:                dep.Name,
			Namespace:           dep.Namespace,
			Replicas:            replicas,
			AvailableReplicas:   dep.Status.AvailableReplicas,
			UnavailableReplicas: dep.Status.UnavailableReplicas,
			Labels:              dep.Labels,
			Selector:            dep.Spec.Selector.MatchLabels,
			DockerImage:         image,
			Uid:                 string(dep.UID),
			Command:             cmdStr,
			Args:                argsStr,
			EnvVariables:        envEncrypted,
			CpuRequest:          cpuReq,
			CpuLimit:            cpuLim,
			MemoryRequest:       memReq,
			MemoryLimit:         memLim,
			Ports:               pbPorts,
			Annotations:         dep.Annotations,
			TemplateAnnotations: dep.Spec.Template.Annotations,
			ResourceConfig: string(deploymentJSON),
		})

	}

	// Fetch ConfigMaps
	cms, err := kc.GetConfigMaps("")
	if err != nil {
		fmt.Printf("Warning: Failed to fetch config maps: %v\n", err)
	}
	var pbConfigMaps []*pb.ConfigMap
	if cms != nil {
		for _, cm := range cms.Items {
			configMapJSON, err := json.Marshal(cm)
			if err != nil {
				return nil, fmt.Errorf("failed to marshal config map: %w", err)
			}
			pbConfigMaps = append(pbConfigMaps, &pb.ConfigMap{
				Name:       cm.Name,
				Namespace:  cm.Namespace,
				Data:       cm.Data,
				BinaryData: cm.BinaryData,
				Uid:        string(cm.UID),
				Labels:     cm.Labels,
				Immutable:  cm.Immutable != nil && *cm.Immutable,
				Annotations: cm.Annotations,
				ResourceConfig: string(configMapJSON),
			})
		}
	}

	// Fetch Secrets
	secs, err := kc.GetSecrets("")
	if err != nil {
		fmt.Printf("Warning: Failed to fetch secrets: %v\n", err)
	}
	var pbSecrets []*pb.Secret
	if secs != nil {
		for _, sec := range secs.Items {
			secretJSON, err := json.Marshal(sec)
			if err != nil {
				return nil, fmt.Errorf("failed to marshal secret: %w", err)
			}
			pbSecrets = append(pbSecrets, &pb.Secret{
				Name:      sec.Name,
				Namespace: sec.Namespace,
				Data:      sec.Data,
				Type:      string(sec.Type),
				Uid:       string(sec.UID),
				Labels:    sec.Labels,
				Immutable: sec.Immutable != nil && *sec.Immutable,
				Annotations: sec.Annotations,
				ResourceConfig: string(secretJSON),
				// Note: We do not include the decoded secret data for security reasons.
			})
		}
	}

	clusterDomain, err := kc.GetClusterDomain()
	if err != nil {
		clusterDomain = "cluster.local" // default
	}

	// Fetch Ingresses (Traefik IngressRoute / IngressRouteTCP / IngressRouteUDP)
	pbIngresses, err := kc.GetIngressRoutes()
	if err != nil {
		fmt.Printf("Warning: Failed to fetch ingress routes: %v\n", err)
	}
	
	// Fetch PVCs
	pvcs, err := kc.GetPVCs("")
	if err != nil {
		fmt.Printf("Warning: Failed to fetch PVCs: %v\n", err)
	}
	var pbPvcs []*pb.PVC
	if pvcs != nil {
		for _, pvc := range pvcs.Items {
			var capacity int64
			if q, ok := pvc.Status.Capacity[corev1.ResourceStorage]; ok {
				capacity = q.Value() / (1024 * 1024) // in MiB
			}
			
			storageClass := ""
			if pvc.Spec.StorageClassName != nil {
				storageClass = *pvc.Spec.StorageClassName
			}

			pvcJSON, err := json.Marshal(pvc)
			if err != nil {
				return nil, fmt.Errorf("failed to marshal pvc: %w", err)
			}
			
			pbPvcs = append(pbPvcs, &pb.PVC{
				Name:         pvc.Name,
				Namespace:    pvc.Namespace,
				Capacity:     capacity,
				Phase:        string(pvc.Status.Phase),
				StorageClass: storageClass,
				VolumeName:   pvc.Spec.VolumeName,
				Uid:          string(pvc.UID),
				Labels:       pvc.Labels,
				Annotations:  pvc.Annotations,
				ResourceConfig: string(pvcJSON),
			})
		}
	}

	heartbeat := &pb.Heartbeat{
		ClusterResource: &pb.ClusterResource{
			CpuCapacity:   totalCPUCap,
			RamCapacity:   totalMemCap,
			CpuUsage:      totalCPUUsage,
			RamUsage:      totalMemUsage,
			ClusterDomain: clusterDomain,
		},
		Nodes:       pbNodes,
		Pods:        pbPods,
		Services:    pbServices,
		Deployments: pbDeployments,
		ConfigMaps:  pbConfigMaps,
		Secrets:     pbSecrets,
		Ingresses:   pbIngresses,
		Pvcs:        pbPvcs,
		Timestamp:   time.Now().Unix(),
	}

	return heartbeat, nil
}

func (kc *K8sClient) getDeploymentNameForPod(pod *corev1.Pod) string {
	for _, owner := range pod.OwnerReferences {
		if owner.Kind == "ReplicaSet" {
			// Standard K8s: RS name is <Deployment>-<PodTemplateHash>
			// We take everything before the last dash.
			lastDash := strings.LastIndex(owner.Name, "-")
			if lastDash != -1 {
				return owner.Name[:lastDash]
			}
			return owner.Name
		}
		if owner.Kind == "Deployment" {
			return owner.Name
		}
	}
	return ""
}

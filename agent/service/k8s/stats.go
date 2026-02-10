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

		pbNodes = append(pbNodes, &pb.Node{
			Name:        node.Name,
			CpuCapacity: cpuCap,
			RamCapacity: memCap,
			Labels:      labels,
			Uid:         string(node.UID),
			Status:      status,
			Roles:       roles,
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
		items := metricsList.UnstructuredContent()["items"].([]interface{})
		for _, item := range items {
			m := item.(map[string]interface{})
			metadata := m["metadata"].(map[string]interface{})
			name := metadata["name"].(string)
			namespace := metadata["namespace"].(string)

			var cpuUsed, memUsed int64
			containers := m["containers"].([]interface{})
			for _, c := range containers {
				cont := c.(map[string]interface{})
				usage := cont["usage"].(map[string]interface{})

				if cpuStr, ok := usage["cpu"].(string); ok {
					if q, err := resource.ParseQuantity(cpuStr); err == nil {
						cpuUsed += q.MilliValue()
					}
				}
				if memStr, ok := usage["memory"].(string); ok {
					if q, err := resource.ParseQuantity(memStr); err == nil {
						memUsed += q.Value() / (1024 * 1024)
					}
				}
			}
			key := fmt.Sprintf("%s/%s", namespace, name)
			podMetricsMap[key] = map[string]int64{"cpu": cpuUsed, "memory": memUsed}
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
		pbServices = append(pbServices, &pb.Service{
			Name:      scv.Name,
			Namespace: scv.Namespace,
			Type:      string(scv.Spec.Type),
			ClusterIp: scv.Spec.ClusterIP,
			Selector:  scv.Spec.Selector,
			Uid:       string(scv.UID),
			Labels:    scv.Labels,
			Ports:     ports,
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
		})

	}

	heartbeat := &pb.Heartbeat{
		ClusterResource: &pb.ClusterResource{
			CpuCapacity: totalCPUCap,
			RamCapacity: totalMemCap,
			CpuUsage:    totalCPUUsage,
			RamUsage:    totalMemUsage,
		},
		Nodes:       pbNodes,
		Pods:        pbPods,
		Services:    pbServices,
		Deployments: pbDeployments,
		Timestamp:   time.Now().Unix(),
	}

	return heartbeat, nil
}

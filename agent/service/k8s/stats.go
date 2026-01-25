package k8s

import (
	"fmt"
	"strings"
	"time"

	pb "k8s-dashboard/agents/pb/agent-backend"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
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

		// Commands
		cmdStr := ""
		if len(pod.Spec.Containers) > 0 && len(pod.Spec.Containers[0].Command) > 0 {
			cmdStr = strings.Join(pod.Spec.Containers[0].Command, " ")
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
			Uid:           string(pod.UID),
			// EnvVariables: ... (might be sensitive, skipping for now or format as needed)
		})
	}

	services, err := kc.GetServices("")
	if err != nil {
		return nil, fmt.Errorf("failed to get services: %w", err)
	}
	var pbServices []*pb.Service
	for _, scv := range services.Items {
		var iPort, ePort int32
		if len(scv.Spec.Ports) > 0 {
			iPort = scv.Spec.Ports[0].Port
			ePort = scv.Spec.Ports[0].NodePort
		}
		pbServices = append(pbServices, &pb.Service{
			Name:         scv.Name,
			Namespace:    scv.Namespace,
			Type:         string(scv.Spec.Type),
			InternalPort: iPort,
			ExternalPort: ePort,
			ClusterIp:    scv.Spec.ClusterIP,
			Selector:     scv.Spec.Selector,
			Uid:          string(scv.UID),
			Labels:       scv.Labels,
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
		if len(dep.Spec.Template.Spec.Containers) > 0 {
			image = dep.Spec.Template.Spec.Containers[0].Image
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

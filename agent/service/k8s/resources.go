package k8s

import (
	"fmt"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
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

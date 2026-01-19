package garageHQ

import (
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type GarageHQConfig struct {
	AdminToken  string
	MetricToken *string
}

func GarageConfig(config GarageHQConfig) *corev1.ConfigMap {
	return &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name: "garage-config",
		},
		Data: map[string]string{
			"garage.toml": `
############################
# Storage paths
############################
metadata_dir = "/var/lib/garage/meta"
data_dir     = "/var/lib/garage/data"

############################
# Replication
############################
replication_mode = "3"

############################
# Node identity & RPC
############################
rpc_bind_addr = "0.0.0.0:3901"
rpc_public_addr = "{{POD_NAME}}.garage-headless.garage-system.svc.cluster.local:3901"

############################
# Gossip (cluster membership)
############################
[gossip]
bind_addr   = "0.0.0.0:3902"
public_addr = "{{POD_NAME}}.garage-headless.garage-system.svc.cluster.local:3902}"

############################
# S3 API (PUBLIC)
############################
[s3_api]
api_bind_addr = "0.0.0.0:3900"
root_domain   = ".s3.example.com"

############################
# Admin API (PRIVATE)
############################
[admin]
api_bind_addr = "0.0.0.0:3903"
admin_token = "` + config.AdminToken + `"
# Optional metrics token
` + func() string {
				if config.MetricToken != nil {
					return `metrics_token = "` + *config.MetricToken + `"`
				}
				return ""
			}() + `
`,
		},
	}
}

func garageHeadlessSvc() *corev1.Service {
	return &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name: "garage-headless",
		},
		Spec: corev1.ServiceSpec{
			ClusterIP: corev1.ClusterIPNone,
			Selector: map[string]string{
				"app": "garage",
			},
			Ports: []corev1.ServicePort{
				{Name: "s3", Port: 3900},
				{Name: "rpc", Port: 3901},
				{Name: "gossip", Port: 3902},
				{Name: "admin", Port: 3903},
			},
		},
	}
}

func GarageStatefulSet() *appsv1.StatefulSet {
	replicas := int32(3)

	return &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{
			Name: "garage",
		},
		Spec: appsv1.StatefulSetSpec{
			ServiceName: "garage-headless",
			Replicas:    &replicas,
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{"app": "garage"},
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{"app": "garage"},
				},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  "garage",
							Image: "dxflrs/garage:v1.0.0",
							Args: []string{
								"server",
								"-c",
								"/etc/garage/garage.toml",
							},
							Env: []corev1.EnvVar{
								{
									Name: "POD_NAME",
									ValueFrom: &corev1.EnvVarSource{
										FieldRef: &corev1.ObjectFieldSelector{
											FieldPath: "metadata.name",
										},
									},
								},
							},
							Ports: []corev1.ContainerPort{
								{ContainerPort: 3900},
								{ContainerPort: 3901},
								{ContainerPort: 3902},
								{ContainerPort: 3903},
							},
							VolumeMounts: []corev1.VolumeMount{
								{Name: "data", MountPath: "/var/lib/garage"},
								{Name: "config", MountPath: "/etc/garage"},
							},
						},
					},
					Volumes: []corev1.Volume{
						{
							Name: "config",
							VolumeSource: corev1.VolumeSource{
								ConfigMap: &corev1.ConfigMapVolumeSource{
									LocalObjectReference: corev1.LocalObjectReference{
										Name: "garage-config",
									},
								},
							},
						},
					},
				},
			},
			VolumeClaimTemplates: []corev1.PersistentVolumeClaim{
				{
					ObjectMeta: metav1.ObjectMeta{Name: "data"},
					Spec: corev1.PersistentVolumeClaimSpec{
						AccessModes: []corev1.PersistentVolumeAccessMode{
							corev1.ReadWriteOnce,
						},
						Resources: corev1.VolumeResourceRequirements{
							Requests: corev1.ResourceList{
								corev1.ResourceStorage: resource.MustParse("100Gi"),
							},
						},
					},
				},
			},
		},
	}
}

func GarageHeadlessSvc() *corev1.Service {
	return &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name: "garage-headless",
		},
		Spec: corev1.ServiceSpec{
			ClusterIP: corev1.ClusterIPNone,
			Selector: map[string]string{
				"app": "garage",
			},
			Ports: []corev1.ServicePort{
				{Name: "s3", Port: 3900},
				{Name: "rpc", Port: 3901},
				{Name: "gossip", Port: 3902},
				{Name: "admin", Port: 3903},
			},
		},
	}
}

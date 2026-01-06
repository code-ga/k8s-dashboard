package traefik

import "k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

func S3IngressRoute(
	name string,
	namespace string,
	host string,
	serviceName string,
) *unstructured.Unstructured {

	return &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "traefik.io/v1alpha1",
			"kind":       "IngressRoute",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": namespace,
				"labels": map[string]interface{}{
					"app": "garage",
				},
			},
			"spec": map[string]interface{}{
				"entryPoints": []interface{}{"websecure"},
				"routes": []interface{}{
					map[string]interface{}{
						"match": "Host(`" + host + "`)",
						"kind":  "Rule",
						"services": []interface{}{
							map[string]interface{}{
								"name": serviceName,
								"port": 3900,
							},
						},
					},
				},
				"tls": map[string]interface{}{},
			},
		},
	}
}

func S3WildcardIngressRoute(
	namespace string,
	serviceName string,
	clusterDomain string,
) *unstructured.Unstructured {

	return &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "traefik.io/v1alpha1",
			"kind":       "IngressRoute",
			"metadata": map[string]interface{}{
				"name":      "garage-s3-wildcard",
				"namespace": namespace,
			},
			"spec": map[string]interface{}{
				"entryPoints": []interface{}{"websecure"},
				"routes": []interface{}{
					map[string]interface{}{
						"match": "HostRegexp(`{bucket:[a-z0-9-]+}.s3." + clusterDomain + "`)",
						"kind":  "Rule",
						"services": []interface{}{
							map[string]interface{}{
								"name": serviceName,
								"port": 3900,
							},
						},
					},
				},
				"tls": map[string]interface{}{
					// wildcard cert: *.s3.<cluster-domain>
				},
			},
		},
	}
}

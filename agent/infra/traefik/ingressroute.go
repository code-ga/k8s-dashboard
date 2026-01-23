package traefik

import (
	"fmt"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// IngressRouteBuilder provides a fluent API for building Traefik IngressRoute resources.
type IngressRouteBuilder struct {
	name        string
	namespace   string
	labels      map[string]string
	entryPoints []string
	routes      []route
	tls         map[string]interface{}
}

type route struct {
	match    string
	kind     string
	services []service
}

type service struct {
	name string
	port int
}

// NewIngressRoute initializes a new IngressRouteBuilder with default settings.
func NewIngressRoute(name, namespace string) *IngressRouteBuilder {
	return &IngressRouteBuilder{
		name:        name,
		namespace:   namespace,
		labels:      make(map[string]string),
		entryPoints: []string{"websecure"},
		tls:         make(map[string]interface{}),
	}
}

// WithLabel adds a label to the IngressRoute.
func (b *IngressRouteBuilder) WithLabel(key, value string) *IngressRouteBuilder {
	b.labels[key] = value
	return b
}

// WithEntryPoint adds an entrypoint to the IngressRoute.
func (b *IngressRouteBuilder) WithEntryPoint(ep string) *IngressRouteBuilder {
	b.entryPoints = append(b.entryPoints, ep)
	return b
}

// AddRoute adds a new route rule to the IngressRoute.
func (b *IngressRouteBuilder) AddRoute(match string, serviceName string, port int) *IngressRouteBuilder {
	b.routes = append(b.routes, route{
		match: match,
		kind:  "Rule",
		services: []service{
			{name: serviceName, port: port},
		},
	})
	return b
}

// Build constructs the final *unstructured.Unstructured Kubernetes resource.
func (b *IngressRouteBuilder) Build() *unstructured.Unstructured {
	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "traefik.io/v1alpha1",
			"kind":       "IngressRoute",
			"metadata": map[string]interface{}{
				"name":      b.name,
				"namespace": b.namespace,
			},
			"spec": map[string]interface{}{
				"entryPoints": b.entryPoints,
				"tls":         b.tls,
			},
		},
	}

	if len(b.labels) > 0 {
		obj.SetLabels(b.labels)
	}

	var routes []interface{}
	for _, r := range b.routes {
		var services []interface{}
		for _, s := range r.services {
			services = append(services, map[string]interface{}{
				"name": s.name,
				"port": s.port,
			})
		}
		routes = append(routes, map[string]interface{}{
			"match":    r.match,
			"kind":     r.kind,
			"services": services,
		})
	}

	unstructured.SetNestedField(obj.Object, routes, "spec", "routes")

	return obj
}

// S3IngressRoute creates an IngressRoute for S3 access.
func S3IngressRoute(
	name string,
	namespace string,
	host string,
	serviceName string,
) *unstructured.Unstructured {
	return NewIngressRoute(name, namespace).
		WithLabel("app", "garage").
		AddRoute(fmt.Sprintf("Host(`%s`)", host), serviceName, 3900).
		Build()
}

// S3WildcardIngressRoute creates a wildcard IngressRoute for S3 bucket access.
func S3WildcardIngressRoute(
	namespace string,
	serviceName string,
	clusterDomain string,
) *unstructured.Unstructured {
	return NewIngressRoute("garage-s3-wildcard", namespace).
		AddRoute(fmt.Sprintf("HostRegexp(`{bucket:[a-z0-9-]+}.s3.%s`)", clusterDomain), serviceName, 3900).
		Build()
}

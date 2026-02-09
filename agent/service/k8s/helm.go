package k8s

import (
	"fmt"
	"log"
	"os"

	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/chart/loader"
	"helm.sh/helm/v3/pkg/cli"
	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// InstallOrUpgradeChart installs or upgrades a Helm chart.
func (kc *K8sClient) InstallOrUpgradeChart(repoURL, chartName, releaseName, namespace string, values map[string]interface{}) error {
	// 1. Initialize Helm Action Configuration
	actionConfig := new(action.Configuration)
	if err := actionConfig.Init(kc, namespace, os.Getenv("HELM_DRIVER"), func(format string, v ...interface{}) {
		log.Printf(format, v...)
	}); err != nil {
		return fmt.Errorf("failed to init helm config: %w", err)
	}

	// 2. Check if release exists
	statusAction := action.NewStatus(actionConfig)
	_, err := statusAction.Run(releaseName)
	exists := err == nil

	settings := cli.New()

	if exists {
		// UPGRADE
		upgradeAction := action.NewUpgrade(actionConfig)
		upgradeAction.RepoURL = repoURL
		upgradeAction.Namespace = namespace

		// Locate chart
		cp, err := upgradeAction.ChartPathOptions.LocateChart(chartName, settings)
		if err != nil {
			return fmt.Errorf("failed to locate chart for upgrade: %w", err)
		}

		// Load chart
		chartRequested, err := loader.Load(cp)
		if err != nil {
			return fmt.Errorf("failed to load chart: %w", err)
		}

		// Run upgrade
		if _, err := upgradeAction.Run(releaseName, chartRequested, values); err != nil {
			return fmt.Errorf("failed to upgrade release %s: %w", releaseName, err)
		}
		log.Printf("Successfully upgraded helm release: %s", releaseName)

	} else {
		// INSTALL
		installAction := action.NewInstall(actionConfig)
		installAction.RepoURL = repoURL
		installAction.ReleaseName = releaseName
		installAction.Namespace = namespace
		installAction.CreateNamespace = true

		// Locate chart
		cp, err := installAction.ChartPathOptions.LocateChart(chartName, settings)
		if err != nil {
			return fmt.Errorf("failed to locate chart for install: %w", err)
		}

		// Load chart
		chartRequested, err := loader.Load(cp)
		if err != nil {
			return fmt.Errorf("failed to load chart: %w", err)
		}

		// Run install
		if _, err := installAction.Run(chartRequested, values); err != nil {
			return fmt.Errorf("failed to install release %s: %w", releaseName, err)
		}
		log.Printf("Successfully installed helm release: %s", releaseName)
	}

	return nil
}

// RESTClientGetter Interface Implementation for Helm

func (kc *K8sClient) ToRESTConfig() (*rest.Config, error) {
	return kc.RestConfig, nil
}

func (kc *K8sClient) ToDiscoveryClient() (discovery.CachedDiscoveryInterface, error) {
	// We need to return a CachedDiscoveryInterface.
	// We wrap our existing DiscoveryClient in a memory cache if it's not already one.
	return memory.NewMemCacheClient(kc.DiscoveryClient), nil
}

func (kc *K8sClient) ToRESTMapper() (meta.RESTMapper, error) {
	return kc.RESTMapper, nil
}

func (kc *K8sClient) ToRawKubeConfigLoader() clientcmd.ClientConfig {
	// This is required by RESTClientGetter but genericclioptions.ConfigFlags usually handles it.
	// Since we are constructing from in-memory config, we might not need this fully strictly
	// unless Helm CLI internals use it for loading context.
	// However, action.Configuration.Init only calls ToDiscoveryClient and ToRESTMapper.
	// But let's return a dummy or proper one if we can.

	loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()
	// Attempt to return a config loader based on standard kubeconfig rules
	// This might not match exactly if we are using in-cluster config, but Helm often relies on it.
	// A better way is to return a dummy that returns our config.

	return clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loadingRules, &clientcmd.ConfigOverrides{})
}

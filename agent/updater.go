package main

import (
	"archive/tar"
	"compress/gzip"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// Version is injected at build time:
//
//	go build -ldflags "-X main.Version=v1.2.3" -o agent
//
// A "dev" value disables the update check.
var Version = "dev"

// Repo is the GitHub repository slug injected at build time.
// Override with -ldflags "-X main.Repo=owner/repo"
var Repo = "code-ga/k8s-dashboard"

// checkAndUpdate fetches the latest release from GitHub, compares it with
// the running version, downloads + replaces the binary when a new version
// is found, then re-executes the new binary in-place.
//
// On a successful update the function never returns (process is replaced).
// Any error is non-fatal; the caller should log it and continue.
func checkAndUpdate() error {
	if Version == "dev" {
		log.Println("[updater] Dev build – skipping self-update")
		return nil
	}

	arch, err := detectArch()
	if err != nil {
		return fmt.Errorf("arch detection: %w", err)
	}
	log.Printf("[updater] Architecture: %s/%s → %s", runtime.GOOS, runtime.GOARCH, arch)

	log.Println("[updater] Checking latest release...")
	latestTag, err := getLatestTag()
	if err != nil {
		return fmt.Errorf("fetching latest tag: %w", err)
	}

	log.Printf("[updater] Latest: %s  |  Installed: %s", latestTag, Version)
	if latestTag == Version {
		log.Println("[updater] Already up-to-date")
		return nil
	}

	log.Printf("[updater] New version detected: %s", latestTag)

	selfPath, err := resolvedSelfPath()
	if err != nil {
		return fmt.Errorf("resolving executable path: %w", err)
	}

	newBin, cleanup, err := downloadRelease(latestTag, arch)
	if err != nil {
		return err
	}
	defer cleanup()

	if err := replaceBinary(selfPath, newBin); err != nil {
		return fmt.Errorf("replacing binary: %w", err)
	}

	log.Printf("[updater] Binary replaced with %s – restarting process...", latestTag)
	return reexec(selfPath)
}

// detectArch maps Go's runtime arch to the archive name suffix used by releases.
func detectArch() (string, error) {
	switch runtime.GOARCH {
	case "amd64":
		return "linux-amd64", nil
	case "arm64":
		return "linux-arm64", nil
	case "arm":
		return "linux-armv7", nil
	default:
		return "", fmt.Errorf("unsupported architecture: %s", runtime.GOARCH)
	}
}

// atomFeed is the minimal subset of GitHub's release Atom feed we need.
type atomFeed struct {
	Entries []struct {
		ID string `xml:"id"`
	} `xml:"entry"`
}

// getLatestTag fetches the GitHub releases Atom feed and returns the newest tag.
func getLatestTag() (string, error) {
	feedURL := "https://github.com/" + Repo + "/releases.atom"
	client := &http.Client{Timeout: 15 * time.Second}

	resp, err := client.Get(feedURL)
	if err != nil {
		return "", fmt.Errorf("GET %s: %w", feedURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("feed returned HTTP %d", resp.StatusCode)
	}

	var feed atomFeed
	if err := xml.NewDecoder(resp.Body).Decode(&feed); err != nil {
		return "", fmt.Errorf("parsing atom feed: %w", err)
	}

	// Entry IDs look like: tag:github.com,2008:Repository/123456/v1.2.3
	for _, entry := range feed.Entries {
		parts := strings.Split(entry.ID, "/")
		if len(parts) == 0 {
			continue
		}
		tag := parts[len(parts)-1]
		if strings.HasPrefix(tag, "v") {
			return tag, nil
		}
	}
	return "", fmt.Errorf("no release tag found in atom feed")
}

// downloadRelease downloads the release archive and extracts the agent binary
// into a temp directory. Returns the path of the extracted binary and a cleanup
// function that removes the temp directory.
func downloadRelease(tag, arch string) (binPath string, cleanup func(), err error) {
	archiveName := fmt.Sprintf("agent-%s-%s.tar.gz", tag, arch)
	downloadURL := fmt.Sprintf("https://github.com/%s/releases/download/%s/%s", Repo, tag, archiveName)

	log.Printf("[updater] Downloading %s", downloadURL)

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(downloadURL)
	if err != nil {
		return "", nil, fmt.Errorf("download GET: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", nil, fmt.Errorf("download returned HTTP %d for %s", resp.StatusCode, downloadURL)
	}

	tmpDir, err := os.MkdirTemp("", "agent-update-*")
	if err != nil {
		return "", nil, fmt.Errorf("creating temp dir: %w", err)
	}
	cleanup = func() { os.RemoveAll(tmpDir) }

	if err := extractTarGz(resp.Body, tmpDir); err != nil {
		cleanup()
		return "", nil, fmt.Errorf("extracting archive: %w", err)
	}

	bin := findExecutable(tmpDir, "agent")
	if bin == "" {
		cleanup()
		return "", nil, fmt.Errorf("agent binary not found in release archive")
	}

	return bin, cleanup, nil
}

// extractTarGz extracts a .tar.gz stream into destDir.
func extractTarGz(r io.Reader, destDir string) error {
	gr, err := gzip.NewReader(r)
	if err != nil {
		return fmt.Errorf("gzip: %w", err)
	}
	defer gr.Close()

	tr := tar.NewReader(gr)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("tar: %w", err)
		}

		// Sanitize to prevent directory traversal.
		clean := filepath.Clean(hdr.Name)
		if strings.HasPrefix(clean, "..") {
			continue
		}
		dest := filepath.Join(destDir, clean)

		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(dest, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
				return err
			}
			f, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(hdr.Mode))
			if err != nil {
				return err
			}
			_, copyErr := io.Copy(f, tr)
			f.Close()
			if copyErr != nil {
				return copyErr
			}
		}
	}
	return nil
}

// findExecutable walks dir looking for a file named name that is executable.
func findExecutable(dir, name string) string {
	var found string
	_ = filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil || found != "" {
			return nil
		}
		if !info.IsDir() && info.Name() == name && info.Mode()&0o111 != 0 {
			found = path
		}
		return nil
	})
	return found
}

// resolvedSelfPath returns the real path of the running binary (symlinks resolved).
func resolvedSelfPath() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.EvalSymlinks(exe)
}

// replaceBinary atomically swaps newBin into selfPath.
func replaceBinary(selfPath, newBin string) error {
	tmp := selfPath + ".new"

	src, err := os.Open(newBin)
	if err != nil {
		return err
	}
	defer src.Close()

	dst, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	if _, err := io.Copy(dst, src); err != nil {
		dst.Close()
		os.Remove(tmp)
		return err
	}
	dst.Close()

	if err := os.Rename(tmp, selfPath); err != nil {
		os.Remove(tmp)
		return err
	}
	return nil
}

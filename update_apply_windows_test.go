//go:build windows

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCleanupLegacyVersionedExecutablesKeepsCanonicalProgram(t *testing.T) {
	directory := t.TempDir()
	canonical := filepath.Join(directory, "BoundlessStudio.exe")
	legacy := []string{
		"BoundlessStudio-v1.0.2.exe",
		"BoundlessStudio-v1.0.3.exe",
		"BoundlessStudio-v1.0.4-beta.1.exe",
	}
	for _, path := range append([]string{canonical, filepath.Join(directory, "BoundlessStudio-Setup.exe")}, pathsIn(directory, legacy...)...) {
		if err := os.WriteFile(path, []byte("program"), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	cleanupLegacyVersionedExecutables(directory, canonical)

	if _, err := os.Stat(canonical); err != nil {
		t.Fatalf("canonical executable was removed: %v", err)
	}
	if _, err := os.Stat(filepath.Join(directory, "BoundlessStudio-Setup.exe")); err != nil {
		t.Fatalf("unrelated executable was removed: %v", err)
	}
	for _, name := range legacy {
		if _, err := os.Stat(filepath.Join(directory, name)); !os.IsNotExist(err) {
			t.Fatalf("legacy versioned executable %q was not removed", name)
		}
	}
}

func TestVersionedLaunchTargetsCanonicalExecutable(t *testing.T) {
	directory := t.TempDir()
	canonical := filepath.Join(directory, "BoundlessStudio.exe")
	versioned := filepath.Join(directory, "BoundlessStudio-v1.0.4.exe")
	if err := os.WriteFile(canonical, []byte("old canonical"), 0o600); err != nil {
		t.Fatal(err)
	}
	if target := resolveUpdateTargetExecutable(versioned); !filepath.IsAbs(target) || target != canonical {
		t.Fatalf("versioned launch target = %q, want canonical %q", target, canonical)
	}
	if err := os.Remove(canonical); err != nil {
		t.Fatal(err)
	}
	if target := resolveUpdateTargetExecutable(versioned); target != versioned {
		t.Fatalf("missing canonical executable should keep running path, got %q", target)
	}
}
func TestRestorePreviousExecutableRollsBackInPlace(t *testing.T) {
	directory := t.TempDir()
	target := filepath.Join(directory, "BoundlessStudio.exe")
	backup := filepath.Join(directory, "data", "updates", "BoundlessStudio-previous.exe")
	if err := os.MkdirAll(filepath.Dir(backup), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("new"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(backup, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := restorePreviousExecutable(target, backup); err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != "old" {
		t.Fatalf("restored executable contains %q, want old", content)
	}
	if _, err := os.Stat(backup); !os.IsNotExist(err) {
		t.Fatal("rollback backup should be consumed after restoration")
	}
}

func TestUpdateBackupStaysOnTargetVolume(t *testing.T) {
	target := filepath.Join(t.TempDir(), "program", "BoundlessStudio.exe")
	backup := updateBackupPath(target)
	if filepath.Dir(backup) != filepath.Dir(target) {
		t.Fatalf("backup directory = %q, want target directory %q", filepath.Dir(backup), filepath.Dir(target))
	}
	if filepath.Ext(backup) != ".bak" {
		t.Fatalf("backup path = %q, want a non-executable .bak file", backup)
	}
}

func TestUpdateAcknowledgementUsesExplicitUpdatesDirectory(t *testing.T) {
	updatesDir := filepath.Join(t.TempDir(), "custom-data-root", "updates")
	if err := os.MkdirAll(updatesDir, 0o755); err != nil {
		t.Fatal(err)
	}
	trusted := filepath.Join(updatesDir, "update-ack-1")
	if !trustedUpdateArtifactPath(trusted, updatesDir) {
		t.Fatal("expected acknowledgement inside the explicit updates directory to be trusted")
	}
	if trustedUpdateArtifactPath(filepath.Join(t.TempDir(), "update-ack-1"), updatesDir) {
		t.Fatal("acknowledgement outside the explicit updates directory must not be trusted")
	}

	acknowledgeAppliedUpdate([]string{
		"BoundlessStudio.exe",
		updateAckArgument,
		trusted,
		updateRootArgument,
		updatesDir,
	})
	if content, err := os.ReadFile(trusted); err != nil || len(content) == 0 {
		t.Fatalf("custom-directory acknowledgement was not written: %q, %v", content, err)
	}
}

func TestApplyDownloadedUpdateAcceptsCustomDataDirectory(t *testing.T) {
	root := t.TempDir()
	programDir := filepath.Join(root, "program")
	updatesDir := filepath.Join(root, "portable-data", "updates")
	if err := os.MkdirAll(programDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(updatesDir, 0o755); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(programDir, "BoundlessStudio.exe")
	source := filepath.Join(updatesDir, "BoundlessStudio-update.exe")
	if err := os.WriteFile(target, []byte("old invalid executable"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(source, []byte("MZnew invalid executable"), 0o700); err != nil {
		t.Fatal(err)
	}

	err := applyDownloadedUpdate(source, target, updatesDir, 0)
	if err == nil {
		t.Fatal("invalid test executable should fail startup verification")
	}
	if _, statErr := os.Stat(source); !os.IsNotExist(statErr) {
		t.Fatalf("custom-directory source was rejected before replacement: %v", statErr)
	}
	content, readErr := os.ReadFile(target)
	if readErr != nil {
		t.Fatal(readErr)
	}
	if string(content) != "old invalid executable" {
		t.Fatalf("rollback restored %q, want old executable", content)
	}
	if !strings.Contains(err.Error(), "\u65e0\u6cd5\u91cd\u542f") {
		t.Fatalf("restart failure was not reported: %v", err)
	}
}

func pathsIn(directory string, names ...string) []string {
	paths := make([]string, 0, len(names))
	for _, name := range names {
		paths = append(paths, filepath.Join(directory, name))
	}
	return paths
}

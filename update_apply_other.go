//go:build !windows

package main

import "os/exec"

const updateHelperArgument = "--boundless-apply-update"

func resolveUpdateTargetExecutable(runningExecutable string) string {
	return runningExecutable
}

func configureUpdateHelperCommand(command *exec.Cmd) {}

func runUpdateHelperIfRequested(arguments []string) (bool, int) {
	return false, 0
}

func acknowledgeAppliedUpdate(arguments []string) {}

func cleanupLegacyVersionedExecutablesAtStartup() {}

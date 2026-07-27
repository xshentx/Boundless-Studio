//go:build !windows

package main

import (
	"os/exec"
)

const updateHelperArgument = "--boundless-apply-update"

func configureUpdateHelperCommand(command *exec.Cmd) {}

func runUpdateHelperIfRequested(arguments []string) (bool, int) {
	return false, 0
}

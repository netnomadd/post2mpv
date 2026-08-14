package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadHostsMissingFile(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)

	profiles, err := loadHosts()
	if err != nil {
		t.Fatalf("missing file should not error: %v", err)
	}
	if len(profiles) != 0 {
		t.Fatalf("expected empty profiles, got %d", len(profiles))
	}
	if _, err := os.Stat(hostsPath()); !os.IsNotExist(err) {
		t.Fatalf("missing file should not be created on read: %v", err)
	}
}

func TestLoadHostsInvalidJSON(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	if err := os.MkdirAll(configDir(), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(hostsPath(), []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}

	_, err := loadHosts()
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestSaveHostsCreatesFile(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)

	want := []Profile{{
		ID:     "local",
		Name:   "localhost",
		Host:   "http://127.0.0.1",
		Port:   7531,
		Action: "play",
		Args:   []string{"--no-terminal"},
		Token:  "secret",
	}}
	if err := saveHosts(want); err != nil {
		t.Fatal(err)
	}

	got, err := loadHosts()
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].ID != "local" || got[0].Token != "secret" {
		t.Fatalf("unexpected profiles: %+v", got)
	}

	info, err := os.Stat(filepath.Join(dir, "post2mpv", "hosts.json"))
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("expected 0600, got %o", info.Mode().Perm())
	}
}

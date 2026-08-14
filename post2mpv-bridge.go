package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

type Profile struct {
	ID     string   `json:"id"`
	Name   string   `json:"name"`
	Host   string   `json:"host"`
	Port   int      `json:"port"`
	Action string   `json:"action"`
	Args   []string `json:"args"`
	Token  string   `json:"token"`
}

type HostsFile struct {
	Profiles []Profile `json:"profiles"`
}

type NativeMessage struct {
	Type     string    `json:"type"`
	URL      string    `json:"url"`
	Host     string    `json:"host"`
	Port     int       `json:"port"`
	Action   string    `json:"action"`
	Params   []string  `json:"params"`
	Token    string    `json:"token"`
	Profiles []Profile `json:"profiles"`
}

type NativeResponse struct {
	Status   string    `json:"status"`
	Code     int       `json:"code,omitempty"`
	Message  string    `json:"message,omitempty"`
	Body     string    `json:"body,omitempty"`
	Profiles []Profile `json:"profiles,omitempty"`
	Path     string    `json:"path,omitempty"`
}

func configDir() string {
	dir := os.Getenv("XDG_CONFIG_HOME")
	if dir == "" {
		home, err := os.UserHomeDir()
		if err != nil || home == "" {
			home = os.Getenv("HOME")
		}
		dir = filepath.Join(home, ".config")
	}
	return filepath.Join(dir, "post2mpv")
}

func hostsPath() string {
	return filepath.Join(configDir(), "hosts.json")
}

func loadHosts() ([]Profile, error) {
	path := hostsPath()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []Profile{}, nil
		}
		return nil, err
	}

	var f HostsFile
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, fmt.Errorf("invalid JSON in %s: %w", path, err)
	}
	if f.Profiles == nil {
		return []Profile{}, nil
	}
	return f.Profiles, nil
}

func saveHosts(profiles []Profile) error {
	if profiles == nil {
		profiles = []Profile{}
	}
	for i := range profiles {
		if profiles[i].Args == nil {
			profiles[i].Args = []string{}
		}
	}

	path := hostsPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}

	data, err := json.MarshalIndent(HostsFile{Profiles: profiles}, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')

	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		os.Remove(tmp)
		return err
	}
	return nil
}

func readMessage() (*NativeMessage, error) {
	var size uint32
	if err := binary.Read(os.Stdin, binary.LittleEndian, &size); err != nil {
		if err == io.EOF {
			return nil, io.EOF
		}
		return nil, err
	}

	buf := make([]byte, size)
	if _, err := io.ReadFull(os.Stdin, buf); err != nil {
		return nil, err
	}

	var msg NativeMessage
	if err := json.Unmarshal(buf, &msg); err != nil {
		return nil, err
	}

	return &msg, nil
}

func sendMessage(resp *NativeResponse) error {
	data, err := json.Marshal(resp)
	if err != nil {
		return err
	}

	if err := binary.Write(os.Stdout, binary.LittleEndian, uint32(len(data))); err != nil {
		return err
	}

	_, err = os.Stdout.Write(data)
	return err
}

func handleListProfiles() *NativeResponse {
	profiles, err := loadHosts()
	if err != nil {
		return &NativeResponse{
			Status:  "error",
			Message: err.Error(),
			Path:    hostsPath(),
		}
	}
	return &NativeResponse{
		Status:   "ok",
		Profiles: profiles,
		Path:     hostsPath(),
	}
}

func handleSaveProfiles(msg *NativeMessage) *NativeResponse {
	if err := saveHosts(msg.Profiles); err != nil {
		return &NativeResponse{
			Status:  "error",
			Message: err.Error(),
			Path:    hostsPath(),
		}
	}
	return &NativeResponse{
		Status: "ok",
		Path:   hostsPath(),
	}
}

func postToServer(msg *NativeMessage) *NativeResponse {
	if msg.Host == "" {
		msg.Host = "http://localhost"
	}
	if msg.Port == 0 {
		msg.Port = 7531
	}
	if msg.Action == "" {
		msg.Action = msg.Type
		if msg.Action == "" {
			msg.Action = "play"
		}
	}

	url := fmt.Sprintf("%s:%d/", msg.Host, msg.Port)

	payload := map[string]interface{}{
		"url":    msg.URL,
		"action": msg.Action,
		"params": msg.Params,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return &NativeResponse{
			Status:  "error",
			Message: fmt.Sprintf("Failed to marshal JSON: %v", err),
		}
	}

	req, err := http.NewRequest("POST", url, bytes.NewReader(jsonData))
	if err != nil {
		return &NativeResponse{
			Status:  "error",
			Message: fmt.Sprintf("Failed to create request: %v", err),
		}
	}

	req.Header.Set("Content-Type", "application/json")
	if msg.Token != "" {
		req.Header.Set("X-POST2MPV-TOKEN", msg.Token)
	}

	client := &http.Client{
		Timeout: 15 * time.Second,
	}
	resp, err := client.Do(req)
	if err != nil {
		return &NativeResponse{
			Status:  "error",
			Message: fmt.Sprintf("Failed to send request: %v", err),
		}
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return &NativeResponse{
			Status:  "error",
			Code:    resp.StatusCode,
			Message: fmt.Sprintf("Failed to read response: %v", err),
		}
	}

	if resp.StatusCode >= 400 {
		return &NativeResponse{
			Status:  "error",
			Code:    resp.StatusCode,
			Message: fmt.Sprintf("HTTP %d", resp.StatusCode),
			Body:    string(body),
		}
	}

	return &NativeResponse{
		Status: "ok",
		Code:   resp.StatusCode,
		Body:   string(body),
	}
}

func usage(w io.Writer) {
	fmt.Fprintf(w, "usage: %s [--manifest]\n", os.Args[0])
}

func manifest() {
	exe, err := os.Executable()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to get executable: %v\n", err)
		os.Exit(1)
	}
	m := struct {
		Name              string   `json:"name"`
		Description       string   `json:"description"`
		Path              string   `json:"path"`
		Type              string   `json:"type"`
		AllowedExtensions []string `json:"allowed_extensions"`
	}{
		Name:              "post2mpv",
		Description:       "post2mpv native bridge (post2mpv-bridge)",
		Path:              exe,
		Type:              "stdio",
		AllowedExtensions: []string{"post2mpv@netnom.uk"},
	}
	data, err := json.MarshalIndent(m, "", "	")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to marshal manifest: %v\n", err)
		os.Exit(1)
	}
	os.Stdout.Write(data)
}

func main() {
	arg := ""
	if len(os.Args) == 2 {
		arg = os.Args[1]
	}
	switch arg {
	case "--manifest":
		manifest()
		return
	case "--help":
		usage(os.Stdout)
		return
	}
	for {
		msg, err := readMessage()
		if err != nil {
			if err == io.EOF {
				break
			}
			sendMessage(&NativeResponse{
				Status:  "error",
				Message: fmt.Sprintf("Failed to read message: %v", err),
			})
			continue
		}

		switch msg.Type {
		case "listProfiles":
			sendMessage(handleListProfiles())
			continue
		case "saveProfiles":
			sendMessage(handleSaveProfiles(msg))
			continue
		}

		if msg.URL == "" {
			sendMessage(&NativeResponse{
				Status:  "error",
				Message: "'url' required",
			})
			continue
		}

		resp := postToServer(msg)
		sendMessage(resp)
	}
}

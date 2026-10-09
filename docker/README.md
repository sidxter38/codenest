# CodeNest Execution Sandboxes

This directory contains container specifications for isolated code execution per Master Requirements 31, 32, and 52.

## Security Constraints
Every container execution must enforce:
1. **Network Disabled**: `--net=none` (zero outbound/inbound network access)
2. **Resource Limits**: `--memory=128m --cpus=0.5 --pids-limit=64`
3. **Execution Timeout**: 5–10 seconds hard timeout
4. **Output Cap**: 1 MB max buffer stdout/stderr
5. **Non-Root Execution**: Runs under unprivileged user `sandbox`
6. **Ephemeral Storage**: Ephemeral mounted volume or `--tmpfs` destroyed after run

## Build Sandbox Locally
```bash
docker build -t codenest-python docker/python
```

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-30

### Added
- **High-Performance Go Sidecar**: Replaced WebDAV with a dedicated API using SQLite in WAL mode for ACID compliance and low-latency concurrency.
- **Vue 3 Frontend**: A modern, accessible (WCAG AA) board view that integrates seamlessly with the OpenCloud shell.
- **Enterprise Security**: Implemented per-user rate limiting (30 reqs/s), token-bucket admission control, OIDC JWT validation, and IDOR protection.
- **Operational Metrics**: Added a `/metrics` endpoint for Prometheus/Grafana monitoring of request volume and duration.
- **Developer Automation**: Full `Makefile` for building, testing, and multi-mode releases. 
- **E2E Test Suite**: 18 passing tests using Playwright, covering full user flows from feature creation to multi-user voting.
- **Deployment & Distribution**:
  - `ghcr.io` Docker image for the sidecar API.
  - `install.sh` one-liner script for standard OpenCloud instances.
  - Support for `docker-compose.override.yml` and `opencloud.yml` (modular pattern) installation methods.
- **Accessibility**: 100% pass on `axe-core` accessibility scans.

### Fixed
- Resolved SQLite WAL contention under extreme load spikes (5,000 requests).
- Fixed OpenCloud proxy routing for JS chunks using relative asset paths.
- Corrected WCAG color contrast failures in the board view.

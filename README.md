# Feature Voting — OpenCloud Web Extension

A feature voting board for OpenCloud. Users can submit feature requests, vote for ideas they support, and delete their own submissions.

## Architecture

This is a two-tier application:

- **`web/`** — Vue.js/TypeScript OpenCloud web extension (frontend UI)
- **`api/`** — Hono + SQLite REST API sidecar (backend persistence)

```
┌─────────────────┐     ┌──────────────────────┐
│  OpenCloud Web   │     │  voting-api sidecar   │
│  (serves web/)   │────▶│  Hono + SQLite        │
│  Port 9200       │     │  Port 3456            │
└─────────────────┘     └──────────────────────┘
```

## Prerequisites

- [pnpm](https://pnpm.io/installation) (v10+)
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- Node.js 22+

## Quick Start

```bash
# Install dependencies
make install

# Start development
make dev
```

This starts:
1. The API dev server on `http://localhost:3456`
2. The web extension in watch mode (auto-rebuilds on changes)

## Development with OpenCloud

To see the extension inside OpenCloud:

1. Build the web extension: `cd web && pnpm build`
2. Copy `web/dist/` contents to your OpenCloud's `apps/feature-voting/` directory
3. Start the API sidecar alongside OpenCloud
4. Restart OpenCloud

For DDEV-based development with `pl-opencloud-server`, see [docs/PLAN.md](docs/PLAN.md).

## Commands

| Command | Description |
|---------|-------------|
| `make install` | Install all dependencies |
| `make build` | Production build (API + web) |
| `make dev` | Start dev servers |
| `make test` | Run all tests |
| `make lint` | Lint web extension |
| `make docker-build` | Build API Docker image |
| `make clean` | Remove build artifacts |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/features` | List all features + user's voted IDs |
| `POST` | `/api/features` | Create a feature request |
| `DELETE` | `/api/features/:id` | Delete own feature |
| `POST` | `/api/features/:id/vote` | Toggle vote on a feature |
| `GET` | `/health` | Health check |

## Tech Stack

- **Frontend**: Vue 3, TypeScript, `@opencloud-eu/web-pkg`, Vite
- **Backend**: Hono, better-sqlite3, TypeScript
- **Testing**: Vitest
- **Deployment**: Docker (API sidecar), static JS (web extension)

## License

AGPL-3.0

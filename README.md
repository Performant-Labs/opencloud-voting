# Feature Voting — OpenCloud Web Extension

A feature voting board for OpenCloud. Users can submit feature requests, vote for ideas they support, and delete their own submissions.

## Architecture

This is a **frontend-only** OpenCloud web extension. All data is stored as JSON files in the user's personal OpenCloud space via WebDAV — no additional containers or backend services needed.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full architecture decision record.

```
┌───────────────────────────────────┐
│  OpenCloud Web                    │
│  ┌─────────────────────────────┐  │
│  │  feature-voting extension   │  │
│  │  (Vue.js + TypeScript)      │  │
│  │         │                   │  │
│  │    WebDAV fetch()           │  │
│  │         ▼                   │  │
│  │  Personal Space             │  │
│  │  /.feature-voting/data.json │  │
│  └─────────────────────────────┘  │
└───────────────────────────────────┘
```

## Prerequisites

- [pnpm](https://pnpm.io/installation) (v10+)
- Node.js 22+
- A running OpenCloud instance

## Quick Start

```bash
# Install dependencies
make install

# Build the extension
make build

# Copy to OpenCloud apps directory
cp -r web/dist/* /path/to/opencloud/web/assets/apps/feature-voting/
```

## Development

```bash
# Watch mode (auto-rebuilds on changes)
make dev
```

For development with `pl-opencloud-server`, the built extension is automatically mounted via the apps directory.

## Commands

| Command | Description |
|---------|-------------|
| `make install` | Install dependencies |
| `make build` | Production build |
| `make dev` | Build in watch mode |
| `make test` | Run unit tests |
| `make lint` | Lint code |
| `make clean` | Remove build artifacts |

## Data Model

All voting data is stored in a single JSON file at `~/.feature-voting/data.json` in the user's personal OpenCloud space:

```json
{
  "features": [
    {
      "id": "m1abc123",
      "title": "Dark mode",
      "description": "Add a dark theme",
      "userId": "alice",
      "voteCount": 3,
      "createdAt": "2026-03-28T12:00:00Z"
    }
  ],
  "votes": {
    "m1abc123": ["alice", "bob", "carol"]
  }
}
```

## Tech Stack

- **Frontend**: Vue 3, TypeScript, `@opencloud-eu/web-pkg`
- **Storage**: OpenCloud WebDAV (personal space)
- **Build**: Vite
- **Testing**: Vitest

## License

AGPL-3.0

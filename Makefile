.PHONY: install build build-watch lint test test-e2e test-go check-types format deploy clean release build-api

OC_SERVER_DIR ?= $(HOME)/Sites/pl-opencloud-server
OC_APP_DIR    := $(OC_SERVER_DIR)/config/opencloud/apps/feature-voting
VERSION       ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")

## Install all dependencies
install:
	cd web && pnpm install

## Build web extension for production
build:
	cd web && pnpm build

## Start development mode (web build watch)
dev:
	cd web && pnpm build:w

## Build web extension in watch mode
build-watch:
	cd web && pnpm build:w

## Build Go API binary
build-api:
	cd api && CGO_ENABLED=1 go build -ldflags="-s -w" -o voting-app .

## Build Docker image for the Go sidecar
build-image:
	docker build -t ghcr.io/performant-labs/opencloud-voting-api:$(VERSION) api/
	docker tag ghcr.io/performant-labs/opencloud-voting-api:$(VERSION) \
	           ghcr.io/performant-labs/opencloud-voting-api:latest

## Run frontend unit tests
test:
	cd web && pnpm test:unit

## Run E2E tests (requires live cloud.opencloud.test)
test-e2e:
	cd web && npx playwright test

## Run Go unit tests
test-go:
	cd api && go test ./...

## Lint all code
lint:
	cd web && pnpm lint

## Type check
check-types:
	cd web && pnpm check:types

## Format code
format:
	cd web && pnpm format:write

## Build, copy to OpenCloud server, and restart the web container
deploy: build
	cp -r web/dist/* $(OC_APP_DIR)/
	cd $(OC_SERVER_DIR) && docker compose restart opencloud
	@echo "→ Deployed and restarted."

## Clean all build artifacts
clean:
	rm -rf web/dist web/node_modules api/voting-app

## Package a distributable release zip
## Creates: dist/feature-voting-web-$(VERSION).zip
release: build
	@echo "→ Packaging release $(VERSION)..."
	@mkdir -p dist
	@cd web && zip -r ../dist/feature-voting-web-$(VERSION).zip dist/
	@cp install/docker-compose.override.yml dist/
	@cp install/install.sh dist/
	@echo "→ Release artifacts:"
	@ls -lh dist/feature-voting-web-$(VERSION).zip dist/docker-compose.override.yml dist/install.sh
	@echo ""
	@echo "Upload these to a GitHub Release tagged $(VERSION)."


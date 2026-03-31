.PHONY: install build build-watch lint test test-e2e test-go check-types format deploy uninstall clean release build-api build-image publish release-all

OC_SERVER_DIR ?= $(HOME)/Sites/pl-opencloud-server
OC_APP_DIR    := $(OC_SERVER_DIR)/config/opencloud/apps/feature-voting
VERSION       ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
IMAGE         := ghcr.io/performant-labs/opencloud-voting-api
REPO          := Performant-Labs/opencloud-voting

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
	docker build -t $(IMAGE):$(VERSION) api/
	docker tag $(IMAGE):$(VERSION) $(IMAGE):latest
	@echo "→ Built $(IMAGE):$(VERSION)"

## Run frontend unit tests
test:
	cd web && pnpm test:unit

## Run E2E tests (requires a running [`opencloud`](https://github.com/opencloud-eu/opencloud) instance at `cloud.opencloud.test`)
test-e2e:
	cd web && ADMIN_PASSWORD="$(ADMIN_PASSWORD)" npx playwright test

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
	cd $(OC_SERVER_DIR) && docker compose up -d --force-recreate opencloud
	@echo "→ Deployed and restarted."

## Clean all build artifacts
clean:
	rm -rf web/dist web/node_modules api/voting-app dist/

## Package distributable release assets into dist/
## Usage: make release VERSION=v0.1.0
release: build
	@echo "→ Packaging release $(VERSION)..."
	@mkdir -p dist
	@cd web/dist && zip -r ../../dist/feature-voting-web-$(VERSION).zip .
	@cp install/docker-compose.override.yml dist/
	@cp install/opencloud.yml dist/
	@cp install/proxy.yaml dist/
	@cp install/install.sh dist/
	@echo ""
	@echo "→ Release assets ready in dist/:"
	@ls -lh dist/feature-voting-web-$(VERSION).zip \
	         dist/docker-compose.override.yml \
	         dist/opencloud.yml \
	         dist/proxy.yaml \
	         dist/install.sh

## Create GitHub Release, upload assets, build & push Docker image to GHCR.
## Requires: gh CLI authenticated, docker login ghcr.io
## Usage: make publish VERSION=v0.1.0
publish: release build-image
	@echo ""
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo " Publishing $(VERSION) to GitHub + GHCR"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo ""
	@# Create and push git tag if it does not already exist
	@if git rev-parse $(VERSION) >/dev/null 2>&1; then \
	  echo "→ Tag $(VERSION) already exists — skipping tag creation"; \
	else \
	  git tag $(VERSION) && git push origin $(VERSION) && echo "→ Tagged and pushed $(VERSION)"; \
	fi
	@echo ""
	@echo "→ Creating GitHub Release $(VERSION)..."
	@gh release create $(VERSION) \
	  --repo $(REPO) \
	  --title "Feature Voting $(VERSION)" \
	  --generate-notes \
	  dist/feature-voting-web-$(VERSION).zip \
	  dist/docker-compose.override.yml \
	  dist/opencloud.yml \
	  dist/proxy.yaml \
	  dist/install.sh
	@echo ""
	@echo "→ Pushing Docker image to GHCR..."
	@docker login ghcr.io
	@docker push $(IMAGE):$(VERSION)
	@docker push $(IMAGE):latest
	@echo ""
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo " ✓ Release $(VERSION) published:"
	@echo "   GitHub: https://github.com/$(REPO)/releases/tag/$(VERSION)"
	@echo "   Image:  $(IMAGE):$(VERSION)"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

## One-shot: package + publish. Usage: make release-all VERSION=v0.1.0
release-all: publish

## Uninstall Feature Voting from the local OpenCloud instance
## Usage: make uninstall  (or: make uninstall OC_SERVER_DIR=~/Sites/my-opencloud)
uninstall:
	@echo "→ Stopping voting-app container..."
	-cd $(OC_SERVER_DIR) && docker compose stop voting-app && docker compose rm -f voting-app
	@echo "→ Removing web extension..."
	rm -rf $(OC_APP_DIR)
	@echo "→ Removing compose overlay..."
	rm -rf $(OC_SERVER_DIR)/feature-voting
	rm -f $(OC_SERVER_DIR)/docker-compose.override.yml
	@echo ""
	@echo "→ Done. Manual steps remaining:"
	@echo "  1. Edit $(OC_SERVER_DIR)/.env — remove :feature-voting/opencloud.yml from COMPOSE_FILE"
	@echo "  2. Edit $(OC_SERVER_DIR)/config/opencloud/proxy.yaml — remove the /api/voting/ route"
	@echo "  3. cd $(OC_SERVER_DIR) && docker compose restart opencloud"
	@echo ""
	@echo "  To also delete all voting data:"
	@echo "    docker volume rm \$$(docker volume ls -q | grep voting-data)"

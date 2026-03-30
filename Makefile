.PHONY: install build build-watch lint test clean dev deploy

OC_SERVER_DIR ?= $(HOME)/Sites/pl-opencloud-server
OC_APP_DIR    := $(OC_SERVER_DIR)/config/opencloud/apps/feature-voting

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

## Run all tests
test:
	cd web && pnpm test:unit

## Run E2E tests
test-e2e:
	cd web && pnpm test:e2e

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
	rm -rf web/dist web/node_modules

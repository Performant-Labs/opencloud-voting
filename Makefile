.PHONY: install build build-watch lint test clean docker-build dev

## Install all dependencies
install:
	cd api && pnpm install
	cd web && pnpm install

## Build both API and web extension for production
build:
	cd api && pnpm build
	cd web && pnpm build

## Start development mode (API watch + web watch)
dev:
	@echo "Starting API dev server..."
	cd api && pnpm dev &
	@echo "Starting web extension build watch..."
	cd web && pnpm build:w

## Build web extension in watch mode
build-watch:
	cd web && pnpm build:w

## Run all tests
test:
	cd api && pnpm test
	cd web && pnpm test:unit

## Lint all code
lint:
	cd web && pnpm lint

## Type check
check-types:
	cd web && pnpm check:types

## Format code
format:
	cd web && pnpm format:write

## Build API Docker image
docker-build:
	docker build -t voting-api api/

## Clean all build artifacts
clean:
	rm -rf api/dist api/node_modules api/data
	rm -rf web/dist web/node_modules

.PHONY: install build build-watch lint test clean dev

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

## Lint all code
lint:
	cd web && pnpm lint

## Type check
check-types:
	cd web && pnpm check:types

## Format code
format:
	cd web && pnpm format:write

## Clean all build artifacts
clean:
	rm -rf web/dist web/node_modules

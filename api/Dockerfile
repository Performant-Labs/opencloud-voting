# Stage 1: Build the Go binary
# CGO is required because the project uses mattn/go-sqlite3 (C bindings).
# The binary is statically linked against musl-libc so the runtime image
# does not need glibc.
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache gcc musl-dev

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-s -w" -o voting-app .

# Stage 2: Minimal runtime image
# alpine:3.21 already includes libc; the musl-compiled binary runs cleanly.
FROM alpine:3.21

RUN apk add --no-cache ca-certificates

WORKDIR /app

COPY --from=builder /build/voting-app .

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

ENTRYPOINT ["./voting-app"]

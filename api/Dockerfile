# Stage 1: Build the Go binary
FROM golang:1.26-alpine AS builder

RUN apk add --no-cache gcc musl-dev

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO is required for SQLite (mattn/go-sqlite3)
RUN CGO_ENABLED=1 GOOS=linux go build -o voting-app .

# Stage 2: Minimal runtime image
FROM alpine:3.21

RUN apk add --no-cache ca-certificates

WORKDIR /app

COPY --from=builder /build/voting-app .

EXPOSE 8080

ENTRYPOINT ["./voting-app"]

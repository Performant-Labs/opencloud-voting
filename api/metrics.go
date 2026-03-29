package main

import (
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

// VotingMetrics tracks Prometheus-compatible metrics for the voting API.
// Uses atomic counters for lock-free concurrent updates.
type VotingMetrics struct {
	requestsTotal atomic.Int64
	requests4xx   atomic.Int64
	requests5xx   atomic.Int64
	mu            sync.Mutex
	latencySumMs  float64
	latencyCount  int64
}

// NewVotingMetrics creates a new metrics collector.
func NewVotingMetrics() *VotingMetrics {
	return &VotingMetrics{}
}

// RecordRequest increments the total request counter and records latency.
func (m *VotingMetrics) RecordRequest(status int, duration time.Duration) {
	m.requestsTotal.Add(1)

	if status >= 400 && status < 500 {
		m.requests4xx.Add(1)
	} else if status >= 500 {
		m.requests5xx.Add(1)
	}

	m.mu.Lock()
	m.latencySumMs += float64(duration.Milliseconds())
	m.latencyCount++
	m.mu.Unlock()
}

// Middleware wraps an http.Handler to automatically record request metrics.
func (m *VotingMetrics) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		m.RecordRequest(sw.status, time.Since(start))
	})
}

// Handler returns the GET /metrics endpoint in Prometheus text exposition format.
func (m *VotingMetrics) Handler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		m.mu.Lock()
		avgLatency := float64(0)
		if m.latencyCount > 0 {
			avgLatency = m.latencySumMs / float64(m.latencyCount)
		}
		m.mu.Unlock()

		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		fmt.Fprintf(w, "# HELP voting_requests_total Total number of API requests.\n")
		fmt.Fprintf(w, "# TYPE voting_requests_total counter\n")
		fmt.Fprintf(w, "voting_requests_total %d\n", m.requestsTotal.Load())
		fmt.Fprintf(w, "# HELP voting_requests_4xx Total number of 4xx client errors.\n")
		fmt.Fprintf(w, "# TYPE voting_requests_4xx counter\n")
		fmt.Fprintf(w, "voting_requests_4xx %d\n", m.requests4xx.Load())
		fmt.Fprintf(w, "# HELP voting_requests_5xx Total number of 5xx server errors.\n")
		fmt.Fprintf(w, "# TYPE voting_requests_5xx counter\n")
		fmt.Fprintf(w, "voting_requests_5xx %d\n", m.requests5xx.Load())
		fmt.Fprintf(w, "# HELP voting_avg_latency_ms Average request latency in milliseconds.\n")
		fmt.Fprintf(w, "# TYPE voting_avg_latency_ms gauge\n")
		fmt.Fprintf(w, "voting_avg_latency_ms %.2f\n", avgLatency)
	}
}

// statusWriter wraps http.ResponseWriter to capture the status code.
type statusWriter struct {
	http.ResponseWriter
	status int
}

func (sw *statusWriter) WriteHeader(code int) {
	sw.status = code
	sw.ResponseWriter.WriteHeader(code)
}

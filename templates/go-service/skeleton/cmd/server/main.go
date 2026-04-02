package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"

	"__GO_MODULE__/internal/config"
	"__GO_MODULE__/internal/handler"
	"__GO_MODULE__/internal/middleware"
	"__GO_MODULE__/internal/service"
	"__GO_MODULE__/internal/telemetry"
)

func main() {
	// ── Load configuration ──
	if err := config.Load(""); err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}
	cfg, err := config.Get()
	if err != nil {
		slog.Error("failed to parse config", "error", err)
		os.Exit(1)
	}

	// ── Set up structured logging ──
	var logHandler slog.Handler
	switch cfg.LogFormat {
	case "text":
		logHandler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	default:
		logHandler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	}
	logger := slog.New(logHandler)
	slog.SetDefault(logger)

	// ── Initialize OpenTelemetry ──
	shutdown, err := telemetry.Setup(context.Background(), "__PROJECT_NAME__")
	if err != nil {
		slog.Error("failed to initialize telemetry", "error", err)
		os.Exit(1)
	}
	defer func() {
		if err := shutdown(context.Background()); err != nil {
			slog.Error("failed to shutdown telemetry", "error", err)
		}
	}()

	// ── Build the service and handler layers ──
	svc := service.NewExampleService()
	exampleHandler := handler.NewExampleHandler(svc)

	// ── Set up chi router with middleware ──
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Logger)
	r.Use(middleware.Recovery)
	r.Use(middleware.MaxBody(1 << 20)) // 1 MB request body limit

	// ── Routes ──
	r.Get("/health", handler.Health)
	r.Get("/readyz", handler.Readyz(nil)) // pass a ReadyzChecker to probe dependencies

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/examples", exampleHandler.List)
		r.Post("/examples", exampleHandler.Create)
		r.Get("/examples/{id}", exampleHandler.Get)
		r.Put("/examples/{id}", exampleHandler.Update)
		r.Delete("/examples/{id}", exampleHandler.Delete)
	})

	// ── Start server ──
	addr := fmt.Sprintf(":%s", cfg.Port)
	srv := &http.Server{
		Addr:         addr,
		Handler:      r,
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
		IdleTimeout:  cfg.IdleTimeout,
	}

	// ── Graceful shutdown ──
	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGTERM)

	go func() {
		slog.Info("server starting", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server failed", "error", err)
			os.Exit(1)
		}
	}()

	<-done
	slog.Info("server shutting down")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("server forced shutdown", "error", err)
		os.Exit(1)
	}

	slog.Info("server stopped")
}

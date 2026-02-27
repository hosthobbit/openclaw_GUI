PROJECT_ROOT := $(shell pwd)

dev:
	cd bridge && BRIDGE_PORT=4000 BRIDGE_API_KEY=dev-bridge-key OPENCLAW_MODE=mock ALLOWED_ORIGINS=http://localhost:5173 npm run dev &
	cd frontend && VITE_BRIDGE_URL=http://localhost:4000 VITE_BRIDGE_API_KEY=dev-bridge-key npm run dev

build:
	cd deploy && docker compose -f docker-compose.yml build

up:
	cd deploy && docker compose -f docker-compose.yml up -d

down:
	cd deploy && docker compose -f docker-compose.yml down

.PHONY: dev build up down


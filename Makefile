# School Management System - Makefile
# Run `make help` to see all commands

.PHONY: help install dev up down build logs psql seed backup clean prune

help:
	@echo "Targets:"
	@echo "  install     Install backend + frontend dependencies"
	@echo "  dev         Run backend (nodemon) + frontend (ng serve) locally"
	@echo "  up          Start full stack via docker-compose (detached)"
	@echo "  down        Stop running containers"
	@echo "  build       Build all docker images"
	@echo "  logs        Stream logs of all containers"
	@echo "  psql        Open a psql shell in the DB container"
	@echo "  seed        Run backend seeders"
	@echo "  backup      pg_dump the school_db to ./backups/ (gzip)"
	@echo "  clean       Remove containers + volumes (destructive)"
	@echo "  prune       Docker system prune"

install:
	cd backend && npm install
	cd frontend && npm install

dev:
	@echo "Starting backend (3000) and frontend (4200)..."
	@cd backend && npm run dev &
	@cd frontend && npm start &
	@wait

up:
	docker-compose up -d --build

down:
	docker-compose down

build:
	docker-compose build

logs:
	docker-compose logs -f

psql:
	docker compose exec postgres psql -U $${POSTGRES_USER:-postgres} $${POSTGRES_DB:-school_db}

seed:
	docker-compose exec backend node dist/database/seeders/index.js

backup:
	@bash database/scripts/backup.sh

clean:
	docker-compose down -v

prune:
	docker system prune -a
# School Management System - Makefile
# Run `make help` to see all commands

.PHONY: help install dev up down build logs mysql psql seed clean prune

help:
	@echo "Targets:"
	@echo "  install     Install backend + frontend dependencies"
	@echo "  dev         Run backend (nodemon) + frontend (ng serve) locally"
	@echo "  up          Start full stack via docker-compose (detached)"
	@echo "  down        Stop running containers"
	@echo "  build       Build all docker images"
	@echo "  logs        Stream logs of all containers"
	@echo "  mysql       Open a mysql shell in the DB container"
	@echo "  psql        Alias: mysql client"
	@echo "  seed        Run backend seeders"
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

mysql:
	docker-compose exec mysql mysql -uroot -p$$(grep MYSQL_ROOT_PASSWORD .env | cut -d= -f2) school_db

psql: mysql

seed:
	docker-compose exec backend node dist/database/seeders/index.js

clean:
	docker-compose down -v

prune:
	docker system prune -a
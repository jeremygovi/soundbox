.DEFAULT_GOAL := help

BACKUP_FILE ?= backups/soundbox-$(shell date +%Y-%m-%d-%H%M%S).tar.gz

.PHONY: help install dev test lint build up down restart logs shell deploy backup clean

help: ## Afficher cette aide
	@awk 'BEGIN {FS = ":.*## "; printf "Soundbox — commandes disponibles\n\n"} /^[a-zA-Z_-]+:.*## / {printf "  %-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Installer les dépendances Node.js
	npm ci

dev: ## Lancer le serveur local avec rechargement automatique
	npm run dev

test: ## Exécuter les tests
	npm test

lint: ## Vérifier la qualité du code
	npm run lint

build: ## Reconstruire l'image Docker sans cache
	docker compose build --no-cache

up: ## Démarrer Soundbox au premier plan
	docker compose up

down: ## Arrêter Soundbox
	docker compose down

restart: ## Redémarrer Soundbox
	docker compose restart

logs: ## Suivre les logs
	docker compose logs -f

shell: ## Ouvrir un shell dans le conteneur
	docker compose exec soundbox sh

deploy: build up ## Construire et démarrer la dernière version

backup: ## Créer une archive cohérente dans backups/
	@mkdir -p backups
	docker compose exec -T soundbox node dist/backup.js /data/soundbox.backup.db
	@tar -czf "$(BACKUP_FILE)" -C data soundbox.backup.db sounds
	@rm -f data/soundbox.backup.db
	@echo "Sauvegarde créée : $(BACKUP_FILE)"

clean: ## Supprimer les artefacts générés (jamais les données)
	@rm -rf dist coverage

# Top-level convenience targets for the multi-package repo.
# Individual packages: root (frontend), scraper/, extension/

.PHONY: install build test lint typecheck dev

install:
	npm install
	cd scraper && npm install
	cd extension && npm install

build:
	npm run build
	cd scraper && npm run build
	cd extension && npm run build

test:
	npm test
	cd scraper && npm test
	cd extension && npm test

lint:
	npm run lint
	cd scraper && npm run lint

typecheck:
	npm run typecheck

dev:
	npm run dev

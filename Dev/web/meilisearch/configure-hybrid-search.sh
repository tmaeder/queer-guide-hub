#!/usr/bin/env bash
# Configure hybrid search (semantic + keyword) on Meilisearch indexes.
# Requires OpenAI API key for embeddings generation.
# Usage: MEILI_URL=xxx MEILI_MASTER_KEY=xxx OPENAI_API_KEY=xxx ./configure-hybrid-search.sh

set -euo pipefail

MEILI_URL="${MEILI_URL:?Set MEILI_URL}"
MEILI_MASTER_KEY="${MEILI_MASTER_KEY:?Set MEILI_MASTER_KEY}"
OPENAI_API_KEY="${OPENAI_API_KEY:?Set OPENAI_API_KEY}"

meili() {
  local method="$1" path="$2" body="$3"
  curl -s -X "$method" "${MEILI_URL}${path}" \
    -H "Authorization: Bearer ${MEILI_MASTER_KEY}" \
    -H "Content-Type: application/json" \
    -d "$body"
  echo
}

# Embedder config shared across indexes
EMBEDDER_CONFIG='{
  "embedders": {
    "default": {
      "source": "openAi",
      "apiKey": "'"${OPENAI_API_KEY}"'",
      "model": "text-embedding-3-small",
      "dimensions": 1536,
      "documentTemplateMaxBytes": 800
    }
  }
}'

echo "=== Enabling vector search feature ==="
# Meilisearch v1.12+ has hybrid search as a stable feature

echo "=== Configuring embedders per index ==="

# Venues — include name, description, category, city for semantic context
meili PATCH "/indexes/venues/settings" '{
  "embedders": {
    "default": {
      "source": "openAi",
      "apiKey": "'"${OPENAI_API_KEY}"'",
      "model": "text-embedding-3-small",
      "dimensions": 1536,
      "documentTemplate": "An LGBTQ+ venue: {{doc.title}} in {{doc.city}}, {{doc.country}}. Category: {{doc.category}}. {{doc.description}}",
      "documentTemplateMaxBytes": 800
    }
  }
}'

# Events
meili PATCH "/indexes/events/settings" '{
  "embedders": {
    "default": {
      "source": "openAi",
      "apiKey": "'"${OPENAI_API_KEY}"'",
      "model": "text-embedding-3-small",
      "dimensions": 1536,
      "documentTemplate": "An LGBTQ+ event: {{doc.title}} in {{doc.city}}, {{doc.country}}. Type: {{doc.event_type}}. {{doc.description}}",
      "documentTemplateMaxBytes": 800
    }
  }
}'

# Cities
meili PATCH "/indexes/cities/settings" '{
  "embedders": {
    "default": {
      "source": "openAi",
      "apiKey": "'"${OPENAI_API_KEY}"'",
      "model": "text-embedding-3-small",
      "dimensions": 1536,
      "documentTemplate": "City: {{doc.title}} in {{doc.country}}. {{doc.description}}",
      "documentTemplateMaxBytes": 800
    }
  }
}'

# Countries
meili PATCH "/indexes/countries/settings" '{
  "embedders": {
    "default": {
      "source": "openAi",
      "apiKey": "'"${OPENAI_API_KEY}"'",
      "model": "text-embedding-3-small",
      "dimensions": 1536,
      "documentTemplate": "Country: {{doc.title}}. Continent: {{doc.continent}}. {{doc.description}}",
      "documentTemplateMaxBytes": 800
    }
  }
}'

# News
meili PATCH "/indexes/news/settings" '{
  "embedders": {
    "default": {
      "source": "openAi",
      "apiKey": "'"${OPENAI_API_KEY}"'",
      "model": "text-embedding-3-small",
      "dimensions": 1536,
      "documentTemplate": "LGBTQ+ news article: {{doc.title}}. Category: {{doc.category}}. {{doc.description}}",
      "documentTemplateMaxBytes": 800
    }
  }
}'

# Personalities
meili PATCH "/indexes/personalities/settings" '{
  "embedders": {
    "default": {
      "source": "openAi",
      "apiKey": "'"${OPENAI_API_KEY}"'",
      "model": "text-embedding-3-small",
      "dimensions": 1536,
      "documentTemplate": "LGBTQ+ personality: {{doc.title}}. Profession: {{doc.profession}}. Connection: {{doc.lgbti_connection}}. {{doc.description}}",
      "documentTemplateMaxBytes": 800
    }
  }
}'

# Tags
meili PATCH "/indexes/tags/settings" '{
  "embedders": {
    "default": {
      "source": "openAi",
      "apiKey": "'"${OPENAI_API_KEY}"'",
      "model": "text-embedding-3-small",
      "dimensions": 1536,
      "documentTemplate": "Tag: {{doc.title}}. Category: {{doc.category}}. {{doc.description}}",
      "documentTemplateMaxBytes": 400
    }
  }
}'

# Queer villages
meili PATCH "/indexes/queer_villages/settings" '{
  "embedders": {
    "default": {
      "source": "openAi",
      "apiKey": "'"${OPENAI_API_KEY}"'",
      "model": "text-embedding-3-small",
      "dimensions": 1536,
      "documentTemplate": "LGBTQ+ neighborhood: {{doc.title}} in {{doc.city}}, {{doc.country}}. {{doc.description}}",
      "documentTemplateMaxBytes": 800
    }
  }
}'

# Marketplace
meili PATCH "/indexes/marketplace/settings" '{
  "embedders": {
    "default": {
      "source": "openAi",
      "apiKey": "'"${OPENAI_API_KEY}"'",
      "model": "text-embedding-3-small",
      "dimensions": 1536,
      "documentTemplate": "Marketplace listing: {{doc.title}}. Category: {{doc.category}}. {{doc.description}}",
      "documentTemplateMaxBytes": 400
    }
  }
}'

echo "=== Hybrid search configured ==="
echo "Meilisearch will now generate embeddings for all indexed documents."
echo "This happens asynchronously — check task status at ${MEILI_URL}/tasks"

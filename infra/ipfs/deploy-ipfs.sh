#!/usr/bin/env bash
# Deploy queer.guide static build to IPFS and update DNSLink
set -euo pipefail

DIST_DIR="${1:-$(cd "$(dirname "$0")/../../web/dist-static" && pwd)}"

# Required env vars
: "${CF_API_TOKEN:?Set CF_API_TOKEN (Cloudflare API token with DNS edit)}"
: "${CF_ZONE_ID:?Set CF_ZONE_ID (Cloudflare zone ID for queer.guide)}"

echo "=== IPFS Deployment for queer.guide ==="
echo "Source: $DIST_DIR"
echo ""

# Verify dist-static exists
if [[ ! -d "$DIST_DIR" ]]; then
    echo "Error: $DIST_DIR not found. Run export.sh first."
    exit 1
fi

# --- Step 1: Add to IPFS ---
echo "[1/3] Adding to IPFS..."
if ! command -v ipfs &>/dev/null; then
    echo "Error: ipfs CLI not found. Install: https://docs.ipfs.tech/install/"
    exit 1
fi

CID=$(ipfs add -r --cid-version=1 --quieter "$DIST_DIR")
echo "    Root CID: $CID"

# --- Step 2: Pin to remote services (optional) ---
echo "[2/3] Pinning to remote services..."

# Pinata (if configured)
if [[ -n "${PINATA_API_KEY:-}" && -n "${PINATA_SECRET_KEY:-}" ]]; then
    echo "    Pinning to Pinata..."
    curl -s -X POST "https://api.pinata.cloud/pinning/pinByHash" \
        -H "pinata_api_key: $PINATA_API_KEY" \
        -H "pinata_secret_api_key: $PINATA_SECRET_KEY" \
        -H "Content-Type: application/json" \
        -d "{\"hashToPin\": \"$CID\", \"pinataMetadata\": {\"name\": \"queer-guide-$(date +%Y%m%d)\"}}" \
        | jq -r '.status // "pinned"'
else
    echo "    Skipping Pinata (PINATA_API_KEY not set)"
fi

# web3.storage (if w3 CLI available)
if command -v w3 &>/dev/null; then
    echo "    Pinning to web3.storage..."
    w3 pin add "$CID" --name "queer-guide-$(date +%Y%m%d)" 2>/dev/null || echo "    w3 pin failed (may need auth)"
else
    echo "    Skipping web3.storage (w3 CLI not installed)"
fi

# --- Step 3: Update DNSLink via Cloudflare API ---
echo "[3/3] Updating DNSLink TXT record..."

DNSLINK_NAME="_dnslink"
DNSLINK_VALUE="dnslink=/ipfs/$CID"

# Check if record exists
EXISTING=$(curl -s -X GET \
    "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records?type=TXT&name=_dnslink.queer.guide" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json")

RECORD_ID=$(echo "$EXISTING" | jq -r '.result[0].id // empty')

if [[ -n "$RECORD_ID" ]]; then
    # Update existing record
    curl -s -X PUT \
        "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records/$RECORD_ID" \
        -H "Authorization: Bearer $CF_API_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"type\":\"TXT\",\"name\":\"$DNSLINK_NAME\",\"content\":\"$DNSLINK_VALUE\",\"ttl\":300}" \
        | jq -r '.success'
    echo "    Updated existing DNSLink record."
else
    # Create new record
    curl -s -X POST \
        "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records" \
        -H "Authorization: Bearer $CF_API_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"type\":\"TXT\",\"name\":\"$DNSLINK_NAME\",\"content\":\"$DNSLINK_VALUE\",\"ttl\":300}" \
        | jq -r '.success'
    echo "    Created new DNSLink record."
fi

echo ""
echo "=== IPFS Deployment Complete ==="
echo "CID:      $CID"
echo "DNSLink:  _dnslink.queer.guide → dnslink=/ipfs/$CID"
echo "Gateway:  https://ipfs.io/ipfs/$CID/"
echo "IPFS:     ipfs://$CID/"
echo "DNSLink:  ipns://queer.guide/"

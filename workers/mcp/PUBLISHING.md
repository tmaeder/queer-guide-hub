# Publishing to the official MCP Registry

The server is live at `https://mcp.queer.guide/mcp`. To make it **discoverable**,
publish [`server.json`](./server.json) to `registry.modelcontextprotocol.io`.

This is the one step that needs a human: the registry requires you to prove you
control the namespace, which means either an interactive GitHub login or a DNS
record on `queer.guide`. Pick one.

```bash
brew install mcp-publisher   # already installed on this machine
cd workers/mcp
```

## Option A — Domain namespace `guide.queer` (matches committed server.json)

Branded, not tied to a personal GitHub. Needs one DNS TXT record on `queer.guide`.

```bash
# 1. Generate an Ed25519 keypair (use Homebrew openssl@3 — LibreSSL lacks Ed25519)
OSSL=$(brew --prefix openssl@3)/bin/openssl
"$OSSL" genpkey -algorithm Ed25519 -out mcpkey.pem

# 2. Public key for the DNS record
PUB=$("$OSSL" pkey -in mcpkey.pem -pubout -outform DER | tail -c 32 | base64)
echo "Add this TXT record on queer.guide:"
echo "  v=MCPv1; k=ed25519; p=$PUB"

# 3. Add the TXT record in the Cloudflare dashboard (DNS → Records → Add):
#      Type: TXT   Name: @ (queer.guide)   Content: v=MCPv1; k=ed25519; p=<PUB>
#    Wait for propagation (dig TXT queer.guide +short).

# 4. Log in + publish
PRIV=$("$OSSL" pkey -in mcpkey.pem -noout -text | sed -n '/priv:/,/pub:/p' | grep -v 'priv:\|pub:' | tr -d ' :\n')
mcp-publisher login dns --domain=queer.guide --private-key="$PRIV"
mcp-publisher publish

rm mcpkey.pem   # keep the private key out of the repo
```

The TXT record can be removed after publishing — keep it if you plan to publish
updates without re-verifying.

## Option B — GitHub namespace (no DNS, fastest)

Publishes under `io.github.tmaeder/queer-guide` instead. Change `name` in
`server.json` to `io.github.tmaeder/queer-guide`, then:

```bash
mcp-publisher login github   # opens a browser for GitHub OAuth
mcp-publisher publish
```

## Verify

```bash
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=queer" | jq '.servers[].name'
```

## Updating later

Bump `version` in `server.json` and re-run `mcp-publisher publish` (re-auth with
the same method). To remove a listing, publish with the registry's deprecate flow.

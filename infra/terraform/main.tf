# queer.guide — Censorship-Resistant Infrastructure
# Deploys static mirrors across diverse providers:
#   - Cloudflare Pages (primary, existing)
#   - Infomaniak (Swiss mirror, existing hosting)
#   - Tor onion service (Docker, local)
#   - IPFS (decentralized)

# --- Providers ---

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# --- Modules ---

module "cloudflare" {
  source = "./modules/cloudflare"

  zone_id    = var.cloudflare_zone_id
  account_id = var.cloudflare_account_id

  mirror_ch_ip = var.infomaniak_ip
}

module "infomaniak" {
  source = "./modules/infomaniak"

  ssh_host        = var.infomaniak_ssh_host
  ssh_user        = var.infomaniak_ssh_user
  ssh_private_key = var.infomaniak_ssh_private_key
  web_root        = var.infomaniak_web_root
}

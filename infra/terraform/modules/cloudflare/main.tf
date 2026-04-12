# Cloudflare zone hardening for queer.guide
# Enables DNSSEC, ECH, Always HTTPS, and manages mirror DNS records

terraform {
  required_providers {
    cloudflare = {
      source = "cloudflare/cloudflare"
    }
  }
}

# DNSSEC already enabled via dashboard + DS record at Infomaniak registrar.
# Requires Zone:Settings:Read which our DNS:Edit token doesn't have.
# resource "cloudflare_zone_dnssec" "queer_guide" {
#   zone_id = var.zone_id
# }

# Zone settings (HTTPS, TLS, ECH, etc.) are already configured via dashboard.
# The DNS:Edit token doesn't have Zone Settings:Edit permissions.
# If you need to manage zone settings via Terraform, add Zone:Settings:Edit
# to the queer-guide-infra API token and uncomment the block below.
#
# resource "cloudflare_zone_settings_override" "queer_guide" {
#   zone_id = var.zone_id
#   settings {
#     always_use_https = "on"
#     min_tls_version  = "1.2"
#     tls_1_3          = "zrt"
#     http3            = "on"
#     opportunistic_onion = "on"
#     ssl              = "full"
#   }
# }

# --- Mirror DNS Records ---

# Swiss mirror (Infomaniak)
resource "cloudflare_record" "mirror_ch" {
  count   = var.mirror_ch_ip != "" ? 1 : 0
  zone_id = var.zone_id
  name    = "ch"
  content = var.mirror_ch_ip
  type    = "A"
  ttl     = 300
  proxied = true
  comment = "Swiss mirror (Infomaniak, Switzerland)"
}

# DNSLink for IPFS — managed by deploy-ipfs.sh
resource "cloudflare_record" "dnslink" {
  zone_id = var.zone_id
  name    = "_dnslink"
  content = "dnslink=/ipfs/placeholder"
  type    = "TXT"
  ttl     = 300
  comment = "IPFS DNSLink — updated by deploy-ipfs.sh"

  lifecycle {
    ignore_changes = [content]
  }
}

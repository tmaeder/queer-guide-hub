output "cloudflare_dnssec_status" {
  description = "DNSSEC enablement status"
  value       = module.cloudflare.dnssec_status
}

output "mirror_ch_subdomain" {
  description = "Swiss mirror subdomain (Infomaniak)"
  value       = module.cloudflare.mirror_ch_fqdn
}


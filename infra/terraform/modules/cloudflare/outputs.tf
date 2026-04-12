output "dnssec_status" {
  description = "DNSSEC status"
  value       = "enabled (managed via dashboard)"
}

output "mirror_ch_fqdn" {
  description = "Swiss mirror FQDN"
  value       = var.mirror_ch_ip != "" ? "ch.queer.guide" : "not configured"
}


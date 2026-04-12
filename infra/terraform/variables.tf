# --- Cloudflare ---
variable "cloudflare_api_token" {
  description = "Cloudflare API token with Zone:Edit and DNS:Edit permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for queer.guide"
  type        = string
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
  default     = "7aa3765cc5f50f2b681b782eb4a8d296"
}

# --- Infomaniak (Swiss mirror) ---
variable "infomaniak_ssh_host" {
  description = "Infomaniak FTP/SSH host"
  type        = string
  default     = "8s0af.ftp.infomaniak.com"
}

variable "infomaniak_ssh_user" {
  description = "Infomaniak SSH user"
  type        = string
  default     = "8s0af_kwiir_ruben"
}

variable "infomaniak_ssh_private_key" {
  description = "Path to SSH private key for Infomaniak"
  type        = string
  default     = "~/.ssh/id_ed25519"
}

variable "infomaniak_web_root" {
  description = "Web root path on Infomaniak hosting for the mirror site"
  type        = string
  default     = "/web/queer-guide-mirror"
}

variable "infomaniak_ip" {
  description = "IP address of Infomaniak hosting (for DNS record)"
  type        = string
  default     = ""
}


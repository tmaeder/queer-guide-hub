variable "zone_id" {
  description = "Cloudflare zone ID for queer.guide"
  type        = string
}

variable "account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "mirror_ch_ip" {
  description = "IP address of the Swiss mirror (Infomaniak)"
  type        = string
  default     = ""
}


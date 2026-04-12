variable "ssh_host" {
  description = "Infomaniak SSH/FTP host"
  type        = string
}

variable "ssh_user" {
  description = "Infomaniak SSH user"
  type        = string
}

variable "ssh_private_key" {
  description = "Path to SSH private key"
  type        = string
  default     = "~/.ssh/id_ed25519"
}

variable "web_root" {
  description = "Web root path on Infomaniak for the mirror"
  type        = string
  default     = "/web/queer-guide-mirror"
}

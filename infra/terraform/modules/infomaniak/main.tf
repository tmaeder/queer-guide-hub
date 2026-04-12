# Infomaniak hosting (Switzerland) — Swiss mirror
# Uses existing shared hosting via SSH/rsync

resource "null_resource" "deploy_content" {
  # Re-deploy whenever triggered
  triggers = {
    deploy_time = timestamp()
  }

  connection {
    type        = "ssh"
    host        = var.ssh_host
    user        = var.ssh_user
    private_key = file(pathexpand(var.ssh_private_key))
    timeout     = "2m"
  }

  provisioner "remote-exec" {
    inline = [
      "mkdir -p ${var.web_root}",
      "echo 'Infomaniak mirror directory ready: ${var.web_root}'",
    ]
  }
}

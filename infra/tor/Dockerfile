FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    tor \
    nginx \
    s6 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Tor configuration (build context is repo root)
COPY infra/tor/torrc /etc/tor/torrc
RUN mkdir -p /var/lib/tor/queer_guide && \
    chown -R debian-tor:debian-tor /var/lib/tor/queer_guide && \
    chmod 700 /var/lib/tor/queer_guide

# Nginx configuration (build context is repo root)
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
COPY infra/tor/onion-headers.conf /etc/nginx/conf.d/onion-headers.conf

# Static content mount point
RUN mkdir -p /var/www/queer-guide

# s6 service definitions for running tor + nginx together
RUN mkdir -p /etc/s6/tor /etc/s6/nginx

# Run tor as debian-tor user (owns the HiddenServiceDir)
RUN printf '#!/bin/sh\nexec su -s /bin/sh -c "tor -f /etc/tor/torrc" debian-tor\n' > /etc/s6/tor/run && \
    chmod +x /etc/s6/tor/run

RUN printf '#!/bin/sh\nexec nginx -g "daemon off;"\n' > /etc/s6/nginx/run && \
    chmod +x /etc/s6/nginx/run

VOLUME ["/var/lib/tor/queer_guide", "/var/www/queer-guide"]

# No exposed ports — onion services don't need them
# The container communicates only via the Tor network

CMD ["s6-svscan", "/etc/s6"]

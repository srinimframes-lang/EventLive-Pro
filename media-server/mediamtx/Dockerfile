# MediaMTX + FFmpeg + script tooling, on Alpine for a small, reliable image.
FROM alpine:3.20

# Leave empty to fetch the latest MediaMTX release at build time, or pin a tag
# like v1.11.3 for reproducible builds.
ARG MEDIAMTX_VERSION=

RUN set -eux; \
    apk add --no-cache ffmpeg bash curl jq ca-certificates tzdata; \
    VER="${MEDIAMTX_VERSION}"; \
    if [ -z "$VER" ]; then \
      VER="$(curl -fsSL https://api.github.com/repos/bluenviron/mediamtx/releases/latest | jq -r .tag_name)"; \
    fi; \
    ARCH="$(uname -m)"; \
    case "$ARCH" in \
      x86_64) A=amd64 ;; \
      aarch64) A=arm64v8 ;; \
      armv7l) A=armv7 ;; \
      *) A=amd64 ;; \
    esac; \
    curl -fSL -o /tmp/mtx.tar.gz \
      "https://github.com/bluenviron/mediamtx/releases/download/${VER}/mediamtx_${VER}_linux_${A}.tar.gz"; \
    tar -xzf /tmp/mtx.tar.gz -C /usr/local/bin mediamtx; \
    rm -f /tmp/mtx.tar.gz; \
    mediamtx --version

COPY mediamtx.yml /mediamtx.yml

# 1935 = RTMP ingest, 9997 = MediaMTX control API (internal only)
EXPOSE 1935 9997

ENTRYPOINT ["/usr/local/bin/mediamtx", "/mediamtx.yml"]

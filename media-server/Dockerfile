# EventLive Pro media server — Node + FFmpeg
FROM node:20-bookworm-slim

# FFmpeg is required for transcoding.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV RTMP_PORT=1935 \
    HTTP_PORT=8000 \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    MEDIA_ROOT=/data/media

# RTMP ingest + HLS http
EXPOSE 1935 8000
VOLUME ["/data/media"]

CMD ["node", "server.js"]

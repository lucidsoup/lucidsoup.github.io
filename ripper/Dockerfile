# yt-dlp and ffmpeg are the whole job; node is just the doorway.
FROM node:22-alpine

RUN apk add --no-cache ffmpeg python3 py3-pip ca-certificates \
 && pip install --break-system-packages --no-cache-dir yt-dlp \
 && adduser -D -u 10001 ripper

WORKDIR /app
COPY package.json server.mjs ./
USER ripper

ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=10s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/health | grep -q '"ok":true' || exit 1
CMD ["node", "server.mjs"]

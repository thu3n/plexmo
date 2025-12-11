# Plexmo

[https://github.com/thu3n/plexmo](https://github.com/thu3n/plexmo)

A modern, web-based Plex monitor. The dashboard provides real-time insights into active sessions, transcoding status, bandwidth usage, and library sizes, with support for multiple Plex servers.

> [!WARNING]
> **⚠️ "Vibe Coded" & Under Development**
>
> This project is **"vibe coded"** (built experimentally and rapidly). It is in active development, which means things **can and will break**. Use it at your own risk and feel free to report bugs!

## Features

- **Real-time Dashboard**: View active sessions, bandwidth, and library stats.
- **Multi-Server Support**: Monitor multiple Plex servers from a single interface.
- **Transcoding Status**: See what is being transcoded and why.
- **Responsive Design**: Looks great on desktop and mobile.

## Getting Started with Docker

The way to run Plexmo is using Docker.

### 1. Run with Docker Compose

Create a `docker-compose.yml` file with the following content:

```yaml
version: '3'
services:
  plexmo:
    image: ghcr.io/thu3n/plexmo:latest
    container_name: plexmo
    environment:
      - TZ=Europe/Stockholm
      - PORT=3000
    ports:
      - "3000:3000"
    volumes:
      - ./config:/app/config
    restart: unless-stopped
```


### Configuration

1.  Open the web interface at `http://localhost:3000`.
2.  Navigate to **Settings**.
3.  Add your first Plex server by providing the URL and your Plex Token.
4.  *Optional:* Configure additional settings as needed.



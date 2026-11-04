# Local development image: PostgreSQL 18 + PostGIS 3.6 + h3-pg + pgTAP + dbmate.
FROM postgis/postgis:18-3.6

# dbmate release (pinned). See https://github.com/amacneil/dbmate/releases
ARG DBMATE_VERSION=v2.37.0

# PGDG repository is already configured in the base image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      postgresql-18-h3 \
      postgresql-18-pgtap \
      libtap-parser-sourcehandler-pgtap-perl \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /usr/local/bin/dbmate \
      "https://github.com/amacneil/dbmate/releases/download/${DBMATE_VERSION}/dbmate-linux-amd64" \
 && chmod 0755 /usr/local/bin/dbmate \
 && dbmate --version

# Runs once, on first start of an empty data volume (official entrypoint).
COPY initdb/ /docker-entrypoint-initdb.d/

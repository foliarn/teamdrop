#!/usr/bin/env bash
# Runs inside the db container. Loads every *.sql file of db/seeds/reference, then every
# *.sql file of db/seeds/fixtures (each folder in alphabetical order), as teamdrop_owner.
# Usage: load-fixtures.sh [database_name]   (default: teamdrop_dev)
set -euo pipefail

DB_NAME="${1:-teamdrop_dev}"
SEEDS_DIR="/workspace/db/seeds"

load_folder() {
  local dir="$1"
  [ -d "${dir}" ] || return 0
  while IFS= read -r file; do
    echo "Loading ${file} into ${DB_NAME}"
    psql -X -v ON_ERROR_STOP=1 -h localhost -U teamdrop_owner -d "${DB_NAME}" -f "${file}"
  done < <(find "${dir}" -maxdepth 1 -type f -name '*.sql' | LC_ALL=C sort)
}

load_folder "${SEEDS_DIR}/reference"
load_folder "${SEEDS_DIR}/fixtures"
echo "Fixtures loaded into ${DB_NAME}"

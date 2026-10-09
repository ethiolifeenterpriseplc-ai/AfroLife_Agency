#!/usr/bin/env bash
set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  exec sudo -- bash "$0" "$@"
fi

read -r -p 'Super Admin legal name: ' admin_name
read -r -p 'Super Admin Ethiopian phone: ' admin_phone
read -r -s -p 'Initial password (12-72 bytes): ' admin_password
printf '\n'
read -r -s -p 'Confirm initial password: ' admin_password_confirm
printf '\n'

if [[ -z "$admin_name" || -z "$admin_phone" ]]; then
  echo 'Name and phone are required.' >&2
  exit 1
fi

if [[ "$admin_password" != "$admin_password_confirm" ]]; then
  echo 'Passwords do not match.' >&2
  exit 1
fi

password_bytes=$(LC_ALL=C printf '%s' "$admin_password" | wc -c)
if (( password_bytes < 12 || password_bytes > 72 )); then
  echo 'Password must be 12-72 UTF-8 bytes.' >&2
  exit 1
fi

sudo -u afrolife -- env \
  AFROLIFE_ENV_FILE=/etc/afrolife/runtime.env \
  SEED_ADMIN_NAME="$admin_name" \
  SEED_ADMIN_PHONE="$admin_phone" \
  SEED_ADMIN_PASSWORD="$admin_password" \
  /usr/bin/node /opt/afrolife/app/dist/src/seed-admin.js

unset admin_password admin_password_confirm

#!/bin/sh
set -eu

if [ -n "${LAYA_API_KEY_FILE:-}" ]; then
  if [ ! -r "$LAYA_API_KEY_FILE" ]; then
    echo "LAYA_API_KEY_FILE is not readable." >&2
    exit 1
  fi
  LAYA_API_KEY="$(tr -d '\r\n' < "$LAYA_API_KEY_FILE")"
  if [ -z "$LAYA_API_KEY" ]; then
    echo "LAYA_API_KEY_FILE is empty." >&2
    exit 1
  fi
  export LAYA_API_KEY
  unset LAYA_API_KEY_FILE
fi

if [ -z "${LAYA_API_KEY:-}" ]; then
  echo "Set LAYA_API_KEY_FILE or LAYA_API_KEY before starting the Laya service." >&2
  exit 1
fi

exec "$@"

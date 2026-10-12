#!/usr/bin/env bash
# Sets the three admin variables for ONE Vercel Preview Git branch, from your own terminal.
#
#   bash scripts/set-preview-admin.sh <git-branch> [admin-username]
#
# What it does
#   - SESSION_SECRET       : generated here (openssl, 48 random bytes), never shown
#   - ADMIN_PASSWORD_HASH  : you type the password (hidden, asked twice); only its scrypt hash is stored
#   - ADMIN_USERNAME       : the 2nd argument, default "kumarraaz"
#
# Safety
#   - values travel only through a pipe (stdin) to the Vercel CLI: never in arguments, history or output
#   - it never overwrites: if a variable already exists for that branch the CLI refuses and this stops
#   - it refuses to target main/master/production, and only ever uses the Preview environment
#   - needs an interactive terminal, the Vercel CLI logged in (`vercel login`), node and openssl
#
# Env overrides (rarely needed): VERCEL_BIN, VERCEL_PROJECT (default demo-finance-kyc),
# VERCEL_SCOPE (default kumarraaz).
set -euo pipefail

branch="${1:-}"
username="${2:-kumarraaz}"
vercel_bin="${VERCEL_BIN:-vercel}"
project="${VERCEL_PROJECT:-demo-finance-kyc}"
scope="${VERCEL_SCOPE:-kumarraaz}"

die() { echo "error: $*" >&2; exit 1; }

[ -n "$branch" ] || { echo "usage: bash scripts/set-preview-admin.sh <git-branch> [admin-username]" >&2; exit 2; }
case "$branch" in
  main | master | production) die "refusing to target '$branch'; this script is for a Preview branch only" ;;
esac
[[ "$username" =~ ^[A-Za-z0-9._-]{3,64}$ ]] || die "admin username must be 3-64 characters: letters, digits, . _ -"
[ -t 0 ] || die "run this in an interactive terminal (the password is typed hidden)"
command -v node >/dev/null || die "node is required"
command -v openssl >/dev/null || die "openssl is required"
command -v "$vercel_bin" >/dev/null || die "the Vercel CLI is required (npm i -g vercel, then vercel login)"
[ -f scripts/hash-password.mjs ] || die "run this from the root of the repository"

secret=""
hash=""
trap 'secret=""; hash=""' EXIT

add() { # add <NAME> <value> <sensitivity flag>
  printf '%s' "$2" | "$vercel_bin" env add "$1" preview "$branch" "$3" --project "$project" --scope "$scope" >/dev/null \
    || die "could not add $1 (if it already exists for this branch, remove it in the dashboard first; this script never overwrites)"
  echo "ok   $1 set for Preview branch $branch"
}

secret="$(openssl rand -base64 48 | tr -d '\n')"
[ "${#secret}" -ge 32 ] || die "could not generate a session secret"

echo "Choose the admin password (12-200 characters). Input is hidden and is never stored, only its hash."
hash="$(node scripts/hash-password.mjs)" || die "password hashing failed; nothing was set"
[[ "$hash" =~ ^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$ ]] || die "unexpected hash format; nothing was set"

add SESSION_SECRET "$secret" --sensitive
add ADMIN_PASSWORD_HASH "$hash" --sensitive
add ADMIN_USERNAME "$username" --no-sensitive

echo "Done. Nothing secret was printed. Tell Claude it is finished; Claude can check the variables EXIST (never their values)."

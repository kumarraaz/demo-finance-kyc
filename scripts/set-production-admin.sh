#!/usr/bin/env bash
# Sets the three admin variables for the Vercel PRODUCTION environment, from your own terminal.
#
#   bash scripts/set-production-admin.sh [admin-username]
#
# What it does
#   - SESSION_SECRET       : generated here (openssl, 48 random bytes), never shown. Production gets its OWN
#                            secret, so a Preview/Production secret is never shared.
#   - ADMIN_PASSWORD_HASH  : you type the password (hidden, asked twice); only its scrypt hash is stored.
#                            Choose a password that is not the Preview one.
#   - ADMIN_USERNAME       : the argument, default "kumarraaz"
#
# Safety
#   - you must type the word "production" to continue (this changes the live environment)
#   - nothing is overwritten: if ANY of the three already exists for Production, nothing at all is added
#   - values travel only through a pipe (stdin) to the Vercel CLI: never in arguments, history or output
#   - only the Production target is ever used, and only these three variable names are touched
#   - needs an interactive terminal, the Vercel CLI logged in (`vercel login`), node and openssl
#
# Env overrides (rarely needed): VERCEL_BIN, VERCEL_PROJECT (default demo-finance-kyc),
# VERCEL_SCOPE (default kumarraaz).
set -euo pipefail

username="${1:-kumarraaz}"
vercel_bin="${VERCEL_BIN:-vercel}"
project="${VERCEL_PROJECT:-demo-finance-kyc}"
scope="${VERCEL_SCOPE:-kumarraaz}"
names=(SESSION_SECRET ADMIN_PASSWORD_HASH ADMIN_USERNAME)

die() { echo "error: $*" >&2; exit 1; }

[[ "$username" =~ ^[A-Za-z0-9._-]{3,64}$ ]] || die "admin username must be 3-64 characters: letters, digits, . _ -"
[ -t 0 ] || die "run this in an interactive terminal (the password is typed hidden)"
command -v node >/dev/null || die "node is required"
command -v openssl >/dev/null || die "openssl is required"
command -v "$vercel_bin" >/dev/null || die "the Vercel CLI is required (npm i -g vercel, then vercel login)"
[ -f scripts/hash-password.mjs ] || die "run this from the root of the repository"

secret=""
hash=""
trap 'secret=""; hash=""' EXIT

echo "This sets admin credentials for the PRODUCTION environment of project '$project'."
printf 'Type "production" to continue: '
read -r answer
[ "$answer" = "production" ] || die "not confirmed; nothing was changed"

# Refuse before changing anything if any of the three already exists for Production.
listing="$("$vercel_bin" env ls production --project "$project" --scope "$scope" 2>/dev/null)" \
  || die "could not list Production variables (are you logged in? try: vercel login); nothing was changed"
for name in "${names[@]}"; do
  if grep -Eq "(^|[[:space:]])${name}([[:space:]]|\$)" <<<"$listing"; then
    die "$name already exists for Production. This script never overwrites. Nothing was changed. Remove it deliberately first (dashboard, or: vercel env rm $name production) if a reset is really intended."
  fi
done

add() { # add <NAME> <value> <sensitivity flag>
  printf '%s' "$2" | "$vercel_bin" env add "$1" production "$3" --project "$project" --scope "$scope" >/dev/null \
    || die "could not add $1 (variables added before this one stay set; nothing was overwritten)"
  echo "ok   $1 set for Production"
}

secret="$(openssl rand -base64 48 | tr -d '\n')"
[ "${#secret}" -ge 32 ] || die "could not generate a session secret"

echo "Choose the Production admin password (12-200 characters, not the Preview one). Input is hidden and is never stored, only its hash."
hash="$(node scripts/hash-password.mjs)" || die "password hashing failed; nothing was set"
[[ "$hash" =~ ^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$ ]] || die "unexpected hash format; nothing was set"

add SESSION_SECRET "$secret" --sensitive
add ADMIN_PASSWORD_HASH "$hash" --sensitive
add ADMIN_USERNAME "$username" --no-sensitive

# Confirm existence by NAME only; the listing is never printed.
listing="$("$vercel_bin" env ls production --project "$project" --scope "$scope" 2>/dev/null)" || listing=""
for name in "${names[@]}"; do
  if grep -Eq "(^|[[:space:]])${name}([[:space:]]|\$)" <<<"$listing"; then echo "ok   $name exists for Production"; else echo "warn $name not seen in the Production listing yet"; fi
done
echo "Done. Nothing secret was printed. A new Production deployment is needed before these variables take effect."

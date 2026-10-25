#!/bin/sh
# Tofu (2026-10-25): this file is Tofu's addition; it is not part of upstream Kaneo.
#
# The image starts here, then runs upstream's deploy/kaneo-entrypoint.sh, which starts the API (on 127.0.0.1:1337 inside
# the container) and nginx in front of it:
#   PORT                -> the port nginx listens on. Tofu sends visitors to PORT; without it the image's 5173 stays.
#   AUTH_SECRET         -> when neither AUTH_SECRET nor AUTH_SECRET_FILE is set, derived from DATABASE_URL, so sign-ins
#                          survive restarts and redeploys. (Upstream makes a random one at every start instead, which
#                          signs everybody out each time.) A value the owner saves always wins.
#   NOTIFICATION_SECRET_ENCRYPTION_KEY -> when unset, derived from DATABASE_URL the same way, so people can save their
#                          ntfy, Gotify and webhook secrets. A value the owner saves always wins.
# Only the app's hosting and its owner hold DATABASE_URL, and anyone holding it can already read and change every row,
# so the derived values give nobody new access. Changing DATABASE_URL (a restored or another database, a new database
# password) changes them: everybody is signed out once, and saved notification secrets have to be entered again.
set -eu

conf=/etc/nginx/conf.d/default.conf

if [ -n "${PORT:-}" ]; then
	case $PORT in
	*[!0-9]*)
		echo "tofu-entrypoint: PORT must be a port number, not '$PORT'" >&2
		exit 1
		;;
	esac
	if [ "$PORT" = 1337 ]; then
		echo "tofu-entrypoint: PORT cannot be 1337, the API's own port inside the container" >&2
		exit 1
	fi
	# /docker-entrypoint.d/05-kaneo-runtime-storage.sh (upstream's apps/web/runtime-storage.sh) copies this file to
	# nginx's runtime folder when kaneo-entrypoint.sh starts.
	sed "s/^\([[:space:]]*listen[[:space:]][[:space:]]*\)5173;/\1${PORT};/" "$conf" >"$conf.tofu"
	cat "$conf.tofu" >"$conf"
	rm -f "$conf.tofu"
	if ! grep -q "^[[:space:]]*listen[[:space:]][[:space:]]*${PORT};" "$conf"; then
		echo "tofu-entrypoint: could not set nginx to listen on port $PORT" >&2
		exit 1
	fi
	echo "tofu-entrypoint: nginx listens on port $PORT"
fi

# The SHA-256 of "<label>:<DATABASE_URL>", as 64 hexadecimal characters.
derive() {
	printf '%s:%s' "$1" "$DATABASE_URL" | sha256sum | cut -d' ' -f1
}

if [ -n "${DATABASE_URL:-}" ]; then
	if [ -z "${AUTH_SECRET:-}" ] && [ -z "${AUTH_SECRET_FILE:-}" ]; then
		AUTH_SECRET=$(derive kaneo-auth-secret)
		export AUTH_SECRET
		echo "tofu-entrypoint: AUTH_SECRET is not set, so one was derived from DATABASE_URL"
	fi
	if [ -z "${NOTIFICATION_SECRET_ENCRYPTION_KEY:-}" ]; then
		NOTIFICATION_SECRET_ENCRYPTION_KEY=$(derive kaneo-notification-secret-key)
		export NOTIFICATION_SECRET_ENCRYPTION_KEY
		echo "tofu-entrypoint: NOTIFICATION_SECRET_ENCRYPTION_KEY is not set, so one was derived from DATABASE_URL"
	fi
fi

exec /bin/sh /usr/local/bin/kaneo-entrypoint.sh "$@"

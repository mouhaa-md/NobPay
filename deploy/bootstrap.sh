#!/usr/bin/env sh
# Prepares deploy/.env for ONE NobPay instance, generating its secrets on this server, then starts it.
#
#   sh deploy/bootstrap.sh demo    # everything simulated: for judges and the public vote, fake data only
#   sh deploy/bootstrap.sh real    # real sats over Lightning (needs two NWC connection strings), guest accounts, low ceilings
#
# The address is asked, or given as SITE_ADDRESS in the environment: a domain name (HTTPS by Caddy, the DNS must already point
# here), or ":80" for plain HTTP without a domain (a Codespace, a laptop), for the demo profile ONLY (the real one refuses it).
# With ":80" the public address is the forwarded one of a Codespace, else http://localhost; PUBLIC_BASE_URL overrides it.
#
# Run it ON THE SERVER, from the repository root, after installing Docker. It never prints a secret and writes deploy/.env
# with mode 600. It refuses to touch an existing deploy/.env. Not tested against a real server yet: read the output of the
# last step and /api/health, as docs/DEPLOIEMENT.md says.
set -eu

PROFILE="${1:-}"
case "$PROFILE" in demo | real) ;; *)
  echo "usage: sh deploy/bootstrap.sh demo|real" >&2
  exit 2
  ;;
esac

cd "$(dirname "$0")/.."
ENV_FILE="deploy/.env"
COMPOSE="docker compose --env-file $ENV_FILE -f deploy/docker-compose.yml"

[ -e "$ENV_FILE" ] && {
  echo "deploy/.env existe déjà : je n'y touche pas (supprimez-le pour recommencer, en gardant une copie de ses secrets)." >&2
  exit 1
}
command -v docker >/dev/null 2>&1 || {
  echo "Docker n'est pas installé (https://docs.docker.com/engine/install/)." >&2
  exit 1
}
docker compose version >/dev/null 2>&1 || {
  echo "Le plugin « docker compose » manque." >&2
  exit 1
}
command -v openssl >/dev/null 2>&1 || {
  echo "openssl est nécessaire pour générer les secrets." >&2
  exit 1
}

ask() { # ask "question" -> prints the answer
  printf '%s ' "$1" >&2
  read -r answer
  printf '%s' "$answer"
}
ask_secret() { # ask_secret "question" -> the answer is not shown while typing
  printf '%s ' "$1" >&2
  stty -echo 2>/dev/null || true
  read -r answer
  stty echo 2>/dev/null || true
  printf '\n' >&2
  printf '%s' "$answer"
}

ask_number() { # ask_number "question" default -> a positive whole number, or the default
  answer="$(ask "$1")"
  case "$answer" in "" | *[!0-9]*) printf '%s' "$2" ;; 0) printf '%s' "$2" ;; *) printf '%s' "$answer" ;; esac
}

# KEY=VALUE written into the file: the line is replaced if it exists, appended if not (no sed, so no escaping trouble)
setvar() {
  key="$1"
  value="$2"
  # The file is rebuilt and renamed over deploy/.env, so the mode of the old file is lost: the new one must be private from
  # its creation, before any secret goes into it. Neither the umask nor a folder's default ACL can be relied on for that.
  : >"$ENV_FILE.tmp"
  chmod 600 "$ENV_FILE.tmp"
  awk -v k="$key" -v v="$value" 'BEGIN{done=0} $0 ~ "^" k "=" {print k "=" v; done=1; next} {print} END{if(!done) print k "=" v}' "$ENV_FILE" >"$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
}

# The address comes from SITE_ADDRESS in the environment, or from the question. ":80" means Caddy over plain HTTP, no domain, no
# certificate (a Codespace, a laptop): demo profile ONLY. A real-sats instance holds real money and needs a domain and HTTPS.
SITE="${SITE_ADDRESS:-}"
[ -n "$SITE" ] || SITE="$(ask "Nom de domaine de cette instance (le DNS doit déjà pointer vers ce serveur, ex. demo.exemple.org ; « :80 » : HTTP simple sans domaine, profil demo seulement) :")"
PLAIN_HTTP=0
case "$SITE" in
  :80)
    [ "$PROFILE" = "demo" ] || {
      echo "SITE_ADDRESS=:80 (HTTP simple) est réservé au profil demo : une instance « $PROFILE » exige un nom de domaine et HTTPS." >&2
      exit 1
    }
    PLAIN_HTTP=1
    ;;
  "" | *[!A-Za-z0-9.-]*)
    echo "Nom de domaine invalide." >&2
    exit 1
    ;;
esac

if [ "$PLAIN_HTTP" = 1 ]; then
  # the address visitors will use: the forwarded one in a Codespace, else this machine; PUBLIC_BASE_URL in the environment overrides
  if [ -n "${PUBLIC_BASE_URL:-}" ]; then
    PUBLIC="$PUBLIC_BASE_URL"
  elif [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
    PUBLIC="https://$CODESPACE_NAME-80.$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN"
  else
    PUBLIC="http://localhost"
  fi
  case "$PUBLIC" in
    http://* | https://*) ;;
    *) echo "PUBLIC_BASE_URL invalide (http:// ou https:// puis un nom ou une adresse)." >&2; exit 1 ;;
  esac
  case "${PUBLIC#*://}" in "" | *[!A-Za-z0-9._:-]*) echo "PUBLIC_BASE_URL invalide (http:// ou https:// puis un nom ou une adresse)." >&2; exit 1 ;; esac
  HEALTH_URL="http://localhost/api/health" # checked from this machine, on the port Caddy listens on
  echo "ATTENTION - HTTP simple : essai local uniquement. Pas de certificat : n'y mettez que des données fictives, et ne rendez pas le port public." >&2
else
  PUBLIC="https://$SITE"
  HEALTH_URL="https://$SITE/api/health"
fi

cp deploy/.env.example "$ENV_FILE"
chmod 600 "$ENV_FILE"

setvar SITE_ADDRESS "$SITE"
setvar PUBLIC_BASE_URL "$PUBLIC"
setvar SESSION_SECRET "$(openssl rand -hex 32)"
setvar BITNOB_WEBHOOK_SECRET "$(openssl rand -hex 32)"
setvar NOSTR_MASTER_KEY "$(openssl rand -hex 32)"

if [ "$PROFILE" = "demo" ]; then
  setvar ALLOW_DEMO 1
  setvar ALLOW_GUEST ""
  setvar BITNOB_MODE mock
  setvar LIGHTNING_RAIL ""
else
  setvar ALLOW_DEMO 0 # the shared demo code would open accounts that hold real sats: the server refuses to start otherwise
  setvar ALLOW_GUEST 1
  setvar BITNOB_MODE mock
  setvar LIGHTNING_RAIL nwc
  echo "Connexion de RÉCEPTION : droits « créer des factures, les consulter, lire le solde » seulement (elle ne dépense pas)." >&2
  setvar NWC_RECEIVE_URL "$(ask_secret "NWC_RECEIVE_URL (nostr+walletconnect://…) :")"
  echo "Connexion de PAIEMENT : la seule qui dépense ; fixez-lui un budget dans le portefeuille. Laissez vide pour désactiver paiements et remboursements." >&2
  setvar NWC_PAYOUT_URL "$(ask_secret "NWC_PAYOUT_URL (nostr+walletconnect://…) :")"
  setvar LIGHTNING_MAX_FUNDING_USD "$(ask_number "Plafond d'un versement, en dollars [20] :" 20)"
  setvar LIGHTNING_MAX_PAYOUT_USD "$(ask_number "Plafond d'un paiement à un fournisseur, en dollars [20] :" 20)"
  setvar LIGHTNING_MAX_ESCROW_USD "$(ask_number "Plafond du séquestre de toute l'instance, en dollars [60] :" 60)"
fi

case "$(ask "Publier le registre sur des relais Nostr (seules des empreintes partent) ? [o/N] :")" in
  o | O | oui | y | Y | yes) setvar NOSTR_PUBLISH 1 ;;
  *) setvar NOSTR_PUBLISH "" ;;
esac

echo "deploy/.env écrit (droits 600). Construction et démarrage…" >&2
$COMPOSE up -d --build

# "status restarts health" of the app container ("restarting 3 starting", "running 0 healthy"…), empty when it does not exist
app_state() {
  cid="$($COMPOSE ps -q app 2>/dev/null | head -n 1)"
  [ -n "$cid" ] || return 0
  docker inspect -f '{{.State.Status}} {{.RestartCount}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$cid" 2>/dev/null || true
}

# Says what is wrong instead of leaving the reader with a timeout: the state of the containers and the last lines of the app's log
# (the app's own log never holds a secret: it masks them). A refused configuration shows up here as "Démarrage refusé : …".
fail_with_log() {
  {
    echo ""
    echo "L'application ne devient pas saine ($1)."
    echo "État des conteneurs :"
    $COMPOSE ps || true
    echo ""
    echo "Dernières lignes du journal de l'application :"
    $COMPOSE logs --no-color --tail 40 app || true
    echo ""
    echo "Pour suivre le journal : $COMPOSE logs -f app"
  } >&2
  exit 1
}

# BOOTSTRAP_WAIT_TRIES x BOOTSTRAP_WAIT_SLEEP seconds: 200 s by default (the certificate can take a minute); the tests shorten it
WAIT_TRIES="${BOOTSTRAP_WAIT_TRIES:-40}"
WAIT_SLEEP="${BOOTSTRAP_WAIT_SLEEP:-5}"

if [ "$PLAIN_HTTP" = 1 ]; then
  echo "Attente de $HEALTH_URL…" >&2
else
  echo "Attente de $HEALTH_URL (le certificat HTTPS peut prendre une minute)…" >&2
fi
i=0
until curl -fsS "$HEALTH_URL" >/dev/null 2>&1; do
  i=$((i + 1))
  # shellcheck disable=SC2046
  set -- $(app_state)
  case "${1:-}" in
    restarting | exited | dead) fail_with_log "le conteneur est « $1 »" ;;
  esac
  if [ "${2:-0}" -gt 0 ] 2>/dev/null; then fail_with_log "le conteneur a redémarré $2 fois"; fi
  if [ "${3:-}" = "unhealthy" ]; then fail_with_log "Docker le juge « unhealthy »"; fi
  if [ "$i" -gt "$WAIT_TRIES" ]; then fail_with_log "pas de réponse après $((WAIT_TRIES * WAIT_SLEEP)) secondes"; fi
  sleep "$WAIT_SLEEP"
done

NOTE=""
if [ "$PLAIN_HTTP" = 1 ]; then NOTE=" (HTTP simple : essai local uniquement)"; fi

cat >&2 <<EOF

Instance « $PROFILE » en ligne : $PUBLIC$NOTE
À faire maintenant :
  1. Sauvegardez deploy/.env HORS de ce serveur (SESSION_SECRET, NOSTR_MASTER_KEY, chaînes NWC) : sans NOSTR_MASTER_KEY,
     l'instance ne peut plus signer pour les projets existants.
  2. Ouvrez $PUBLIC/api/health et $PUBLIC/en.
  3. Planifiez deploy/backup.sh (voir docs/DEPLOIEMENT.md), et essayez UNE FOIS la restauration.
  4. Avant d'ouvrir au jury : un essai complet de bout en bout avec 1 à 2 \$ (voir « Contrôle avant d'ouvrir au jury »).
EOF

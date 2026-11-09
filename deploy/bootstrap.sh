#!/usr/bin/env sh
# Prepares deploy/.env for ONE NobPay instance, generating its secrets on this server, then starts it.
#
#   sh deploy/bootstrap.sh demo    # everything simulated: for judges and the public vote, fake data only
#   sh deploy/bootstrap.sh real    # real sats over Lightning (needs two NWC connection strings), guest accounts, low ceilings
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

SITE="$(ask "Nom de domaine de cette instance (le DNS doit déjà pointer vers ce serveur, ex. demo.exemple.org) :")"
case "$SITE" in "" | *[!A-Za-z0-9.-]*) echo "Nom de domaine invalide." >&2; exit 1 ;; esac

cp deploy/.env.example "$ENV_FILE"
chmod 600 "$ENV_FILE"

setvar SITE_ADDRESS "$SITE"
setvar PUBLIC_BASE_URL "https://$SITE"
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

echo "Attente de https://$SITE/api/health (le certificat HTTPS peut prendre une minute)…" >&2
i=0
until curl -fsS "https://$SITE/api/health" >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -gt 40 ] && {
    echo "Pas de réponse. Lisez les journaux : $COMPOSE logs --tail 100 app" >&2
    exit 1
  }
  sleep 5
done

cat >&2 <<EOF

Instance « $PROFILE » en ligne : https://$SITE
À faire maintenant :
  1. Sauvegardez deploy/.env HORS de ce serveur (SESSION_SECRET, NOSTR_MASTER_KEY, chaînes NWC) : sans NOSTR_MASTER_KEY,
     l'instance ne peut plus signer pour les projets existants.
  2. Ouvrez https://$SITE/api/health et https://$SITE/en.
  3. Planifiez deploy/backup.sh (voir docs/DEPLOIEMENT.md), et essayez UNE FOIS la restauration.
  4. Avant d'ouvrir au jury : un essai complet de bout en bout avec 1 à 2 \$ (voir « Contrôle avant d'ouvrir au jury »).
EOF

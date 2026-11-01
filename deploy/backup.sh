#!/usr/bin/env sh
# Snapshot of the NobPay data volume (database + uploaded proofs). Run from cron, e.g. every night:
#   0 3 * * *  /opt/nobpay/deploy/backup.sh /var/backups/nobpay
# Keep copies OFF the server too (rsync, rclone, restic). A backup you never restored is not a backup:
# see "Restaurer" in docs/DEPLOIEMENT.md and try it before the demo day.
set -eu
DEST="${1:?usage: backup.sh <destination-folder>}"
KEEP="${KEEP:-14}"
VOLUME="${NOBPAY_VOLUME:-deploy_nobpay-data}"
mkdir -p "$DEST"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
docker run --rm -v "$VOLUME":/data:ro -v "$DEST":/backup alpine \
  tar czf "/backup/nobpay-$STAMP.tar.gz" -C /data .
ls -1t "$DEST"/nobpay-*.tar.gz | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "ok: $DEST/nobpay-$STAMP.tar.gz"

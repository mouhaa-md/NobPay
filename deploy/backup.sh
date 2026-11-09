#!/usr/bin/env sh
# Snapshot of the NobPay data volume (database + uploaded proofs). Run from cron, e.g. every night:
#   0 3 * * *  /opt/nobpay/deploy/backup.sh /var/backups/nobpay
# Keep copies OFF the server too (rsync, rclone, restic). A backup you never restored is not a backup:
# see "Restaurer" in docs/DEPLOIEMENT.md and try it before the demo day.
#
# The archive holds the whole database (phone numbers, names, suppliers, photo positions) and every uploaded proof: personal
# data. It is readable by its owner only (mode 600) in a folder only its owner can enter (700). The container runs as root, so
# the archive is written with a private umask INSIDE it, then handed to the user who runs this script (a root-owned file could
# not be tightened afterwards by anyone else). The umask alone is not enough (a folder with default ACLs ignores it), hence the
# explicit chmod 600. Archives made by older versions are 644: the 700 folder already shuts them away.
set -eu
DEST="${1:?usage: backup.sh <destination-folder>}"
KEEP="${KEEP:-14}"
VOLUME="${NOBPAY_VOLUME:-deploy_nobpay-data}"
umask 077
mkdir -p "$DEST"
chmod 700 "$DEST"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
docker run --rm -e STAMP="$STAMP" -e OWNER="$(id -u):$(id -g)" -v "$VOLUME":/data:ro -v "$DEST":/backup alpine \
  sh -c 'umask 077 && tar czf "/backup/nobpay-$STAMP.tar.gz" -C /data . && chmod 600 "/backup/nobpay-$STAMP.tar.gz" && chown "$OWNER" "/backup/nobpay-$STAMP.tar.gz"'
ls -1t "$DEST"/nobpay-*.tar.gz | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "ok: $DEST/nobpay-$STAMP.tar.gz"

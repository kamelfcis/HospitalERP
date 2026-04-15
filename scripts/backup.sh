#!/bin/bash
# Hospital ERP Database Backup Script
# Usage: ./scripts/backup.sh
# Requires: DATABASE_URL environment variable
# Make executable: chmod +x scripts/backup.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/hospital_erp_${TIMESTAMP}.sql.gz"
STATUS_FILE="${BACKUP_DIR}/.backup_status.json"

mkdir -p "$BACKUP_DIR"

echo "Starting database backup..."
pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip > "$BACKUP_FILE"

# Write status file
FILESIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE" 2>/dev/null || echo "0")
cat > "$STATUS_FILE" << EOF
{
  "lastBackupAt": "$(date -Iseconds)",
  "lastBackupFile": "$BACKUP_FILE",
  "lastBackupSizeBytes": $FILESIZE,
  "status": "success"
}
EOF

# Retention: keep last 7 backups
ls -t "${BACKUP_DIR}"/hospital_erp_*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm

echo "Backup completed: $BACKUP_FILE ($FILESIZE bytes)"
echo "Status written to: $STATUS_FILE"

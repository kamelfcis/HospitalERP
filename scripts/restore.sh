#!/bin/bash
# Hospital ERP Database Restore Script
# Usage: ./scripts/restore.sh <backup_file.sql.gz>
# WARNING: This will DROP and recreate all tables!
# Make executable: chmod +x scripts/restore.sh

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <backup_file.sql.gz>"
  echo "Available backups:"
  ls -lt backups/hospital_erp_*.sql.gz 2>/dev/null || echo "  No backups found"
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "WARNING: This will restore the database from: $BACKUP_FILE"
echo "All current data will be replaced."
read -p "Are you sure? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Restore cancelled."
  exit 0
fi

echo "Restoring database..."
gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL" --single-transaction

echo "Restore completed successfully."

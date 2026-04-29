#!/bin/bash
################################################################################
# Green Dii - Database Server Setup Script
# For: Hetzner Cloud CPX21 or any Ubuntu 22.04 LTS VPS
# PostgreSQL 15 with Security & Backup Configuration
################################################################################

set -e

echo "======================================"
echo "Green Dii Database Server Setup"
echo "======================================"

# Variables (แก้ไขตามต้องการ)
DB_NAME="greendii_production"
DB_USER="greendii_app"
DB_PASSWORD="YOUR_SECURE_PASSWORD_HERE"  # เปลี่ยนเป็นรหัสที่ปลอดภัย
APP_SERVER_IP="YOUR_APP_SERVER_IP"        # IP ของ App Server

# Update system
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# Install PostgreSQL 15
echo "🗄️ Installing PostgreSQL 15..."
apt install -y postgresql-15 postgresql-contrib-15

# Install additional tools
apt install -y ufw fail2ban htop

# Configure UFW Firewall
echo "🔒 Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp          # SSH
ufw allow from $APP_SERVER_IP to any port 5432  # PostgreSQL (เฉพาะ App Server)
ufw --force enable

# Configure PostgreSQL
echo "⚙️ Configuring PostgreSQL..."

# Backup original config
cp /etc/postgresql/15/main/postgresql.conf /etc/postgresql/15/main/postgresql.conf.backup
cp /etc/postgresql/15/main/pg_hba.conf /etc/postgresql/15/main/pg_hba.conf.backup

# Update PostgreSQL config for remote connections
cat >> /etc/postgresql/15/main/postgresql.conf << EOF

# Green Dii Custom Configuration
listen_addresses = '*'
max_connections = 100
shared_buffers = 1GB
effective_cache_size = 3GB
maintenance_work_mem = 256MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 10MB
min_wal_size = 1GB
max_wal_size = 4GB

# Logging
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_rotation_age = 1d
log_rotation_size = 100MB
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_checkpoints = on
log_connections = on
log_disconnections = on
log_duration = off
log_lock_waits = on
log_statement = 'none'
log_temp_files = 0

# Auto vacuum
autovacuum = on
autovacuum_max_workers = 3
autovacuum_naptime = 1min
EOF

# Configure authentication
cat > /etc/postgresql/15/main/pg_hba.conf << EOF
# PostgreSQL Client Authentication Configuration File
# Green Dii Production

# TYPE  DATABASE        USER            ADDRESS                 METHOD

# Local connections
local   all             postgres                                peer
local   all             all                                     peer

# Remote connections from App Server
host    $DB_NAME        $DB_USER        $APP_SERVER_IP/32       md5

# Deny all other connections
host    all             all             0.0.0.0/0               reject
EOF

# Restart PostgreSQL
systemctl restart postgresql

# Create database and user
echo "👤 Creating database and user..."
sudo -u postgres psql << EOF
CREATE DATABASE $DB_NAME;
CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;

-- Grant schema permissions
\c $DB_NAME
GRANT ALL ON SCHEMA public TO $DB_USER;
ALTER DATABASE $DB_NAME OWNER TO $DB_USER;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
EOF

# Setup automated backup
echo "💾 Setting up automated backup..."
mkdir -p /var/backups/postgresql

cat > /usr/local/bin/backup-postgres.sh << 'BACKUP_SCRIPT'
#!/bin/bash
# PostgreSQL Backup Script

BACKUP_DIR="/var/backups/postgresql"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME="greendii_production"

# Create backup
pg_dump -U postgres -Fc $DB_NAME > $BACKUP_DIR/backup_${DB_NAME}_${TIMESTAMP}.dump

# Keep only last 7 days
find $BACKUP_DIR -name "backup_*.dump" -mtime +7 -delete

echo "Backup completed: backup_${DB_NAME}_${TIMESTAMP}.dump"
BACKUP_SCRIPT

chmod +x /usr/local/bin/backup-postgres.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-postgres.sh") | crontab -

# Install and configure fail2ban
echo "🛡️ Configuring fail2ban..."
cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = 22
logpath = /var/log/auth.log

[postgresql]
enabled = true
port = 5432
logpath = /var/log/postgresql/postgresql-*-*.log
EOF

systemctl restart fail2ban

# Setup monitoring script
cat > /usr/local/bin/check-postgres.sh << 'MONITOR_SCRIPT'
#!/bin/bash
# PostgreSQL Health Check

echo "=== PostgreSQL Status ==="
systemctl status postgresql --no-pager

echo -e "\n=== Database Size ==="
sudo -u postgres psql -c "SELECT pg_database.datname, pg_size_pretty(pg_database_size(pg_database.datname)) AS size FROM pg_database;"

echo -e "\n=== Active Connections ==="
sudo -u postgres psql -c "SELECT count(*) as connections FROM pg_stat_activity;"

echo -e "\n=== Disk Usage ==="
df -h /var/lib/postgresql

echo -e "\n=== Memory Usage ==="
free -h
MONITOR_SCRIPT

chmod +x /usr/local/bin/check-postgres.sh

# Print connection info
echo ""
echo "======================================"
echo "✅ Database Server Setup Complete!"
echo "======================================"
echo ""
echo "📝 Connection Information:"
echo "  Host: $(hostname -I | awk '{print $1}')"
echo "  Port: 5432"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo "  Password: $DB_PASSWORD"
echo ""
echo "🔗 Connection String:"
echo "  postgresql://$DB_USER:$DB_PASSWORD@$(hostname -I | awk '{print $1}'):5432/$DB_NAME"
echo ""
echo "⚙️ Management Commands:"
echo "  Check status:    sudo systemctl status postgresql"
echo "  Restart DB:      sudo systemctl restart postgresql"
echo "  View logs:       sudo tail -f /var/log/postgresql/postgresql-*.log"
echo "  Run backup:      sudo /usr/local/bin/backup-postgres.sh"
echo "  Health check:    sudo /usr/local/bin/check-postgres.sh"
echo ""
echo "💾 Backups:"
echo "  Location:        /var/backups/postgresql/"
echo "  Schedule:        Daily at 2:00 AM"
echo "  Retention:       7 days"
echo ""
echo "🔒 Security:"
echo "  Firewall:        Only allows connection from $APP_SERVER_IP"
echo "  Fail2ban:        Enabled"
echo "  Encryption:      Password MD5"
echo ""
echo "📊 Next Steps:"
echo "  1. Test connection from App Server"
echo "  2. Import initial database schema"
echo "  3. Setup monitoring (optional)"
echo "  4. Configure backup to S3 (optional)"
echo ""

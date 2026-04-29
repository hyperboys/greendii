# Green Dii Database Server Guide

## 🗄️ แนะนำ Database Server แยกต่างหาก

เอกสารนี้อธิบายวิธีการ Setup Database Server แยกจาก Application Server

---

## 📋 Architecture Overview

```
┌──────────────────────────────────┐
│     App Server (Bangkok)         │
│  IP: 103.xxx.xxx.xxx             │
│  -------------------------------- │
│  - Next.js Frontend              │
│  - Node.js/Express API           │
│  - MinIO (File Storage)          │
│  - Nginx (Reverse Proxy)         │
└────────────┬─────────────────────┘
             │
             │ Private/VPN Connection
             │ Port: 5432 (PostgreSQL)
             │
┌────────────▼─────────────────────┐
│   Database Server (Anywhere)     │
│  IP: 95.xxx.xxx.xxx              │
│  -------------------------------- │
│  - PostgreSQL 15                 │
│  - Daily Backup                  │
│  - Monitoring                    │
│  - Firewall (Only App IP)        │
└──────────────────────────────────┘
```

---

## ⚡ Quick Start

### 1. Deploy Database Server

**Recommended Providers:**

| Provider | Plan | Cost | Best For |
|----------|------|------|----------|
| **Hetzner** | CPX21 (4GB/160GB) | 260฿/mo | Storage-heavy, Budget |
| **Vultr** | 4GB Bangkok | 840฿/mo | Low latency |
| **DO Managed** | PostgreSQL 2GB | 1,050฿/mo | Hands-off |

### 2. Run Setup Script

```bash
# SSH to your Database Server
ssh root@YOUR_DB_SERVER_IP

# Download setup script
wget https://raw.githubusercontent.com/.../database-server-setup.sh

# Edit variables
nano database-server-setup.sh
# Change:
# - DB_PASSWORD (strong password)
# - APP_SERVER_IP (your app server IP)

# Run setup
chmod +x database-server-setup.sh
sudo ./database-server-setup.sh
```

### 3. Configure App Server Connection

**Environment Variables (.env.production):**

```env
# Database Configuration
DATABASE_URL="postgresql://greendii_app:YOUR_PASSWORD@DB_SERVER_IP:5432/greendii_production"

# Or separate vars
DB_HOST=95.xxx.xxx.xxx
DB_PORT=5432
DB_NAME=greendii_production
DB_USER=greendii_app
DB_PASSWORD=your_secure_password
DB_SSL=false  # true if using public internet

# Connection Pool
DB_POOL_MIN=2
DB_POOL_MAX=10
```

### 4. Test Connection

**From App Server:**

```bash
# Install PostgreSQL client
sudo apt install postgresql-client -y

# Test connection
psql -h DB_SERVER_IP -U greendii_app -d greendii_production

# If successful, you should see:
# greendii_production=>
```

**Using Node.js (Test Script):**

```javascript
// test-db-connection.js
const { Client } = require('pg');

const client = new Client({
  host: 'DB_SERVER_IP',
  port: 5432,
  database: 'greendii_production',
  user: 'greendii_app',
  password: 'YOUR_PASSWORD'
});

async function testConnection() {
  try {
    await client.connect();
    const res = await client.query('SELECT NOW()');
    console.log('✅ Database connected!');
    console.log('Server time:', res.rows[0].now);
    await client.end();
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  }
}

testConnection();
```

---

## 🔒 Security Best Practices

### 1. Setup SSH Tunnel (Recommended for Production)

**On App Server:**

```bash
# Create SSH tunnel
ssh -N -L 5432:localhost:5432 root@DB_SERVER_IP &

# Then connect to localhost:5432 instead
DATABASE_URL="postgresql://greendii_app:PASSWORD@localhost:5432/greendii_production"
```

### 2. Use WireGuard VPN (Advanced)

**Install on both servers:**

```bash
# More secure than SSH tunnel
# Step-by-step: https://www.wireguard.com/quickstart/
```

### 3. Firewall Rules

```bash
# On Database Server
sudo ufw status

# Should show:
# 5432/tcp    ALLOW    103.xxx.xxx.xxx  (App Server IP only)
# 22/tcp      ALLOW    Anywhere
```

---

## 💾 Backup & Restore

### Manual Backup

```bash
# On Database Server
sudo /usr/local/bin/backup-postgres.sh

# Backups stored in:
ls -lh /var/backups/postgresql/
```

### Restore from Backup

```bash
# On Database Server
sudo -u postgres pg_restore -d greendii_production /var/backups/postgresql/backup_greendii_production_20260401_020000.dump
```

### Backup to S3 (Optional)

```bash
# Install AWS CLI
apt install awscli -y

# Configure
aws configure

# Modify backup script to upload to S3
cat >> /usr/local/bin/backup-postgres.sh << 'EOF'

# Upload to S3
aws s3 cp $BACKUP_DIR/backup_${DB_NAME}_${TIMESTAMP}.dump \
  s3://your-bucket/database-backups/
EOF
```

---

## 📊 Monitoring

### Check Database Health

```bash
# Run health check script
sudo /usr/local/bin/check-postgres.sh
```

### Monitor Performance

```bash
# Active queries
sudo -u postgres psql -c "SELECT pid, usename, application_name, client_addr, state, query FROM pg_stat_activity WHERE state != 'idle';"

# Database size growth
sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('greendii_production'));"

# Table sizes
sudo -u postgres psql greendii_production -c "SELECT schemaname,tablename,pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size FROM pg_tables ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC LIMIT 10;"

# Index usage
sudo -u postgres psql greendii_production -c "SELECT schemaname, tablename, indexname, idx_scan FROM pg_stat_user_indexes ORDER BY idx_scan ASC LIMIT 10;"
```

---

## ⚙️ Performance Tuning

### PostgreSQL Configuration (Already set in script)

```ini
# /etc/postgresql/15/main/postgresql.conf

shared_buffers = 1GB          # 25% of RAM
effective_cache_size = 3GB    # 75% of RAM
maintenance_work_mem = 256MB
work_mem = 10MB
max_connections = 100
```

### Prisma Connection Pool

```typescript
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  
  // Connection pool settings
  connection_limit = 10
}
```

### Node.js pg Pool

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: 5432,
  max: 10,  // Maximum connections
  min: 2,   // Minimum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

---

## 🚨 Troubleshooting

### Cannot connect from App Server

```bash
# 1. Check firewall
sudo ufw status

# 2. Check PostgreSQL is listening
sudo netstat -plnt | grep 5432

# 3. Check pg_hba.conf
sudo cat /etc/postgresql/15/main/pg_hba.conf | grep greendii

# 4. Check logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

### Connection timeout

```bash
# Check if port is open
telnet DB_SERVER_IP 5432

# Check network route
traceroute DB_SERVER_IP

# Ping test
ping DB_SERVER_IP
```

### High memory usage

```bash
# Check connections
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"

# Kill idle connections
sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND state_change < current_timestamp - INTERVAL '5 minutes';"
```

---

## 💰 Cost Comparison

### Setup 1: Budget (680฿/month)
```
App Server:  Vultr 2GB Bangkok          = 420฿
DB Server:   Hetzner CPX21 (4GB/160GB)  = 260฿
```

### Setup 2: Performance (1,680฿/month)
```
App Server:  Vultr 4GB HF Bangkok       = 840฿
DB Server:   Vultr 4GB Bangkok          = 840฿
```

### Setup 3: Managed (1,890฿/month)
```
App Server:  Vultr 4GB Bangkok          = 840฿
DB Server:   DO Managed PostgreSQL 2GB  = 1,050฿
```

---

## 📚 Additional Resources

- PostgreSQL Official Docs: https://www.postgresql.org/docs/15/
- Prisma with PostgreSQL: https://www.prisma.io/docs/concepts/database-connectors/postgresql
- pg Node.js Driver: https://node-postgres.com/
- PostgreSQL Performance Tuning: https://pgtune.leopard.in.ua/

---

## ✅ Checklist

- [ ] Database Server deployed
- [ ] Setup script executed
- [ ] Firewall configured (only App IP allowed)
- [ ] Connection tested from App Server
- [ ] Backup script working (check /var/backups/postgresql)
- [ ] Monitoring setup
- [ ] Environment variables configured
- [ ] Prisma migration run
- [ ] Production data imported
- [ ] Performance tuning applied

---

**Need help? Contact support or check logs!**

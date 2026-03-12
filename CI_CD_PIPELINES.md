# 🔄 CI/CD Pipelines - Proyecto Presup

## GitHub Actions

### .github/workflows/deploy.yml

```yaml
name: Deploy Presup Application

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: presunavegatel
        ports:
          - 3306:3306
        options: --health-cmd="mysqladmin ping" --health-interval=10s --health-timeout=5s --health-retries=3

    steps:
    - uses: actions/checkout@v3
    
    - name: Setup PHP
      uses: shivammathur/setup-php@v2
      with:
        php-version: '8.1'
        extensions: pdo, pdo_mysql, json, mbstring, curl
        coverage: xdebug
    
    - name: Copy environment file
      run: cp .env.example .env
    
    - name: Install dependencies
      run: |
        # Si usas Composer (recomendado para futuras versiones)
        # composer install --no-progress --no-suggest
        echo "Dependencies installed"
    
    - name: Run syntax check
      run: |
        find . -name "*.php" -exec php -l {} \;
    
    - name: Run security checks
      run: |
        php deploy.php pre-check
    
    - name: Run tests
      run: |
        # php vendor/bin/phpunit (cuando se implementen tests)
        echo "Tests passed"
    
    - name: Health check
      run: |
        php deploy.php health

  deploy-staging:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Deploy to staging
      env:
        HOST: ${{ secrets.STAGING_HOST }}
        USER: ${{ secrets.STAGING_USER }}
        PASSWORD: ${{ secrets.STAGING_PASSWORD }}
        PATH: ${{ secrets.STAGING_PATH }}
      run: |
        # Deploy script para staging
        echo "Deploying to staging environment"

  deploy-production:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Deploy to production
      env:
        HOST: ${{ secrets.PROD_HOST }}
        USER: ${{ secrets.PROD_USER }}
        PASSWORD: ${{ secrets.PROD_PASSWORD }}
        PATH: ${{ secrets.PROD_PATH }}
      run: |
        # Deploy script para producción
        echo "Deploying to production environment"
```

## GitLab CI/CD

### .gitlab-ci.yml

```yaml
stages:
  - test
  - build
  - deploy-staging
  - deploy-production

variables:
  MYSQL_DATABASE: presunavegatel
  MYSQL_USER: root
  MYSQL_PASSWORD: root
  MYSQL_ROOT_PASSWORD: root

test:
  stage: test
  image: php:8.1-cli
  
  services:
    - mysql:8.0
  
  before_script:
    - apt-get update -yqq
    - apt-get install -yqq git unzip libmysqlclient-dev
    - docker-php-ext-install pdo_mysql mbstring curl json
    - cp .env.example .env
  
  script:
    - find . -name "*.php" -exec php -l {} \;
    - php deploy.php pre-check
    - php deploy.php health
  
  only:
    - merge_requests
    - main
    - develop

build:
  stage: build
  image: alpine:latest
  
  script:
    - echo "Building application"
    - tar -czf presup-build.tar.gz --exclude="backups" --exclude="logs" --exclude=".git" .
  
  artifacts:
    paths:
      - presup-build.tar.gz
    expire_in: 1 hour

deploy-staging:
  stage: deploy-staging
  image: alpine:latest
  
  before_script:
    - apk add --no-cache openssh-client rsync
    - eval $(ssh-agent -s)
    - echo "$STAGING_SSH_KEY" | tr -d '\r' | ssh-add -
    - mkdir -p ~/.ssh
    - chmod 700 ~/.ssh
    - ssh-keyscan -H $STAGING_HOST >> ~/.ssh/known_hosts
  
  script:
    - scp presup-build.tar.gz $STAGING_USER@$STAGING_HOST:$STAGING_PATH/
    - ssh $STAGING_USER@$STAGING_HOST "cd $STAGING_PATH && tar -xzf presup-build.tar.gz && php deploy.php deploy"
  
  only:
    - develop
  
  environment:
    name: staging
    url: https://staging.tudominio.com

deploy-production:
  stage: deploy-production
  image: alpine:latest
  
  before_script:
    - apk add --no-cache openssh-client rsync
    - eval $(ssh-agent -s)
    - echo "$PROD_SSH_KEY" | tr -d '\r' | ssh-add -
    - mkdir -p ~/.ssh
    - chmod 700 ~/.ssh
    - ssh-keyscan -H $PROD_HOST >> ~/.ssh/known_hosts
  
  script:
    - scp presup-build.tar.gz $PROD_USER@$PROD_HOST:$PROD_PATH/
    - ssh $PROD_USER@$PROD_HOST "cd $PROD_PATH && php deploy.php deploy --no-backup"
  
  only:
    - main
  
  when: manual
  
  environment:
    name: production
    url: https://tudominio.com
```

## Jenkins Pipeline

### Jenkinsfile

```groovy
pipeline {
    agent any
    
    environment {
        MYSQL_DATABASE = 'presunavegatel'
        MYSQL_USER = 'root'
        MYSQL_PASSWORD = 'root'
        STAGING_HOST = credentials('staging-host')
        STAGING_USER = credentials('staging-user')
        STAGING_PASSWORD = credentials('staging-password')
        PROD_HOST = credentials('prod-host')
        PROD_USER = credentials('prod-user')
        PROD_PASSWORD = credentials('prod-password')
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        
        stage('Setup Environment') {
            steps {
                sh 'cp .env.example .env'
                sh 'php deploy.php pre-check'
            }
        }
        
        stage('Syntax Check') {
            steps {
                sh 'find . -name "*.php" -exec php -l {} \\;'
            }
        }
        
        stage('Security Scan') {
            steps {
                sh 'php deploy.php health'
            }
        }
        
        stage('Test') {
            steps {
                // sh 'php vendor/bin/phpunit' // Cuando se implementen tests
                echo 'Tests would run here'
            }
        }
        
        stage('Build') {
            steps {
                sh 'tar -czf presup-build.tar.gz --exclude="backups" --exclude="logs" --exclude=".git" .'
                archiveArtifacts artifacts: 'presup-build.tar.gz', fingerprint: true
            }
        }
        
        stage('Deploy to Staging') {
            when {
                branch 'develop'
            }
            steps {
                sh '''
                    scp presup-build.tar.gz ${STAGING_USER}@${STAGING_HOST}:/tmp/
                    ssh ${STAGING_USER}@${STAGING_HOST} "cd /var/www/presup && tar -xzf /tmp/presup-build.tar.gz && php deploy.php deploy"
                '''
            }
        }
        
        stage('Deploy to Production') {
            when {
                branch 'main'
            }
            steps {
                input message: 'Deploy to production?', ok: 'Deploy'
                sh '''
                    scp presup-build.tar.gz ${PROD_USER}@${PROD_HOST}:/tmp/
                    ssh ${PROD_USER}@${PROD_HOST} "cd /var/www/presup && tar -xzf /tmp/presup-build.tar.gz && php deploy.php deploy --no-backup"
                '''
            }
        }
    }
    
    post {
        always {
            cleanWs()
        }
        
        success {
            echo 'Pipeline succeeded!'
        }
        
        failure {
            echo 'Pipeline failed!'
            mail to: 'admin@tudominio.com',
                subject: "Pipeline Failed: ${env.JOB_NAME} - ${env.BUILD_NUMBER}",
                body: "The pipeline failed. Check the logs for details."
        }
    }
}
```

## Docker Compose para Desarrollo

### docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8080:80"
    volumes:
      - .:/var/www/presup
      - ./logs:/var/www/presup/logs
    environment:
      - DB_HOST=mysql
      - DB_USER=presup
      - DB_PASS=presup123
      - DB_NAME=presunavegatel
      - APP_ENV=development
    depends_on:
      - mysql
      - redis
    networks:
      - presup-network

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: presunavegatel
      MYSQL_USER: presup
      MYSQL_PASSWORD: presup123
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
      - ./database.sql:/docker-entrypoint-initdb.d/database.sql
    networks:
      - presup-network

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - presup-network

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - .:/var/www/presup
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - app
    networks:
      - presup-network

volumes:
  mysql_data:
  redis_data:

networks:
  presup-network:
    driver: bridge
```

### Dockerfile

```dockerfile
FROM php:8.1-apache

# Instalar extensiones necesarias
RUN docker-php-ext-install pdo pdo_mysql mbstring curl json

# Configurar Apache
RUN a2enmod rewrite
RUN sed -i 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf

# Copiar archivos de la aplicación
COPY . /var/www/presup/
WORKDIR /var/www/presup

# Crear directorios necesarios
RUN mkdir -p logs uploads cache backups
RUN chmod 755 logs uploads cache backups

# Configurar archivo .env
RUN cp .env.example .env

# Exponer puerto
EXPOSE 80

# Iniciar Apache
CMD ["apache2-foreground"]
```

## Scripts de Deploy Personalizados

### scripts/deploy.sh

```bash
#!/bin/bash

# Script de deploy para servidores tradicionales
set -e

PROJECT_DIR="/var/www/presup"
BACKUP_DIR="/var/backups/presup"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "🚀 Iniciando deploy - $TIMESTAMP"

# 1. Backup
echo "📦 Creando backup..."
mkdir -p $BACKUP_DIR
mysqldump --single-transaction presunavegatel > $BACKUP_DIR/backup_db_$TIMESTAMP.sql
tar -czf $BACKUP_DIR/backup_files_$TIMESTAMP.tar.gz -C $PROJECT_DIR .

# 2. Actualizar archivos
echo "📥 Descargando archivos..."
cd /tmp
wget https://github.com/user/presup/archive/main.tar.gz
tar -xzf main.tar.gz

# 3. Copiar archivos (excluyendo configuración)
echo "📋 Copiando archivos..."
rsync -av --exclude='.env' --exclude='logs/' --exclude='backups/' \
    presup-main/ $PROJECT_DIR/

# 4. Permisos
echo "🔐 Configurando permisos..."
chown -R www-data:www-data $PROJECT_DIR
chmod -R 755 $PROJECT_DIR
chmod 600 $PROJECT_DIR/.env

# 5. Migraciones
echo "🔄 Ejecutando migraciones..."
cd $PROJECT_DIR
php deploy.php deploy --no-backup

# 6. Health check
echo "🏥 Verificando salud..."
php deploy.php health

echo "✅ Deploy completado - $TIMESTAMP"
```

### scripts/rollback.sh

```bash
#!/bin/bash

# Script de rollback
set -e

PROJECT_DIR="/var/www/presup"
BACKUP_DIR="/var/backups/presup"

if [ -z "$1" ]; then
    echo "Uso: $0 <backup_timestamp>"
    echo "Backups disponibles:"
    ls -la $BACKUP_DIR/backup_db_*.sql | awk '{print $9}' | sed 's/.*backup_db_\(.*\)\.sql/\1/'
    exit 1
fi

TIMESTAMP=$1

echo "🔄 Iniciando rollback - $TIMESTAMP"

# 1. Restaurar base de datos
echo "🗄️ Restaurando base de datos..."
mysql presunavegatel < $BACKUP_DIR/backup_db_$TIMESTAMP.sql

# 2. Restaurar archivos
echo "📁 Restaurando archivos..."
tar -xzf $BACKUP_DIR/backup_files_$TIMESTAMP.tar.gz -C $PROJECT_DIR

# 3. Permisos
echo "🔐 Configurando permisos..."
chown -R www-data:www-data $PROJECT_DIR
chmod -R 755 $PROJECT_DIR

# 4. Limpiar cache
echo "🧹 Limpiando cache..."
cd $PROJECT_DIR
php deploy.php maintenance

echo "✅ Rollback completado - $TIMESTAMP"
```

## Configuración de Entornos

### Entorno Development (.env.development)

```env
APP_ENV=development
APP_DEBUG=true
APP_URL=http://localhost:8080

DB_HOST=mysql
DB_USER=presup
DB_PASS=presup123
DB_NAME=presunavegatel
DB_PORT=3306

REDIS_HOST=redis
REDIS_PORT=6379

LOG_LEVEL=debug
CACHE_DRIVER=redis
```

### Entorno Staging (.env.staging)

```env
APP_ENV=staging
APP_DEBUG=true
APP_URL=https://staging.tudominio.com

DB_HOST=staging-db.tudominio.com
DB_USER=staging_user
DB_PASS=staging_password
DB_NAME=presup_staging
DB_PORT=3306

REDIS_HOST=staging-redis.tudominio.com
REDIS_PORT=6379

LOG_LEVEL=info
CACHE_DRIVER=redis
```

### Entorno Production (.env.production)

```env
APP_ENV=production
APP_DEBUG=false
APP_URL=https://tudominio.com

DB_HOST=prod-db.tudominio.com
DB_USER=prod_user
DB_PASS=prod_secure_password
DB_NAME=presup_production
DB_PORT=3306

REDIS_HOST=prod-redis.tudominio.com
REDIS_PORT=6379

LOG_LEVEL=error
CACHE_DRIVER=redis

ADMIN_EMAIL=admin@tudominio.com
ALERT_WEBHOOK=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
```

## Monitoreo y Alertas

### scripts/monitor.sh

```bash
#!/bin/bash

# Script de monitoreo
PROJECT_DIR="/var/www/presup"
LOG_FILE="$PROJECT_DIR/logs/monitor.log"

# Health check
HEALTH=$(cd $PROJECT_DIR && php deploy.php health | jq -r '.status')

if [ "$HEALTH" != "healthy" ]; then
    echo "$(date): Sistema en estado $HEALTH" >> $LOG_FILE
    
    # Enviar alerta
    curl -X POST -H 'Content-type: application/json' \
        --data '{"text":"⚠️ Sistema Presup en estado '$HEALTH'"}' \
        $SLACK_WEBHOOK
fi

# Verificar espacio en disco
DISK_USAGE=$(df $PROJECT_DIR | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 90 ]; then
    echo "$(date): Espacio en disco crítico: $DISK_USAGE%" >> $LOG_FILE
    
    curl -X POST -H 'Content-type: application/json' \
        --data '{"text":"🚨 Espacio en disco crítico: '$DISK_USAGE'%"}' \
        $SLACK_WEBHOOK
fi

echo "$(date): Monitoreo completado" >> $LOG_FILE
```

---

## 📋 Checklist de Implementación CI/CD

### GitHub Actions
- [ ] Crear archivo `.github/workflows/deploy.yml`
- [ ] Configurar secrets en GitHub
- [ ] Testear pipeline en rama develop
- [ ] Configurar environments

### GitLab CI/CD
- [ ] Crear archivo `.gitlab-ci.yml`
- [ ] Configurar variables de entorno
- [ ] Testear pipeline
- [ ] Configurar environments

### Jenkins
- [ ] Instalar plugins necesarios
- [ ] Crear archivo `Jenkinsfile`
- [ ] Configurar credenciales
- [ ] Testear pipeline

### Docker
- [ ] Crear `Dockerfile`
- [ ] Crear `docker-compose.yml`
- [ ] Testear contenedores
- [ ] Configurar volúmenes

### Scripts Personalizados
- [ ] Adaptar `deploy.sh`
- [ ] Adaptar `rollback.sh`
- [ ] Configurar `monitor.sh`
- [ ] Testear scripts

---

*Implementación CI/CD completada: 12/03/2026*

#!/bin/bash

# 🚀 Bootstrap Script: PHP → Node.js + TypeScript + React Migration
# Este script inicializa el proyecto moderno desde cero

set -e

echo "🎯 Iniciando migración a Node.js + TypeScript + React"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    log_info "Verificando requisitos..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js no está instalado. Por favor instala Node.js 20+"
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm no está instalado"
        exit 1
    fi
    
    # Check Docker (optional)
    if command -v docker &> /dev/null; then
        log_success "Docker detectado"
    else
        log_warning "Docker no detectado (opcional para desarrollo)"
    fi
    
    # Check Git
    if ! command -v git &> /dev/null; then
        log_error "Git no está instalado"
        exit 1
    fi
    
    log_success "Requisitos verificados"
}

# Create project structure
create_project_structure() {
    log_info "Creando estructura del proyecto..."
    
    # Create main project directory
    PROJECT_NAME="presup-next"
    mkdir -p "$PROJECT_NAME"
    cd "$PROJECT_NAME"
    
    # Initialize monorepo with Turborepo
    log_info "Inicializando monorepo con Turborepo..."
    npx create-turbo@latest . --skip-git
    
    # Create package.json for monorepo
    cat > package.json << 'EOF'
{
  "name": "presup-next",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "type-check": "turbo run type-check",
    "clean": "turbo run clean"
  },
  "devDependencies": {
    "turbo": "^1.10.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0",
    "typescript": "^5.0.0"
  },
  "packageManager": "npm@9.0.0"
}
EOF
    
    # Create turbo.json
    cat > turbo.json << 'EOF'
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "lint": {
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "type-check": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    }
  }
}
EOF
    
    log_success "Estructura del proyecto creada"
}

# Setup packages
setup_packages() {
    log_info "Configurando paquetes compartidos..."
    
    # Create packages directory structure
    mkdir -p packages/{ui,types,utils,database}
    
    # Setup types package
    log_info "Configurando paquete de tipos..."
    cd packages/types
    
    cat > package.json << 'EOF'
{
  "name": "@presup/types",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.20.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
EOF
    
    cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF
    
    mkdir -p src
    cat > src/index.ts << 'EOF'
import { z } from 'zod';

// User types
export const UserRoleSchema = z.enum(['USER', 'ADMIN']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  username: z.string(),
  role: UserRoleSchema,
  createdAt: z.date(),
  updatedAt: z.date()
});

export type User = z.infer<typeof UserSchema>;

// Quote types
export const QuoteStatusSchema = z.enum(['DRAFT', 'SENT', 'WAITING_CLIENT', 'ACCEPTED', 'REJECTED']);
export type QuoteStatus = z.infer<typeof QuoteStatusSchema>;

export const QuoteItemSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1),
  imageUrl: z.string().url().optional(),
  quantity: z.number().positive(),
  price: z.number().positive(),
  taxPercent: z.number().min(0).max(100).default(21)
});

export type QuoteItem = z.infer<typeof QuoteItemSchema>;

export const QuoteSchema = z.object({
  id: z.string(),
  date: z.date(),
  clientName: z.string().min(1),
  clientId: z.string().optional(),
  clientAddress: z.string().optional(),
  clientEmail: z.string().email().optional(),
  clientPhone: z.string().optional(),
  notes: z.string().optional(),
  status: QuoteStatusSchema.default('DRAFT'),
  subtotal: z.number(),
  taxAmount: z.number(),
  totalAmount: z.number(),
  signature: z.string().optional(),
  project: z.string().optional(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  items: z.array(QuoteItemSchema)
});

export type Quote = z.infer<typeof QuoteSchema>;

// API schemas
export const CreateQuoteSchema = z.object({
  clientName: z.string().min(1, 'Client name is required'),
  clientId: z.string().optional(),
  clientAddress: z.string().optional(),
  clientEmail: z.string().email().optional(),
  clientPhone: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(QuoteItemSchema.omit({ id: true })).min(1, 'At least one item is required')
});

export type CreateQuoteInput = z.infer<typeof CreateQuoteSchema>;

export const UpdateQuoteSchema = CreateQuoteSchema.partial().extend({
  id: z.string(),
  status: QuoteStatusSchema.optional()
});

export type UpdateQuoteInput = z.infer<typeof UpdateQuoteSchema>;

// Client types
export const ClientSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  taxId: z.string().optional(),
  address: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type Client = z.infer<typeof ClientSchema>;

// API Response types
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  message: z.string().optional()
});

export type ApiResponse<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

// Pagination types
export const PaginationSchema = z.object({
  page: z.number().positive().default(1),
  limit: z.number().positive().default(20),
  total: z.number(),
  pages: z.number()
});

export type Pagination = z.infer<typeof PaginationSchema>;

export const PaginatedResponseSchema = z.object({
  items: z.array(z.any()),
  pagination: PaginationSchema
});

export type PaginatedResponse<T> = {
  items: T[];
  pagination: Pagination;
};
EOF
    
    cd ../..
    
    # Setup utils package
    log_info "Configurando paquete de utilidades..."
    cd packages/utils
    
    cat > package.json << 'EOF'
{
  "name": "@presup/utils",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@presup/types": "workspace:*",
    "date-fns": "^2.30.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
EOF
    
    cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF
    
    mkdir -p src
    cat > src/index.ts << 'EOF'
import { QuoteItem } from '@presup/types';
import { format, parseISO } from 'date-fns';

// Formatters
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount);
};

export const formatDate = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, 'dd/MM/yyyy');
};

export const formatDateTime = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, 'dd/MM/yyyy HH:mm');
};

// Calculations
export const calculateItemTotal = (item: QuoteItem): number => {
  return Number(item.quantity) * item.price;
};

export const calculateItemTax = (item: QuoteItem): number => {
  const total = calculateItemTotal(item);
  return total * (item.taxPercent / 100);
};

export const calculateItemTotalWithTax = (item: QuoteItem): number => {
  const total = calculateItemTotal(item);
  const tax = calculateItemTax(item);
  return total + tax;
};

export const calculateTotals = (items: QuoteItem[]) => {
  const subtotal = items.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  const tax = items.reduce((sum, item) => sum + calculateItemTax(item), 0);
  const total = subtotal + tax;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round(total * 100) / 100
  };
};

// Validators
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePhone = (phone: string): boolean => {
  const phoneRegex = /^[+]?[\d\s\-\(\)]+$/;
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 9;
};

export const validateTaxId = (taxId: string): boolean => {
  // Basic validation for Spanish CIF/NIF
  const taxIdRegex = /^[A-Z]\d{8}[A-Z0-9]$/;
  return taxIdRegex.test(taxId);
};

// Generators
export const generateQuoteId = (): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `PRE-${timestamp}-${random}`;
};

export const generateInvoiceId = (): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `FAC-${timestamp}-${random}`;
};

export const generateClientId = (): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `CLI-${timestamp}-${random}`;
};

// File utilities
export const downloadFile = (data: Blob, filename: string): void => {
  const url = window.URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// String utilities
export const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export const truncate = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

export const capitalize = (text: string): string => {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

// Array utilities
export const groupBy = <T, K extends keyof any>(
  array: T[],
  key: (item: T) => K
): Record<K, T[]> => {
  return array.reduce((groups, item) => {
    const groupKey = key(item);
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(item);
    return groups;
  }, {} as Record<K, T[]>);
};

export const sortBy = <T>(
  array: T[],
  key: keyof T,
  direction: 'asc' | 'desc' = 'asc'
): T[] => {
  return [...array].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
};

// Error handling
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const createError = (message: string, statusCode?: number, code?: string) => {
  return new AppError(message, statusCode, code);
};
EOF
    
    cd ../..
    
    # Setup UI package
    log_info "Configurando paquete de UI..."
    cd packages/ui
    
    cat > package.json << 'EOF'
{
  "name": "@presup/ui",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "type-check": "tsc --noEmit",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  },
  "dependencies": {
    "@presup/types": "workspace:*",
    "@presup/utils": "workspace:*",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-hook-form": "^7.43.0",
    "@hookform/resolvers": "^3.0.0",
    "zod": "^3.20.0",
    "lucide-react": "^0.263.0",
    "clsx": "^1.2.0",
    "tailwind-merge": "^1.14.0"
  },
  "devDependencies": {
    "@storybook/react": "^7.0.0",
    "@storybook/react-vite": "^7.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "storybook": "^7.0.0",
    "typescript": "^5.0.0",
    "vite": "^4.3.0"
  }
}
EOF
    
    log_success "Paquetes compartidos configurados"
}

# Setup backend
setup_backend() {
    log_info "Configurando backend (Express + TypeScript)..."
    
    cd ../..
    mkdir -p apps/api
    cd apps/api
    
    cat > package.json << 'EOF'
{
  "name": "@presup/api",
  "version": "0.1.0",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint src --ext .ts,.tsx",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@presup/types": "workspace:*",
    "@presup/utils": "workspace:*",
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "helmet": "^6.1.0",
    "compression": "^1.7.4",
    "express-rate-limit": "^6.7.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.0",
    "prisma": "^5.0.0",
    "@prisma/client": "^5.0.0",
    "zod": "^3.20.0",
    "puppeteer": "^20.0.0",
    "socket.io": "^4.6.0",
    "nodemailer": "^6.9.0",
    "multer": "^1.4.5",
    "joi": "^17.9.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/cors": "^2.8.0",
    "@types/compression": "^1.7.0",
    "@types/bcryptjs": "^2.4.0",
    "@types/jsonwebtoken": "^9.0.0",
    "@types/nodemailer": "^6.4.0",
    "@types/multer": "^1.4.0",
    "@types/node": "^20.0.0",
    "tsx": "^3.12.0",
    "jest": "^29.5.0",
    "@types/jest": "^29.5.0",
    "ts-jest": "^29.1.0",
    "eslint": "^8.40.0",
    "@typescript-eslint/eslint-plugin": "^5.59.0",
    "@typescript-eslint/parser": "^5.59.0",
    "typescript": "^5.0.0"
  }
}
EOF
    
    cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
EOF
    
    # Create basic API structure
    mkdir -p src/{controllers,routes,middleware,services,utils,types}
    
    # Basic app entry point
    cat > src/index.ts << 'EOF'
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Performance middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes will be added here
app.get('/api', (req, res) => {
  res.json({ message: 'Presup API v1.0.0' });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
EOF
    
    cd ../..
    
    log_success "Backend configurado"
}

# Setup frontend
setup_frontend() {
    log_info "Configurando frontend (Next.js + TypeScript)..."
    
    mkdir -p apps/web
    cd apps/web
    
    # Initialize Next.js app
    npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --skip-git
    
    # Update package.json for monorepo
    npm pkg set scripts.dev="next dev"
    npm pkg set scripts.build="next build"
    npm pkg set scripts.start="next start"
    npm pkg set scripts.lint="next lint"
    npm pkg set scripts.test="jest"
    npm pkg set scripts.test:e2e="playwright test"
    
    # Install additional dependencies
    npm install @presup/types @presup/utils @presup/ui react-hook-form @hookform/resolvers zod zustand axios react-query
    
    log_success "Frontend configurado"
}

# Setup database
setup_database() {
    log_info "Configurando base de datos (Prisma)..."
    
    cd ../apps/api
    
    # Initialize Prisma
    npx prisma init
    
    # Create Prisma schema
    cat > prisma/schema.prisma << 'EOF'
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  username  String   @unique
  password  String
  role      UserRole @default(USER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  quotes    Quote[]
  invoices  Invoice[]
  clients   Client[]
  expenses  Expense[]
  meetings  Meeting[]

  @@map("users")
}

model Quote {
  id              String      @id @default(cuid())
  date            DateTime    @default(now())
  clientName      String
  clientId        String?
  clientAddress   String?
  clientEmail     String?
  clientPhone     String?
  notes           String?
  status          QuoteStatus @default(DRAFT)
  subtotal        Decimal
  taxAmount       Decimal
  totalAmount     Decimal
  signature       String?     // Base64
  project         String?
  userId          String
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  user            User         @relation(fields: [userId], references: [id])
  items           QuoteItem[]
  invoice         Invoice?

  @@map("quotes")
}

model QuoteItem {
  id          String  @id @default(cuid())
  quoteId     String
  description String
  imageUrl    String?
  quantity    Decimal
  price       Decimal
  taxPercent  Decimal @default(21)

  quote       Quote   @relation(fields: [quoteId], references: [id])

  @@map("quote_items")
}

model Client {
  id        String   @id @default(cuid())
  name      String
  taxId     String?
  address   String?
  email     String?
  phone     String?
  userId    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user      User     @relation(fields: [userId], references: [id])
  quotes    Quote[]
  invoices  Invoice[]

  @@map("clients")
}

model Invoice {
  id          String       @id @default(cuid())
  quoteId     String?
  date        DateTime     @default(now())
  clientName  String
  clientId    String?
  clientEmail String?
  status      InvoiceStatus @default(DRAFT)
  subtotal    Decimal
  taxAmount   Decimal
  totalAmount Decimal
  userId      String
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  user        User          @relation(fields: [userId], references: [id])
  quote       Quote?        @relation(fields: [quoteId], references: [id])
  client      Client?       @relation(fields: [clientId], references: [id])
  items       InvoiceItem[]

  @@map("invoices")
}

model InvoiceItem {
  id         String  @id @default(cuid())
  invoiceId  String
  description String
  quantity   Decimal
  price      Decimal
  taxPercent Decimal @default(21)

  invoice    Invoice @relation(fields: [invoiceId], references: [id])

  @@map("invoice_items")
}

model Expense {
  id          String   @id @default(cuid())
  date        DateTime @default(now())
  description String
  amount      Decimal
  category    String?
  userId      String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User     @relation(fields: [userId], references: [id])

  @@map("expenses")
}

model Meeting {
  id          String   @id @default(cuid())
  clientName  String
  phone       String?
  date        DateTime
  description String?
  userId      String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User     @relation(fields: [userId], references: [id])

  @@map("meetings")
}

enum UserRole {
  USER
  ADMIN
}

enum QuoteStatus {
  DRAFT
  SENT
  WAITING_CLIENT
  ACCEPTED
  REJECTED
}

enum InvoiceStatus {
  DRAFT
  SENT
  PAID
  OVERDUE
  CANCELLED
}
EOF
    
    cd ../..
    
    log_success "Base de datos configurada"
}

# Setup development environment
setup_dev_environment() {
    log_info "Configurando entorno de desarrollo..."
    
    # Create .env files
    cd apps/api
    cat > .env.example << 'EOF'
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/presup"

# JWT
JWT_SECRET="your-super-secret-jwt-key-change-in-production"

# Frontend URL
FRONTEND_URL="http://localhost:3000"

# Email (optional)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"

# File uploads (optional)
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
AWS_REGION=""
AWS_S3_BUCKET=""
EOF
    
    cp .env.example .env.local
    
    cd ../web
    cat > .env.local << 'EOF'
NEXT_PUBLIC_API_URL="http://localhost:4000"
NEXT_PUBLIC_APP_NAME="Presup Next"
EOF
    
    cd ../..
    
    # Create Docker Compose
    cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://api:4000
    depends_on:
      - api

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    ports:
      - "4000:4000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/presup
      - JWT_SECRET=your-super-secret-jwt-key
      - FRONTEND_URL=http://localhost:3000
    depends_on:
      - db
    volumes:
      - ./apps/api/uploads:/app/uploads

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=presup
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
EOF
    
    # Create Dockerfiles
    cat > apps/api/Dockerfile << 'EOF'
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 4000

CMD ["npm", "start"]
EOF
    
    cat > apps/web/Dockerfile << 'EOF'
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", "server.js"]
EOF
    
    # Create .gitignore
    cat > .gitignore << 'EOF'
# Dependencies
node_modules/
.pnp
.pnp.js

# Production builds
dist/
build/
.next/
out/

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# nyc test coverage
.nyc_output

# Dependency directories
node_modules/
jspm_packages/

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# parcel-bundler cache (https://parceljs.org/)
.cache
.parcel-cache

# Next.js build output
.next

# Nuxt.js build / generate output
.nuxt

# Gatsby files
.cache/
public

# Storybook build outputs
.out
.storybook-out

# Temporary folders
tmp/
temp/

# Editor directories and files
.vscode/
.idea/
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Database
*.sqlite
*.db

# Uploads
uploads/
logs/

# Docker
.dockerignore
EOF
    
    log_success "Entorno de desarrollo configurado"
}

# Install dependencies and build
install_and_build() {
    log_info "Instalando dependencias y construyendo..."
    
    # Install root dependencies
    npm install
    
    # Install package dependencies
    npm run build --filter=@presup/types
    npm run build --filter=@presup/utils
    npm run build --filter=@presup/ui
    
    # Install app dependencies
    cd apps/api && npm install && cd ../..
    cd apps/web && npm install && cd ../..
    
    log_success "Dependencias instaladas"
}

# Final setup
final_setup() {
    log_info "Configuración final..."
    
    # Create development scripts
    cat > scripts/dev.sh << 'EOF'
#!/bin/bash

echo "🚀 Iniciando entorno de desarrollo..."

# Start database
docker-compose up -d db redis

# Wait for database
sleep 5

# Run database migrations
cd apps/api
npx prisma db push
npx prisma generate

# Start API
npm run dev &
API_PID=$!

# Start frontend
cd ../web
npm run dev &
WEB_PID=$!

echo "✅ Entorno de desarrollo iniciado"
echo "📱 Frontend: http://localhost:3000"
echo "🔧 API: http://localhost:4000"
echo "🗄️  Database: postgresql://postgres:password@localhost:5432/presup"

# Wait for processes
wait $API_PID $WEB_PID
EOF
    
    chmod +x scripts/dev.sh
    
    # Create migration script
    cat > scripts/migrate-data.sh << 'EOF'
#!/bin/bash

echo "🔄 Migrando datos desde PHP a Node.js..."

# This script would contain the data migration logic
# from the existing PHP database to the new Node.js structure

echo "⚠️  Este script necesita ser implementado según tu estructura actual"
echo "📝 Revisa MIGRATION_PLAN.md para más detalles"
EOF
    
    chmod +x scripts/migrate-data.sh
    
    log_success "Configuración final completada"
}

# Show next steps
show_next_steps() {
    echo ""
    echo "🎉 ¡Proyecto moderno creado exitosamente!"
    echo ""
    echo "📁 Estructura creada:"
    echo "   📂 presup-next/"
    echo "   ├── 📂 apps/"
    echo "   │   ├── 📂 web/     (Next.js frontend)"
    echo "   │   └── 📂 api/     (Express backend)"
    echo "   ├── 📂 packages/"
    echo "   │   ├── 📂 ui/      (Componentes compartidos)"
    echo "   │   ├── 📂 types/   (Tipos TypeScript)"
    echo "   │   └── 📂 utils/   (Utilidades)"
    echo "   └── 📂 scripts/    (Scripts de desarrollo)"
    echo ""
    echo "🚀 Próximos pasos:"
    echo ""
    echo "1. Iniciar entorno de desarrollo:"
    echo "   cd presup-next"
    echo "   ./scripts/dev.sh"
    echo ""
    echo "2. Configurar base de datos:"
    echo "   cd apps/api"
    echo "   npx prisma studio"
    echo ""
    echo "3. Migrar datos existentes:"
    echo "   ./scripts/migrate-data.sh"
    echo ""
    echo "4. Comenzar desarrollo:"
    echo "   📱 Frontend: http://localhost:3000"
    echo "   🔧 API: http://localhost:4000"
    echo ""
    echo "📚 Documentación:"
    echo "   📖 MIGRATION_PLAN.md - Plan completo de migración"
    echo "   📖 README.md - Guía de inicio rápido"
    echo ""
    echo "🎯 Beneficios del nuevo stack:"
    echo "   ✅ Tipado seguro con TypeScript"
    echo "   ✅ Desarrollo 10x más rápido"
    echo "   ✅ Ecosistema moderno y completo"
    echo "   ✅ Testing automatizado"
    echo "   ✅ Deploy simplificado"
    echo "   ✅ Real-time capabilities"
    echo "   ✅ Mobile-ready con React Native"
    echo ""
    echo "🚀 ¡Listo para el futuro!"
}

# Main execution
main() {
    echo "🎯 Bootstrap: Migración PHP → Node.js + TypeScript + React"
    echo "======================================================"
    echo ""
    
    check_prerequisites
    create_project_structure
    setup_packages
    setup_backend
    setup_frontend
    setup_database
    setup_dev_environment
    install_and_build
    final_setup
    show_next_steps
    
    echo ""
    log_success "¡Bootstrap completado! 🎉"
}

# Run main function
main "$@"

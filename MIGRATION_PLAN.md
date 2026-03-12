# 🔄 Plan de Migración: PHP → Node.js + TypeScript + React

## 📋 Resumen Ejecutivo

**Duración estimada:** 12-14 semanas  
**Inversión:** 3-4 meses desarrollo  
**ROI:** 10+ años de mantenimiento simplificado + capacidades expandidas  

---

## 🎯 Arquitectura Moderna

### Stack Tecnológico
```
Frontend: Next.js 14 + TypeScript + Tailwind CSS + Zustand
Backend: Node.js 20 + TypeScript + Express + Prisma
Database: PostgreSQL 15 + Redis
Infrastructure: Docker + Vercel/Railway
Testing: Jest + Playwright + Cypress
CI/CD: GitHub Actions
Monitoring: Sentry + LogRocket
```

### Estructura de Proyecto
```
presup-next/
├── apps/
│   ├── web/                 # Next.js frontend
│   └── api/                 # Express backend
├── packages/
│   ├── ui/                  # Componentes compartidos
│   ├── types/               # Tipos TypeScript
│   └── utils/               # Utilidades compartidas
├── docs/                   # Documentación
├── docker-compose.yml
├── package.json
└── turbo.json             # Monorepo manager
```

---

## 📅 Cronograma de Migración

### Fase 1: Foundation (Semanas 1-2)
- ✅ Setup monorepo con Turborepo
- ✅ Configurar TypeScript y ESLint
- ✅ Migrar base de datos a Prisma
- ✅ Setup Docker development

### Fase 2: Backend Core (Semanas 3-6)
- ✅ API REST con Express + TypeScript
- ✅ Autenticación moderna (NextAuth.js)
- ✅ Validación con Zod
- ✅ Prisma ORM con PostgreSQL
- ✅ Testing unitario con Jest

### Fase 3: Frontend Moderno (Semanas 7-10)
- ✅ Migrar UI a React + TypeScript
- ✅ Estado global con Zustand
- ✅ Forms con React Hook Form + Zod
- ✅ PDF generation con Puppeteer
- ✅ Testing E2E con Playwright

### Fase 4: Advanced Features (Semanas 11-12)
- ✅ Real-time con Socket.io
- ✅ File uploads con AWS S3
- ✅ Email con Resend
- ✅ Dashboard de analytics

### Fase 5: Deploy & Migration (Semanas 13-14)
- ✅ CI/CD con GitHub Actions
- ✅ Deploy en Vercel/Railway
- ✅ Data migration scripts
- ✅ Go-live strategy

---

## 🏗️ Implementación Detallada

### Fase 1: Foundation

#### 1.1 Setup Monorepo
```bash
# Inicializar monorepo
npx create-turbo@latest presup-next

# Estructura de paquetes
mkdir -p apps/web apps/api packages/ui packages/types packages/utils
```

#### 1.2 Configuración TypeScript
```json
// tsconfig.json (raíz)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "paths": {
      "@/*": ["./apps/*"],
      "@/ui/*": ["./packages/ui/*"],
      "@/types/*": ["./packages/types/*"],
      "@/utils/*": ["./packages/utils/*"]
    }
  }
}
```

#### 1.3 Prisma Schema
```prisma
// packages/database/schema.prisma
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
  customers Customer[]
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
```

---

### Fase 2: Backend Moderno

#### 2.1 API Structure
```typescript
// apps/api/src/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import { authRouter } from './routes/auth';
import { quotesRouter } from './routes/quotes';
import { clientsRouter } from './routes/clients';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));

// Performance middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
}));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/quotes', authMiddleware, quotesRouter);
app.use('/api/clients', authMiddleware, clientsRouter);

// Error handling
app.use(errorHandler);

export { app };
```

#### 2.2 Tipos y Validación
```typescript
// packages/types/schemas.ts
import { z } from 'zod';

export const CreateQuoteSchema = z.object({
  clientName: z.string().min(1, 'Client name is required'),
  clientId: z.string().optional(),
  clientAddress: z.string().optional(),
  clientEmail: z.string().email().optional(),
  clientPhone: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    description: z.string().min(1),
    imageUrl: z.string().url().optional(),
    quantity: z.number().positive(),
    price: z.number().positive(),
    taxPercent: z.number().min(0).max(100).default(21)
  })).min(1, 'At least one item is required')
});

export type CreateQuoteInput = z.infer<typeof CreateQuoteSchema>;

export const UpdateQuoteSchema = CreateQuoteSchema.partial().extend({
  id: z.string(),
  status: z.enum(['DRAFT', 'SENT', 'WAITING_CLIENT', 'ACCEPTED', 'REJECTED']).optional()
});

export type UpdateQuoteInput = z.infer<typeof UpdateQuoteSchema>;
```

#### 2.3 Quote Controller
```typescript
// apps/api/src/controllers/quoteController.ts
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { CreateQuoteInput, UpdateQuoteInput } from '@presup/types';
import { calculateQuoteTotals } from '@presup/utils';

const prisma = new PrismaClient();

export class QuoteController {
  async create(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const validatedData: CreateQuoteInput = CreateQuoteSchema.parse(req.body);
      
      // Calculate totals
      const { subtotal, taxAmount, totalAmount } = calculateQuoteTotals(validatedData.items);
      
      const quote = await prisma.quote.create({
        data: {
          ...validatedData,
          subtotal,
          taxAmount,
          totalAmount,
          userId,
          items: {
            create: validatedData.items
          }
        },
        include: {
          items: true,
          user: {
            select: { id: true, username: true, email: true }
          }
        }
      });

      res.status(201).json(quote);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async findAll(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { status, page = 1, limit = 20 } = req.query;
      
      const where = {
        userId,
        ...(status && { status: status as string })
      };

      const [quotes, total] = await Promise.all([
        prisma.quote.findMany({
          where,
          include: {
            items: true,
            user: { select: { id: true, username: true } }
          },
          orderBy: { date: 'desc' },
          skip: (Number(page) - 1) * Number(limit),
          take: Number(limit)
        }),
        prisma.quote.count({ where })
      ]);

      res.json({
        quotes,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async findOne(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const quote = await prisma.quote.findFirst({
        where: { id, userId },
        include: {
          items: true,
          user: { select: { id: true, username: true, email: true } }
        }
      });

      if (!quote) {
        return res.status(404).json({ error: 'Quote not found' });
      }

      res.json(quote);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const validatedData: UpdateQuoteInput = UpdateQuoteSchema.parse(req.body);

      // Verify ownership
      const existingQuote = await prisma.quote.findFirst({
        where: { id, userId }
      });

      if (!existingQuote) {
        return res.status(404).json({ error: 'Quote not found' });
      }

      // Recalculate totals if items changed
      let updateData = validatedData;
      if (validatedData.items) {
        const { subtotal, taxAmount, totalAmount } = calculateQuoteTotals(validatedData.items);
        updateData = { ...validatedData, subtotal, taxAmount, totalAmount };
      }

      const quote = await prisma.quote.update({
        where: { id },
        data: {
          ...updateData,
          updatedAt: new Date()
        },
        include: {
          items: true,
          user: { select: { id: true, username: true } }
        }
      });

      res.json(quote);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async remove(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const quote = await prisma.quote.findFirst({
        where: { id, userId }
      });

      if (!quote) {
        return res.status(404).json({ error: 'Quote not found' });
      }

      await prisma.quote.delete({
        where: { id }
      });

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}
```

#### 2.4 Routes
```typescript
// apps/api/src/routes/quotes.ts
import { Router } from 'express';
import { QuoteController } from '../controllers/quoteController';
import { validateRequest } from '../middleware/validation';
import { CreateQuoteSchema, UpdateQuoteSchema } from '@presup/types';

const router = Router();
const quoteController = new QuoteController();

router.post('/', validateRequest(CreateQuoteSchema), quoteController.create.bind(quoteController));
router.get('/', quoteController.findAll.bind(quoteController));
router.get('/:id', quoteController.findOne.bind(quoteController));
router.put('/:id', validateRequest(UpdateQuoteSchema), quoteController.update.bind(quoteController));
router.delete('/:id', quoteController.remove.bind(quoteController));

export { router as quotesRouter };
```

---

### Fase 3: Frontend Moderno

#### 3.1 Next.js Setup
```typescript
// apps/web/next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  images: {
    domains: ['example.com'], // Para logos de clientes
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
};

module.exports = nextConfig;
```

#### 3.2 Componentes UI Modernos
```typescript
// packages/ui/components/QuoteEditor.tsx
'use client';

import React, { useState, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, Save, Send } from 'lucide-react';

import { Button } from './Button';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { CreateQuoteInput } from '@presup/types';
import { calculateTotals } from '@presup/utils';

interface QuoteEditorProps {
  initialData?: Partial<CreateQuoteInput>;
  onSave: (data: CreateQuoteInput) => Promise<void>;
  onSend?: (data: CreateQuoteInput) => Promise<void>;
}

export function QuoteEditor({ initialData, onSave, onSend }: QuoteEditorProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [totals, setTotals] = useState({ subtotal: 0, tax: 0, total: 0 });

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<CreateQuoteInput>({
    resolver: zodResolver(CreateQuoteSchema),
    defaultValues: {
      clientName: '',
      items: [{ description: '', quantity: 1, price: 0, taxPercent: 21 }],
      ...initialData
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items'
  });

  const items = watch('items');

  // Recalculate totals when items change
  React.useEffect(() => {
    const newTotals = calculateTotals(items || []);
    setTotals(newTotals);
  }, [items]);

  const handleSave = useCallback(async (data: CreateQuoteInput) => {
    setIsSubmitting(true);
    try {
      await onSave(data);
    } finally {
      setIsSubmitting(false);
    }
  }, [onSave]);

  const handleSend = useCallback(async (data: CreateQuoteInput) => {
    setIsSubmitting(true);
    try {
      if (onSend) {
        await onSend(data);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [onSend]);

  const addItem = useCallback(() => {
    append({ description: '', quantity: 1, price: 0, taxPercent: 21 });
  }, [append]);

  return (
    <form onSubmit={handleSubmit(handleSave)} className="space-y-6">
      {/* Client Information */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Client Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Input
              label="Client Name *"
              {...register('clientName')}
              error={errors.clientName?.message}
            />
          </div>
          <div>
            <Input
              label="Email"
              type="email"
              {...register('clientEmail')}
              error={errors.clientEmail?.message}
            />
          </div>
          <div>
            <Input
              label="Phone"
              {...register('clientPhone')}
              error={errors.clientPhone?.message}
            />
          </div>
          <div>
            <Input
              label="Address"
              {...register('clientAddress')}
              error={errors.clientAddress?.message}
            />
          </div>
        </div>
        <div className="mt-4">
          <Textarea
            label="Notes"
            rows={3}
            {...register('notes')}
            error={errors.notes?.message}
          />
        </div>
      </div>

      {/* Items */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Items</h3>
          <Button type="button" onClick={addItem} variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Add Item
          </Button>
        </div>

        <div className="space-y-4">
          {fields.map((field, index) => (
            <div key={field.id} className="border rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="md:col-span-2">
                  <Input
                    label="Description *"
                    {...register(`items.${index}.description`)}
                    error={errors.items?.[index]?.description?.message}
                  />
                </div>
                <div>
                  <Input
                    label="Quantity *"
                    type="number"
                    step="0.01"
                    {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                    error={errors.items?.[index]?.quantity?.message}
                  />
                </div>
                <div>
                  <Input
                    label="Price *"
                    type="number"
                    step="0.01"
                    {...register(`items.${index}.price`, { valueAsNumber: true })}
                    error={errors.items?.[index]?.price?.message}
                  />
                </div>
                <div className="flex items-end">
                  <div className="flex gap-2">
                    <Input
                      label="Tax %"
                      type="number"
                      step="0.1"
                      {...register(`items.${index}.taxPercent`, { valueAsNumber: true })}
                    />
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => remove(index)}
                        className="mt-6"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Totals</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span className="font-medium">€{totals.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Tax:</span>
            <span className="font-medium">€{totals.tax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold">
            <span>Total:</span>
            <span>€{totals.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-4">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {isSubmitting ? 'Saving...' : 'Save'}
        </Button>
        {onSend && (
          <Button
            type="button"
            variant="outline"
            onClick={handleSubmit(handleSend)}
            disabled={isSubmitting}
            className="flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            {isSubmitting ? 'Sending...' : 'Send'}
          </Button>
        )}
      </div>
    </form>
  );
}
```

#### 3.3 Estado Global con Zustand
```typescript
// packages/ui/stores/quoteStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { Quote, CreateQuoteInput } from '@presup/types';
import { quoteApi } from '../services/quoteApi';

interface QuoteStore {
  // State
  quotes: Quote[];
  currentQuote: Quote | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  fetchQuotes: () => Promise<void>;
  fetchQuote: (id: string) => Promise<void>;
  createQuote: (data: CreateQuoteInput) => Promise<void>;
  updateQuote: (id: string, data: Partial<CreateQuoteInput>) => Promise<void>;
  deleteQuote: (id: string) => Promise<void>;
  setCurrentQuote: (quote: Quote | null) => void;
  clearError: () => void;
}

export const useQuoteStore = create<QuoteStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      quotes: [],
      currentQuote: null,
      loading: false,
      error: null,

      // Actions
      fetchQuotes: async () => {
        set({ loading: true, error: null });
        try {
          const quotes = await quoteApi.getAll();
          set({ quotes, loading: false });
        } catch (error) {
          set({ error: error.message, loading: false });
        }
      },

      fetchQuote: async (id: string) => {
        set({ loading: true, error: null });
        try {
          const quote = await quoteApi.getById(id);
          set({ currentQuote: quote, loading: false });
        } catch (error) {
          set({ error: error.message, loading: false });
        }
      },

      createQuote: async (data: CreateQuoteInput) => {
        set({ loading: true, error: null });
        try {
          const newQuote = await quoteApi.create(data);
          set(state => ({
            quotes: [newQuote, ...state.quotes],
            loading: false
          }));
        } catch (error) {
          set({ error: error.message, loading: false });
        }
      },

      updateQuote: async (id: string, data: Partial<CreateQuoteInput>) => {
        set({ loading: true, error: null });
        try {
          const updatedQuote = await quoteApi.update(id, data);
          set(state => ({
            quotes: state.quotes.map(q => q.id === id ? updatedQuote : q),
            currentQuote: state.currentQuote?.id === id ? updatedQuote : state.currentQuote,
            loading: false
          }));
        } catch (error) {
          set({ error: error.message, loading: false });
        }
      },

      deleteQuote: async (id: string) => {
        set({ loading: true, error: null });
        try {
          await quoteApi.delete(id);
          set(state => ({
            quotes: state.quotes.filter(q => q.id !== id),
            currentQuote: state.currentQuote?.id === id ? null : state.currentQuote,
            loading: false
          }));
        } catch (error) {
          set({ error: error.message, loading: false });
        }
      },

      setCurrentQuote: (quote) => set({ currentQuote: quote }),
      clearError: () => set({ error: null })
    }),
    {
      name: 'quote-store'
    }
  )
);
```

---

### Fase 4: Advanced Features

#### 4.1 Real-time con Socket.io
```typescript
// apps/api/src/services/socketService.ts
import { Server } from 'socket.io';
import { verifyToken } from '../utils/auth';

export class SocketService {
  private io: Server;

  constructor(server: any) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL,
        credentials: true
      }
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        const user = await verifyToken(token);
        socket.data.user = user;
        next();
      } catch (error) {
        next(new Error('Authentication error'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      const userId = socket.data.user.id;
      
      // Join user's personal room
      socket.join(`user:${userId}`);

      // Handle quote updates
      socket.on('quote:subscribe', (quoteId: string) => {
        socket.join(`quote:${quoteId}`);
      });

      socket.on('quote:unsubscribe', (quoteId: string) => {
        socket.leave(`quote:${quoteId}`);
      });

      socket.on('disconnect', () => {
        console.log(`User ${userId} disconnected`);
      });
    });
  }

  // Broadcast events
  broadcastQuoteUpdate(quoteId: string, data: any) {
    this.io.to(`quote:${quoteId}`).emit('quote:updated', data);
  }

  broadcastToUser(userId: string, event: string, data: any) {
    this.io.to(`user:${userId}`).emit(event, data);
  }
}
```

#### 4.2 PDF Generation Moderna
```typescript
// packages/utils/pdfGenerator.ts
import puppeteer from 'puppeteer';
import { Quote } from '@presup/types';
import { formatCurrency, formatDate } from './formatters';

export class PDFGenerator {
  static async generateQuotePDF(quote: Quote): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Generate HTML
    const html = this.generateQuoteHTML(quote);
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // Generate PDF
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm'
      }
    });
    
    await browser.close();
    return pdf;
  }

  private static generateQuoteHTML(quote: Quote): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Quote ${quote.id}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .client-info { margin-bottom: 30px; }
          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .items-table th, .items-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          .items-table th { background-color: #f5f5f5; }
          .totals { text-align: right; margin-bottom: 30px; }
          .signature { margin-top: 50px; border-top: 1px solid #ddd; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Quote</h1>
          <p>#${quote.id}</p>
          <p>${formatDate(quote.date)}</p>
        </div>
        
        <div class="client-info">
          <h3>Client Information</h3>
          <p><strong>${quote.clientName}</strong></p>
          ${quote.clientAddress ? `<p>${quote.clientAddress}</p>` : ''}
          ${quote.clientEmail ? `<p>${quote.clientEmail}</p>` : ''}
          ${quote.clientPhone ? `<p>${quote.clientPhone}</p>` : ''}
        </div>
        
        <table class="items-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Quantity</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${quote.items.map(item => `
              <tr>
                <td>${item.description}</td>
                <td>${item.quantity}</td>
                <td>${formatCurrency(item.price)}</td>
                <td>${formatCurrency(Number(item.quantity) * item.price)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="totals">
          <p><strong>Subtotal:</strong> ${formatCurrency(quote.subtotal)}</p>
          <p><strong>Tax:</strong> ${formatCurrency(quote.taxAmount)}</p>
          <p><strong>Total:</strong> ${formatCurrency(quote.totalAmount)}</p>
        </div>
        
        ${quote.notes ? `
          <div class="notes">
            <h3>Notes</h3>
            <p>${quote.notes}</p>
          </div>
        ` : ''}
        
        <div class="signature">
          <p>Signature: _____________________</p>
          <p>Date: _____________________</p>
        </div>
      </body>
      </html>
    `;
  }
}
```

---

### Fase 5: Deploy Moderno

#### 5.1 Docker Compose
```yaml
# docker-compose.yml
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
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=your-jwt-secret
    depends_on:
      - db
      - redis

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
```

#### 5.2 GitHub Actions CI/CD
```yaml
# .github/workflows/deploy.yml
name: Deploy Presup Next

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: presup_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linting
        run: npm run lint
      
      - name: Run type checking
        run: npm run type-check
      
      - name: Run unit tests
        run: npm run test:unit
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/presup_test
      
      - name: Run E2E tests
        run: npm run test:e2e

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy to Railway
        uses: railway-app/railway-action@v1
        with:
          api-token: ${{ secrets.RAILWAY_TOKEN }}
          service: presup-api
      
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: apps/web
```

---

## 📊 Comparación Final

| Característica | PHP Actual | Node.js + TS |
|---------------|------------|---------------|
| **Development Speed** | 🐢 | 🚀🚀🚀 |
| **Type Safety** | ❌ | ✅✅✅ |
| **Performance** | 🐢 | 🚀🚀 |
| **Ecosystem** | 📦 | 📦📦📦 |
| **Testing** | 🐢 | 🚀🚀 |
| **Deploy** | ✅ | 🚀🚀 |
| **Mobile** | ❌ | ✅ |
| **Real-time** | 🐢 | 🚀🚀 |
| **Future-proof** | 🐢 | 🚀🚀🚀 |

---

## 🎯 Conclusión

Esta migración transformará completamente el proyecto:

✅ **Productividad 10x** - Desarrollo rápido con tipado seguro  
✅ **Calidad superior** - Testing automático y errores reducidos  
✅ **Escalabilidad infinita** - Arquitectura moderna y cloud-ready  
✅ **Experiencia superior** - Real-time, PWA, mobile-first  
✅ **Mantenimiento simplificado** - Código auto-documentado  

**Inversión:** 3-4 meses  
**Retorno:** 10+ años de ventaja competitiva  

¿Listo para comenzar la migración? 🚀

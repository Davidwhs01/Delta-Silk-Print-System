import { users, clients, invoices, type User, type InsertUser, type Client, type InsertClient, type Invoice, type InsertInvoice, type InvoiceWithClient, type ClientWithInvoices } from "@shared/schema";
import { eq, desc, asc, sql, and, or, gte, lte, like } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db } from "./config/supabase";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // Auth
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Clients
  getClients(): Promise<Client[]>;
  getClient(id: number): Promise<Client | undefined>;
  getClientWithInvoices(id: number): Promise<ClientWithInvoices | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: number, client: Partial<InsertClient>): Promise<Client | undefined>;
  deleteClient(id: number): Promise<boolean>;
  
  // Invoices
  getInvoices(): Promise<InvoiceWithClient[]>;
  getInvoice(id: number): Promise<InvoiceWithClient | undefined>;
  getInvoicesByClient(clientId: number): Promise<Invoice[]>;
  getInvoicesByStatus(status: string): Promise<InvoiceWithClient[]>;
  getOverdueInvoices(): Promise<InvoiceWithClient[]>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: number, invoice: Partial<InsertInvoice>): Promise<Invoice | undefined>;
  deleteInvoice(id: number): Promise<boolean>;
  

  
  // Analytics
  getDashboardStats(monthFilter?: string, yearFilter?: number): Promise<{
    totalRevenue: number;
    totalInvoices: number;
    totalClients: number;
    overdueAmount: number;
    monthlyRevenue: { month: string; revenue: number; }[];
    statusDistribution: { status: string; count: number; }[];
  }>;
  
  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;
  
  constructor() {
    this.sessionStore = new PostgresSessionStore({
      conString: DATABASE_URL,
      createTableIfMissing: true,
    });
  }
  
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result[0];
  }
  
  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }
  
  async getClients(): Promise<Client[]> {
    return await db.select().from(clients).orderBy(asc(clients.name));
  }
  
  async getClient(id: number): Promise<Client | undefined> {
    const result = await db.select().from(clients).where(eq(clients.id, id));
    return result[0];
  }
  
  async getClientWithInvoices(id: number): Promise<ClientWithInvoices | undefined> {
    const client = await this.getClient(id);
    if (!client) return undefined;
    
    const clientInvoices = await db.select().from(invoices).where(eq(invoices.clientId, id));
    
    return {
      ...client,
      invoices: clientInvoices
    };
  }
  
  async createClient(client: InsertClient): Promise<Client> {
    const result = await db.insert(clients).values(client).returning();
    return result[0];
  }
  
  async updateClient(id: number, client: Partial<InsertClient>): Promise<Client | undefined> {
    const result = await db.update(clients).set(client).where(eq(clients.id, id)).returning();
    return result[0];
  }
  
  async deleteClient(id: number): Promise<boolean> {
    const result = await db.delete(clients).where(eq(clients.id, id)).returning();
    return result.length > 0;
  }
  
  async getInvoices(): Promise<InvoiceWithClient[]> {
    const result = await db.select().from(invoices).leftJoin(clients, eq(invoices.clientId, clients.id)).orderBy(desc(invoices.issueDate));
    
    return result.map(row => ({
      id: row.invoices.id,
      number: row.invoices.number,
      clientId: row.invoices.clientId,
      amount: row.invoices.amount,
      balanceDue: row.invoices.balanceDue,
      issueDate: row.invoices.issueDate,
      status: row.invoices.status,
      items: row.invoices.items,
      notes: row.invoices.notes,
      client: row.clients
    }));
  }
  
  async getInvoice(id: number): Promise<InvoiceWithClient | undefined> {
    const result = await db.select().from(invoices).leftJoin(clients, eq(invoices.clientId, clients.id)).where(eq(invoices.id, id));
    
    if (!result[0]) return undefined;
    
    return {
      id: result[0].invoices.id,
      number: result[0].invoices.number,
      clientId: result[0].invoices.clientId,
      amount: result[0].invoices.amount,
      balanceDue: result[0].invoices.balanceDue,
      issueDate: result[0].invoices.issueDate,
      status: result[0].invoices.status,
      items: result[0].invoices.items,
      notes: result[0].invoices.notes,
      client: result[0].clients
    };
  }
  
  async getInvoicesByClient(clientId: number): Promise<Invoice[]> {
    return await db.select().from(invoices).where(eq(invoices.clientId, clientId)).orderBy(desc(invoices.issueDate));
  }
  
  async getInvoicesByStatus(status: string): Promise<InvoiceWithClient[]> {
    const result = await db.select().from(invoices).leftJoin(clients, eq(invoices.clientId, clients.id)).where(eq(invoices.status, status));
    
    return result.map(row => ({
      id: row.invoices.id,
      number: row.invoices.number,
      clientId: row.invoices.clientId,
      amount: row.invoices.amount,
      balanceDue: row.invoices.balanceDue,
      issueDate: row.invoices.issueDate,
      status: row.invoices.status,
      items: row.invoices.items,
      notes: row.invoices.notes,
      client: row.clients
    }));
  }
  
  async getOverdueInvoices(): Promise<InvoiceWithClient[]> {
    const result = await db.select().from(invoices).leftJoin(clients, eq(invoices.clientId, clients.id)).where(eq(invoices.status, 'pending'));
    
    return result.map(row => ({
      id: row.invoices.id,
      number: row.invoices.number,
      clientId: row.invoices.clientId,
      amount: row.invoices.amount,
      balanceDue: row.invoices.balanceDue,
      issueDate: row.invoices.issueDate,
      status: row.invoices.status,
      items: row.invoices.items,
      notes: row.invoices.notes,
      client: row.clients
    }));
  }
  
  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const result = await db.insert(invoices).values(invoice).returning();
    return result[0];
  }
  
  async updateInvoice(id: number, invoice: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    const result = await db.update(invoices).set(invoice).where(eq(invoices.id, id)).returning();
    return result[0];
  }
  
  async deleteInvoice(id: number): Promise<boolean> {
    const result = await db.delete(invoices).where(eq(invoices.id, id)).returning();
    return result.length > 0;
  }
  

  
  async getDashboardStats(monthFilter?: string, yearFilter?: number) {
    try {
      console.log('Starting getDashboardStats with filters:', { monthFilter, yearFilter });
      
      // Buscar todas as invoices primeiro
      const allInvoices = await db.select().from(invoices);
      const allClients = await db.select().from(clients);
      
      console.log('Found invoices:', allInvoices.length);
      console.log('Found clients:', allClients.length);
      
      // Aplicar filtros se fornecidos
      let filteredInvoices = allInvoices;
      
      if (monthFilter && monthFilter !== "all" && yearFilter) {
        filteredInvoices = allInvoices.filter(inv => {
          if (!inv.issueDate) return false;
          
          const invoiceDate = new Date(inv.issueDate);
          const invoiceYear = invoiceDate.getFullYear();
          const invoiceMonth = invoiceDate.getMonth() + 1;
          
          return invoiceYear === yearFilter && invoiceMonth === parseInt(monthFilter);
        });
      } else if (yearFilter) {
        filteredInvoices = allInvoices.filter(inv => {
          if (!inv.issueDate) return false;
          
          const invoiceDate = new Date(inv.issueDate);
          const invoiceYear = invoiceDate.getFullYear();
          
          return invoiceYear === yearFilter;
        });
      }
      
      console.log('Filtered invoices:', filteredInvoices.length);
      
      // Calcular totais baseados nas notas filtradas
      const totalRevenue = filteredInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount.toString()), 0);
      
      // Calcular valor recebido (amount - balance_due)
      const paidAmount = filteredInvoices.reduce((sum, inv) => {
        const balanceDue = parseFloat(inv.balanceDue?.toString() || '0');
        const paidValue = parseFloat(inv.amount.toString()) - balanceDue;
        return sum + Math.max(0, paidValue); // Garantir que não seja negativo
      }, 0);
      
      // Calcular valor a receber (balance_due)
      const pendingAmount = filteredInvoices.reduce((sum, inv) => {
        return sum + parseFloat(inv.balanceDue?.toString() || '0');
      }, 0);
      
      // Status distribution das notas filtradas
      const statusCount: Record<string, number> = {};
      filteredInvoices.forEach(inv => {
        statusCount[inv.status] = (statusCount[inv.status] || 0) + 1;
      });
      
      // Monthly revenue dos últimos 6 meses de 2025
      const monthlyRevenue: Record<string, number> = {};
      const last6Months = ['02/2025', '03/2025', '04/2025', '05/2025', '06/2025', '07/2025'];
      
      last6Months.forEach(monthYear => {
        const monthInvoices = allInvoices.filter(inv => 
          inv.issueDate && inv.issueDate.includes(monthYear)
        );
        monthlyRevenue[monthYear] = monthInvoices.reduce((sum, inv) => 
          sum + parseFloat(inv.amount.toString()), 0
        );
      });
      
      // Buscar clientes únicos nas notas filtradas
      const uniqueClientIds = new Set(filteredInvoices.map(inv => inv.clientId));
      const filteredClientsCount = uniqueClientIds.size;
      
      // Calcular porcentagem até metas
      const goal1 = 23000; // Meta 1: 23K
      const goal2 = 30000; // Meta 2: 30K
      const goalProgress1 = Math.min(100, Math.round((totalRevenue / goal1) * 100));
      const goalProgress2 = Math.min(100, Math.round((totalRevenue / goal2) * 100));
      
      const result = {
        totalRevenue,
        totalInvoices: filteredInvoices.length,
        totalClients: filteredClientsCount,
        paidAmount,
        pendingAmount,
        overdueAmount: pendingAmount, // Manter compatibilidade
        goalProgress1,
        goalProgress2,
        monthlyRevenue: Object.entries(monthlyRevenue)
          .filter(([_, revenue]) => revenue > 0)
          .map(([month, revenue]) => ({
            month,
            revenue
          })),
        statusDistribution: Object.entries(statusCount).map(([status, count]) => ({
          status,
          count
        }))
      };
      
      console.log('Final dashboard stats result:', {
        ...result,
        calculationBreakdown: {
          totalRevenue: `R$ ${totalRevenue.toFixed(2)}`,
          paidAmount: `R$ ${paidAmount.toFixed(2)}`,
          pendingAmount: `R$ ${pendingAmount.toFixed(2)}`,
          filteredInvoicesCount: filteredInvoices.length
        }
      });
      return result;
    } catch (error) {
      console.error('Error in getDashboardStats:', error);
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();

import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { insertClientSchema, insertInvoiceSchema } from "@shared/schema";
import { analyzeInvoicePDF } from "./services/gemini";
import { generatePixCode, generatePixQRCode } from "./services/pix";
import multer from "multer";
import path from "path";

const upload = multer({ dest: 'uploads/' });

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);
  
  // Health check endpoint for deployment monitoring
  app.get("/api/health", (req, res) => {
    res.status(200).json({ 
      status: "healthy", 
      timestamp: new Date().toISOString(),
      uptime: process.uptime() 
    });
  });
  
  // Client routes
  app.get("/api/clients", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const clients = await storage.getClients();
      res.json(clients);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });
  
  app.get("/api/clients/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const client = await storage.getClientWithInvoices(parseInt(req.params.id));
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      res.json(client);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch client" });
    }
  });
  
  app.post("/api/clients", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const validatedData = insertClientSchema.parse(req.body);
      const client = await storage.createClient(validatedData);
      res.status(201).json(client);
    } catch (error) {
      res.status(400).json({ message: "Invalid client data" });
    }
  });
  
  app.put("/api/clients/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const validatedData = insertClientSchema.partial().parse(req.body);
      const client = await storage.updateClient(parseInt(req.params.id), validatedData);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      res.json(client);
    } catch (error) {
      res.status(400).json({ message: "Invalid client data" });
    }
  });
  
  app.delete("/api/clients/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const success = await storage.deleteClient(parseInt(req.params.id));
      if (!success) {
        return res.status(404).json({ message: "Client not found" });
      }
      res.sendStatus(204);
    } catch (error) {
      res.status(500).json({ message: "Failed to delete client" });
    }
  });
  
  // Invoice routes
  app.get("/api/invoices", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { status, clientId } = req.query;
      let invoices;
      
      if (status) {
        invoices = await storage.getInvoicesByStatus(status as string);
      } else if (clientId) {
        invoices = await storage.getInvoicesByClient(parseInt(clientId as string));
      } else {
        invoices = await storage.getInvoices();
      }
      

      
      res.json(invoices);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });
  
  app.get("/api/invoices/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const invoice = await storage.getInvoice(parseInt(req.params.id));
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      res.json(invoice);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invoice" });
    }
  });
  
  app.post("/api/invoices", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const validatedData = insertInvoiceSchema.parse(req.body);
      const invoice = await storage.createInvoice(validatedData);
      res.status(201).json(invoice);
    } catch (error) {
      console.error("Invoice creation error:", error);
      res.status(400).json({ message: "Invalid invoice data" });
    }
  });
  
  app.put("/api/invoices/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const validatedData = insertInvoiceSchema.partial().parse(req.body);
      const invoice = await storage.updateInvoice(parseInt(req.params.id), validatedData);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      res.json(invoice);
    } catch (error) {
      console.error("Invoice update error:", error);
      res.status(400).json({ message: "Invalid invoice data" });
    }
  });
  
  app.delete("/api/invoices/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const success = await storage.deleteInvoice(parseInt(req.params.id));
      if (!success) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      res.sendStatus(204);
    } catch (error) {
      res.status(500).json({ message: "Failed to delete invoice" });
    }
  });
  
  // PDF Processing route
  app.post("/api/invoices/import-pdf", upload.single('pdf'), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    if (!req.file) {
      return res.status(400).json({ message: "No PDF file uploaded" });
    }
    
    try {
      const extractedData = await analyzeInvoicePDF(req.file.path);
      
      res.json({
        extractedData,
        fileName: req.file.originalname
      });
    } catch (error) {
      console.error("PDF processing error:", error);
      res.status(500).json({ message: "Failed to process PDF" });
    }
  });
  

  
  // PIX routes
  app.post("/api/pix/qrcode", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { amount, description } = req.body;
      
      if (!amount) {
        return res.status(400).json({ message: "Amount is required" });
      }
      
      const pixCode = generatePixCode(amount, description || '');
      const qrCode = await generatePixQRCode(pixCode);
      
      res.json({ qrCode, pixCode });
    } catch (error) {
      console.error("PIX QR Code generation error:", error);
      res.status(500).json({ message: "Failed to generate PIX QR code" });
    }
  });

  // Analytics routes
  app.get("/api/analytics/dashboard", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const monthFilter = req.query.month as string;
      const yearFilter = req.query.year ? parseInt(req.query.year as string) : undefined;
      
      const stats = await storage.getDashboardStats(monthFilter, yearFilter);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });
  
  app.get("/api/analytics/overdue", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const overdueInvoices = await storage.getOverdueInvoices();

      res.json(overdueInvoices);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch overdue invoices" });
    }
  });
  

  
  const httpServer = createServer(app);
  return httpServer;
}

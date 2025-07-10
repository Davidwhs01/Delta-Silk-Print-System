import * as fs from "fs";
import { GoogleGenAI } from "@google/genai";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface ExtractedInvoiceData {
  clientName: string;
  amount: number;
  description: string;
  issueDate: string;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
}

export async function analyzeInvoicePDF(pdfPath: string): Promise<ExtractedInvoiceData> {
  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            clientName: { type: "string" },
            amount: { type: "number" },
            description: { type: "string" },
            issueDate: { type: "string" },
            dueDate: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  quantity: { type: "number" },
                  unitPrice: { type: "number" },
                  total: { type: "number" }
                },
                required: ["description", "quantity", "unitPrice", "total"]
              }
            }
          },
          required: ["clientName", "amount", "description", "issueDate", "items"]
        }
      }
    });
    
    const prompt = `
Analise este PDF de nota fiscal/invoice e extraia as seguintes informações:

1. Nome do cliente
2. Valor total da nota
3. Descrição dos serviços/produtos
4. Data de emissão
5. Data de vencimento
6. Lista de itens com descrição, quantidade, preço unitário e total

Retorne os dados em formato JSON estruturado. Para datas, use formato ISO (YYYY-MM-DD).
Para valores monetários, use números decimais sem símbolos de moeda.

Se alguma informação não estiver disponível, use valores padrão apropriados:
- clientName: "Cliente não identificado"
- amount: 0
- description: "Serviços diversos"
- issueDate: data atual

- items: array vazio se não houver itens específicos
`;

    const result = await model.generateContent([
      {
        inlineData: {
          data: pdfBytes.toString("base64"),
          mimeType: "application/pdf"
        }
      },
      prompt
    ]);
    
    const response = await result.response;
    const text = response.text();
    
    if (!text) {
      throw new Error("Empty response from Gemini");
    }
    
    const extractedData: ExtractedInvoiceData = JSON.parse(text);
    
    // Validate and clean data
    if (!extractedData.clientName) {
      extractedData.clientName = "Cliente não identificado";
    }
    
    if (!extractedData.amount || extractedData.amount <= 0) {
      extractedData.amount = 0;
    }
    
    if (!extractedData.description) {
      extractedData.description = "Serviços diversos";
    }
    
    if (!extractedData.issueDate) {
      extractedData.issueDate = new Date().toISOString().split('T')[0];
    }
    
    if (!extractedData.dueDate) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);
      extractedData.dueDate = dueDate.toISOString().split('T')[0];
    }
    
    if (!extractedData.items) {
      extractedData.items = [];
    }
    
    return extractedData;
  } catch (error) {
    console.error("Error analyzing PDF:", error);
    throw new Error(`Failed to analyze PDF: ${error}`);
  }
}

export async function generateInvoiceDescription(items: any[]): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    
    const prompt = `
Com base nos seguintes itens de uma nota fiscal, gere uma descrição concisa e profissional:

Itens:
${items.map(item => `- ${item.description} (Qtd: ${item.quantity}, Preço: R$ ${item.unitPrice})`).join('\n')}

Gere uma descrição em português que resuma os serviços/produtos de forma profissional, adequada para uma nota fiscal.
Máximo 200 caracteres.
`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const description = response.text();
    
    return description.trim();
  } catch (error) {
    console.error("Error generating description:", error);
    return "Serviços diversos";
  }
}

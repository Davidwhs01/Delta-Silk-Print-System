import QRCode from "qrcode";
import { randomBytes } from "crypto";

// PIX EMV standard implementation
export function generatePixCode(amount: string | number, description: string): string {
  const amountStr = typeof amount === 'string' ? amount : amount.toString();
  const pixKey = process.env.PIX_KEY || "contato@deltasilkprint.com.br";
  const merchantName = "DELTA SILK PRINT";
  const merchantCity = "SAO PAULO";
  const txId = randomBytes(16).toString('hex').substring(0, 25);
  
  // PIX EMV payload
  const payload = [
    "00", "02", "01", "12", // Payload format indicator
    "26", String(pixKey.length + 19).padStart(2, '0'), // Merchant account information
    "0014", "br.gov.bcb.pix", // GUI
    "01", String(pixKey.length).padStart(2, '0'), pixKey, // PIX key
    "52", "0000", // Merchant category code
    "53", "986", // Transaction currency (BRL)
    "54", String(amountStr.length).padStart(2, '0'), amountStr, // Transaction amount
    "58", "02", "BR", // Country code
    "59", String(merchantName.length).padStart(2, '0'), merchantName, // Merchant name
    "60", String(merchantCity.length).padStart(2, '0'), merchantCity, // Merchant city
    "62", String(txId.length + 4).padStart(2, '0'), "05", String(txId.length).padStart(2, '0'), txId, // Additional data
    "63", "04" // CRC placeholder
  ].join("");
  
  // Calculate CRC16
  const crc = calculateCRC16(payload);
  const finalPayload = payload + crc.toString(16).toUpperCase().padStart(4, '0');
  
  return finalPayload;
}

// Cache para QR codes
const qrCodeCache = new Map<string, string>();

export async function generatePixQRCode(pixCode: string): Promise<string> {
  try {
    // Verificar cache primeiro
    if (qrCodeCache.has(pixCode)) {
      return qrCodeCache.get(pixCode)!;
    }
    
    const qrCodeDataURL = await QRCode.toDataURL(pixCode, {
      type: 'image/png',
      quality: 0.9,
      margin: 1,
      width: 256,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    // Salvar no cache (máximo 100 itens)
    if (qrCodeCache.size >= 100) {
      const firstKey = qrCodeCache.keys().next().value;
      qrCodeCache.delete(firstKey);
    }
    qrCodeCache.set(pixCode, qrCodeDataURL);
    
    return qrCodeDataURL;
  } catch (error) {
    console.error("Error generating QR code:", error);
    throw new Error("Failed to generate QR code");
  }
}

function calculateCRC16(data: string): number {
  let crc = 0xFFFF;
  const polynomial = 0x1021;
  
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ polynomial;
      } else {
        crc = crc << 1;
      }
    }
  }
  
  return crc & 0xFFFF;
}

export function validatePixCode(pixCode: string): boolean {
  try {
    if (pixCode.length < 10) return false;
    
    const payload = pixCode.substring(0, pixCode.length - 4);
    const providedCrc = pixCode.substring(pixCode.length - 4);
    
    const calculatedCrc = calculateCRC16(payload);
    const calculatedCrcHex = calculatedCrc.toString(16).toUpperCase().padStart(4, '0');
    
    return providedCrc === calculatedCrcHex;
  } catch (error) {
    return false;
  }
}

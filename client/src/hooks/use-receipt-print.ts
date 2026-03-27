import { apiRequest } from "@/lib/queryClient";
import { printReceipt, type ReceiptData, type ReceiptSettings } from "@/utils/receipt-printer";

async function fetchReceiptSettings(): Promise<ReceiptSettings> {
  const res = await apiRequest("GET", "/api/receipt-settings");
  return res.json();
}

async function fetchReceiptData(invoiceId: string): Promise<ReceiptData> {
  const res = await apiRequest("GET", `/api/cashier/receipt-data/${invoiceId}`);
  if (!res.ok) throw new Error("Failed to load receipt data");
  return res.json();
}

export function useReceiptPrint() {
  const printInvoiceReceipts = async (invoiceIds: string[]) => {
    if (!invoiceIds.length) return;

    let settings: ReceiptSettings;
    try {
      settings = await fetchReceiptSettings();
    } catch {
      settings = {
        header: "الصيدلية",
        footer: "شكرًا لزيارتكم",
        logoText: "",
        autoPrint: true,
        showPreview: false,
      };
    }

    if (!settings.autoPrint) return;

    for (let i = 0; i < invoiceIds.length; i++) {
      try {
        const data = await fetchReceiptData(invoiceIds[i]);
        printReceipt(data, settings);
        if (i < invoiceIds.length - 1) {
          await new Promise((r) => setTimeout(r, 900));
        }
      } catch (err) {
        console.error("Receipt print failed for", invoiceIds[i], err);
      }
    }
  };

  const reprintInvoice = async (invoiceId: string) => {
    let settings: ReceiptSettings;
    try {
      settings = await fetchReceiptSettings();
    } catch {
      settings = {
        header: "الصيدلية",
        footer: "شكرًا لزيارتكم",
        logoText: "",
        autoPrint: true,
        showPreview: true,
      };
    }
    settings = { ...settings, showPreview: true };
    const data = await fetchReceiptData(invoiceId);
    printReceipt(data, settings);
  };

  return { printInvoiceReceipts, reprintInvoice };
}

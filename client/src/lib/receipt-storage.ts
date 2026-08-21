/**
 * فلسفة الملف: «دفتر الحساب الهادئ» يعتمد على بيانات محلية منظمة؛ لا اتصال ولا خادم.
 * IndexedDB يحفظ السجلات كاملة ويضمن أن كل دفعة تظل مرتبطة بوصلها.
 */
export type CurrencyCode = "IQD" | "SAR" | "USD" | "KWD";

export type Payment = {
  id: string;
  amount: number;
  paidAt: string;
  method: string;
  note?: string;
};

export type Receipt = {
  id: string;
  title: string;
  merchant: string;
  total: number;
  currency: CurrencyCode;
  issuedAt: string;
  dueDate?: string;
  note?: string;
  /** صورة مضغوطة بصيغة data URL، محفوظة داخل IndexedDB على نفس الجهاز فقط. */
  photoData?: string;
  payments: Payment[];
  createdAt: string;
  updatedAt: string;
};

export type ReceiptBackup = {
  app: "waslati-offline";
  version: 1;
  exportedAt: string;
  receipts: Receipt[];
};

const DB_NAME = "waslati-ledger";
const DB_VERSION = 1;
const STORE_NAME = "receipts";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("merchant", "merchant");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("تعذر فتح التخزين المحلي."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("تعذر حفظ التغييرات محلياً."));
    transaction.onabort = () => reject(transaction.error ?? new Error("أُلغي حفظ التغييرات."));
  });
}

export async function listReceipts(): Promise<Receipt[]> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readonly");
  const request = transaction.objectStore(STORE_NAME).getAll();
  const records = await new Promise<Receipt[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as Receipt[]);
    request.onerror = () => reject(request.error ?? new Error("تعذر قراءة الوصولات."));
  });
  database.close();
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveReceipt(receipt: Receipt): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put(receipt);
  await transactionDone(transaction);
  database.close();
}

export async function removeReceipt(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).delete(id);
  await transactionDone(transaction);
  database.close();
}

export async function createBackup(): Promise<ReceiptBackup> {
  return {
    app: "waslati-offline",
    version: 1,
    exportedAt: new Date().toISOString(),
    receipts: await listReceipts(),
  };
}

export function isValidBackup(value: unknown): value is ReceiptBackup {
  if (!value || typeof value !== "object") return false;
  const backup = value as Partial<ReceiptBackup>;
  return backup.app === "waslati-offline" && backup.version === 1 && Array.isArray(backup.receipts);
}

export async function replaceReceipts(receipts: Receipt[]): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  store.clear();
  receipts.forEach((receipt) => store.put(receipt));
  await transactionDone(transaction);
  database.close();
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!("storage" in navigator) || !navigator.storage.persist) return null;
  try {
    const alreadyPersistent = await navigator.storage.persisted();
    return alreadyPersistent || (await navigator.storage.persist());
  } catch {
    return null;
  }
}

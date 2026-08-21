/**
 * «دفتر الحساب الهادئ»: واجهة هاتفية عربية تُبرز الفرق المالي وتُخفي التعقيد خلف تفاصيل الوصل.
 * كل البيانات هنا تمر عبر IndexedDB في جهاز المستخدم؛ لا توجد شبكة أو بيانات تجريبية.
 */
import {
  ArchiveRestore,
  CalendarDays,
  Check,
  ChevronLeft,
  CircleAlert,
  CircleCheck,
  CloudOff,
  Download,
  FilePlus2,
  FileText,
  Home as HomeIcon,
  Info,
  ListFilter,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  WalletCards,
  WifiOff,
  X,
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  createBackup,
  CurrencyCode,
  isValidBackup,
  listReceipts,
  Payment,
  Receipt,
  removeReceipt,
  replaceReceipts,
  requestPersistentStorage,
  saveReceipt,
} from "@/lib/receipt-storage";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

type Filter = "all" | "open" | "paid" | "overpaid";
type Tab = "home" | "ledger" | "privacy";

const HERO_IMAGE = "/manus-storage/waslati-ledger-hero_86352e83.jpg";
const EMPTY_IMAGE = "/manus-storage/waslati-empty-state_39c54553.jpg";
const PRIVACY_IMAGE = "/manus-storage/waslati-privacy-local_4f30bc97.jpg";
const LOGO_IMAGE = "/manus-storage/waslati-logo_917cba04.png";
const TODAY = () => new Date().toISOString().slice(0, 10);

const CURRENCIES: { value: CurrencyCode; label: string }[] = [
  { value: "IQD", label: "دينار عراقي (د.ع)" },
  { value: "SAR", label: "ريال سعودي (ر.س)" },
  { value: "USD", label: "دولار أمريكي ($)" },
  { value: "KWD", label: "دينار كويتي (د.ك)" },
];

function formatMoney(value: number, currency: CurrencyCode) {
  return new Intl.NumberFormat("ar", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "IQD" ? 0 : 2,
  }).format(Math.abs(value));
}

function formatDate(value?: string) {
  if (!value) return "غير محدد";
  return new Intl.DateTimeFormat("ar", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function paidAmount(receipt: Receipt) {
  return receipt.payments.reduce((sum, payment) => sum + payment.amount, 0);
}

function balance(receipt: Receipt) {
  return receipt.total - paidAmount(receipt);
}

function receiptState(receipt: Receipt): Filter {
  const currentBalance = balance(receipt);
  if (currentBalance < -0.005) return "overpaid";
  if (Math.abs(currentBalance) <= 0.005) return "paid";
  return "open";
}

function statusCopy(state: Filter) {
  return state === "paid" ? "مُسوّى" : state === "overpaid" ? "مدفوع بزيادة" : "يتبقى دفع";
}

function groupedAmounts(receipts: Receipt[], selector: (receipt: Receipt) => number) {
  const values = new Map<CurrencyCode, number>();
  receipts.forEach((receipt) => {
    const amount = selector(receipt);
    if (amount <= 0.005) return;
    values.set(receipt.currency, (values.get(receipt.currency) ?? 0) + amount);
  });
  return Array.from(values.entries());
}

function compactGroups(groups: [CurrencyCode, number][]) {
  if (!groups.length) return "لا يوجد";
  return groups
    .slice(0, 2)
    .map(([currency, amount]) => formatMoney(amount, currency))
    .join(" · ");
}

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export default function Home() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [storagePersistent, setStoragePersistent] = useState<boolean | null>(null);
  const [receiptDrawerOpen, setReceiptDrawerOpen] = useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [paymentDrawerOpen, setPaymentDrawerOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [receiptForm, setReceiptForm] = useState({
    title: "",
    merchant: "",
    total: "",
    currency: "IQD" as CurrencyCode,
    issuedAt: TODAY(),
    dueDate: "",
    note: "",
  });
  const [paymentForm, setPaymentForm] = useState({ amount: "", paidAt: TODAY(), method: "نقداً", note: "" });
  const importInputRef = useRef<HTMLInputElement>(null);

  const reloadReceipts = async () => {
    try {
      setReceipts(await listReceipts());
    } catch {
      toast.error("تعذر فتح سجل الوصولات على هذا الجهاز.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reloadReceipts();
    void requestPersistentStorage().then(setStoragePersistent);
  }, []);

  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  const summary = useMemo(() => {
    const openReceipts = receipts.filter((receipt) => receiptState(receipt) === "open");
    const paidReceipts = receipts.filter((receipt) => receiptState(receipt) === "paid");
    const overpaidReceipts = receipts.filter((receipt) => receiptState(receipt) === "overpaid");
    return {
      openReceipts,
      paidReceipts,
      overpaidReceipts,
      outstanding: groupedAmounts(receipts, (receipt) => Math.max(balance(receipt), 0)),
      overpaid: groupedAmounts(receipts, (receipt) => Math.max(-balance(receipt), 0)),
    };
  }, [receipts]);

  const visibleReceipts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ar");
    return receipts.filter((receipt) => {
      const stateMatches = filter === "all" || receiptState(receipt) === filter;
      const textMatches = !normalizedQuery || `${receipt.title} ${receipt.merchant} ${receipt.note ?? ""}`.toLocaleLowerCase("ar").includes(normalizedQuery);
      return stateMatches && textMatches;
    });
  }, [filter, query, receipts]);

  const openReceiptDrawer = () => {
    setReceiptForm({ title: "", merchant: "", total: "", currency: "IQD", issuedAt: TODAY(), dueDate: "", note: "" });
    setReceiptDrawerOpen(true);
  };

  const handleCreateReceipt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const total = Number(receiptForm.total);
    if (!receiptForm.title.trim() || !receiptForm.merchant.trim() || !Number.isFinite(total) || total <= 0) {
      toast.error("أدخل اسم الوصل والجهة والمبلغ الصحيح.");
      return;
    }
    const now = new Date().toISOString();
    const receipt: Receipt = {
      id: makeId("receipt"),
      title: receiptForm.title.trim(),
      merchant: receiptForm.merchant.trim(),
      total,
      currency: receiptForm.currency,
      issuedAt: receiptForm.issuedAt,
      dueDate: receiptForm.dueDate || undefined,
      note: receiptForm.note.trim() || undefined,
      payments: [],
      createdAt: now,
      updatedAt: now,
    };
    try {
      await saveReceipt(receipt);
      await reloadReceipts();
      setReceiptDrawerOpen(false);
      toast.success("حُفظ الوصل محلياً على هذا الجهاز.");
    } catch {
      toast.error("لم يُحفظ الوصل. تحقق من مساحة الجهاز ثم حاول ثانية.");
    }
  };

  const openDetails = (receipt: Receipt) => {
    setSelectedReceipt(receipt);
    setDetailDrawerOpen(true);
  };

  const openPaymentDrawer = () => {
    if (!selectedReceipt) return;
    setPaymentForm({ amount: Math.max(balance(selectedReceipt), 0).toString(), paidAt: TODAY(), method: "نقداً", note: "" });
    setPaymentDrawerOpen(true);
  };

  const handleCreatePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedReceipt) return;
    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("أدخل مبلغ الدفعة الصحيح.");
      return;
    }
    const payment: Payment = {
      id: makeId("payment"),
      amount,
      paidAt: paymentForm.paidAt,
      method: paymentForm.method,
      note: paymentForm.note.trim() || undefined,
    };
    const updatedReceipt: Receipt = {
      ...selectedReceipt,
      payments: [...selectedReceipt.payments, payment],
      updatedAt: new Date().toISOString(),
    };
    try {
      await saveReceipt(updatedReceipt);
      setSelectedReceipt(updatedReceipt);
      await reloadReceipts();
      setPaymentDrawerOpen(false);
      toast.success(balance(updatedReceipt) < -0.005 ? "سُجلت الدفعة — يوجد مبلغ زائد ظاهر." : "سُجلت الدفعة وحُدّث الرصيد فوراً.");
    } catch {
      toast.error("تعذر حفظ الدفعة محلياً.");
    }
  };

  const handleDeleteReceipt = async () => {
    if (!selectedReceipt) return;
    if (!window.confirm(`سيُحذف «${selectedReceipt.title}» وكل دفعاته من هذا الجهاز. هل تريد المتابعة؟`)) return;
    try {
      await removeReceipt(selectedReceipt.id);
      await reloadReceipts();
      setDetailDrawerOpen(false);
      setSelectedReceipt(null);
      toast.success("حُذف الوصل من السجل المحلي.");
    } catch {
      toast.error("تعذر حذف الوصل.");
    }
  };

  const handleExport = async () => {
    try {
      const backup = await createBackup();
      const payload = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(payload);
      link.download = `waslati-backup-${TODAY()}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success("تم تنزيل نسخة احتياطية من بياناتك.");
    } catch {
      toast.error("تعذر إنشاء النسخة الاحتياطية.");
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const data: unknown = JSON.parse(await file.text());
      if (!isValidBackup(data)) throw new Error("ملف غير صالح");
      if (!window.confirm(`سيستبدل هذا الملف السجل المحلي الحالي بـ ${data.receipts.length} وصل. هل تريد المتابعة؟`)) return;
      await replaceReceipts(data.receipts);
      await reloadReceipts();
      toast.success("استُعيدت النسخة الاحتياطية محلياً.");
    } catch {
      toast.error("هذا ليس ملف نسخة وصلاتي صالحاً.");
    }
  };

  const currentBalance = selectedReceipt ? balance(selectedReceipt) : 0;
  const currentState = selectedReceipt ? receiptState(selectedReceipt) : "open";

  return (
    <div className="app-shell" dir="rtl">
      <header className="topbar">
        <div className="brand-lockup">
          <img className="brand-logo" src={LOGO_IMAGE} alt="علامة وصلاتي" />
          <div>
            <p className="eyebrow">دفتر وصولاتك الشخصي</p>
            <p className="brand-name">وصلاتي</p>
          </div>
        </div>
        <span className={`offline-chip ${isOnline ? "" : "is-offline"}`} title={isOnline ? "البيانات محفوظة على جهازك" : "أنت الآن دون اتصال"}>
          {isOnline ? <ShieldCheck size={15} /> : <WifiOff size={15} />}
          {isOnline ? "محلي وآمن" : "دون إنترنت"}
        </span>
      </header>

      {activeTab !== "privacy" && (
        <>
          <section className="hero-card" aria-label="ملخص المدفوعات">
            <div className="hero-content">
              <div>
                <p className="hero-kicker"><ReceiptText size={15} /> خلاصة دفتر اليوم</p>
                <p className="hero-copy">إجمالي ما يحتاج مراجعة أو دفعاً</p>
              </div>
              <div>
                <div className="hero-footer">
                  <span className="hero-total">{summary.outstanding.length ? compactGroups(summary.outstanding) : "لا يوجد متبقٍ"}</span>
                  <span className="hero-label">المتبقي للدفع</span>
                </div>
                <div className="hero-checkline"><span><CircleAlert size={13} /> {summary.openReceipts.length} بحاجة للدفع</span><span><CircleCheck size={13} /> {summary.paidReceipts.length} مُسوّى</span></div>
              </div>
            </div>
          </section>

          <div className="scroll-stat-row" aria-label="مؤشرات السجل">
            <article className="stat-card">
              <div className="stat-icon" style={{ background: "oklch(0.94 0.05 82)", color: "oklch(0.55 0.11 68)" }}><CircleAlert size={18} /></div>
              <span className="stat-label">بحاجة للدفع</span>
              <strong className="stat-value">{summary.outstanding.length ? compactGroups(summary.outstanding) : "—"}</strong>
              <span className="stat-subvalue">{summary.openReceipts.length} وصولات بحاجة للمراجعة</span>
            </article>
            <article className="stat-card">
              <div className="stat-icon" style={{ background: "oklch(0.92 0.05 157)", color: "oklch(0.38 0.09 159)" }}><CircleCheck size={18} /></div>
              <span className="stat-label">تمت تسويتها</span>
              <strong className="stat-value">{summary.paidReceipts.length}</strong>
              <span className="stat-subvalue">وصلات دون فرق في المبلغ</span>
            </article>
            <article className="stat-card">
              <div className="stat-icon" style={{ background: "oklch(0.95 0.035 28)", color: "oklch(0.54 0.16 27)" }}><Info size={18} /></div>
              <span className="stat-label">مدفوع بزيادة</span>
              <strong className="stat-value">{summary.overpaid.length ? compactGroups(summary.overpaid) : "—"}</strong>
              <span className="stat-subvalue">{summary.overpaidReceipts.length} وصولات بزيادة</span>
            </article>
          </div>
        </>
      )}

      <main className="main-content paper-rule">
        {activeTab === "privacy" ? (
          <section aria-labelledby="privacy-heading">
            <div className="section-head">
              <div>
                <h1 className="section-title" id="privacy-heading">بياناتك على جهازك</h1>
                <p className="section-caption">لا حساب، لا خادم، ولا مزامنة تلقائية.</p>
              </div>
            </div>
            <div className="privacy-panel">
              <div className="privacy-copy">
                <ShieldCheck size={24} />
                <h2>وصلاتك لا تغادر هذا الهاتف.</h2>
                <p>يحفظ التطبيق السجل والدفعات داخل مساحة المتصفح المحلية. تعمل إضافة الوصلات والبحث والحساب حتى دون شبكة.</p>
              </div>
              <div className="protect-list">
                <span className="protect-item"><Check size={15} /> محفوظ في قاعدة بيانات محلية</span>
                <span className="protect-item"><Check size={15} /> يعمل بعد التثبيت دون إنترنت</span>
              </div>
              <img src={PRIVACY_IMAGE} alt="دفتر وصولات محلي محفوظ بأمان" />
            </div>
            <span className="protect-status"><CloudOff size={14} /> {storagePersistent === true ? "طُلب تخزين دائم للبيانات" : "التخزين المحلي مفعّل"}</span>
            <div className="backup-actions">
              <button className="backup-button" type="button" onClick={() => void handleExport()}>
                <Download size={20} />
                <span>تنزيل نسخة احتياطية<small>ملف JSON تحتفظ به عندك أو ترسله لجهازك الجديد.</small></span>
              </button>
              <button className="backup-button" type="button" onClick={() => importInputRef.current?.click()}>
                <ArchiveRestore size={20} />
                <span>استعادة نسخة احتياطية<small>يستبدل السجل المحلي الحالي بعد تأكيدك.</small></span>
              </button>
              <input ref={importInputRef} onChange={handleImport} type="file" accept="application/json,.json" hidden />
            </div>
          </section>
        ) : (
          <section aria-labelledby="receipts-heading">
            <div className="section-head">
              <div>
                <h2 className="section-title" id="receipts-heading">{activeTab === "ledger" ? "سجل الوصولات" : "الوصولات الأخيرة"}</h2>
                <p className="section-caption">{loading ? "نفتح سجلك المحلي..." : `${receipts.length} وصل محفوظ على هذا الجهاز`}</p>
              </div>
              <button className="text-button" type="button" onClick={() => setActiveTab("ledger")}>عرض السجل <ChevronLeft size={14} className="inline" /></button>
            </div>
            <div className="search-field">
              <Search size={18} color="oklch(0.42 0.06 159)" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم الوصل أو الجهة..." aria-label="ابحث في الوصولات" />
              {query && <button type="button" className="text-button" onClick={() => setQuery("")} aria-label="مسح البحث"><X size={16} /></button>}
            </div>
            <div className="filter-row" aria-label="تصفية الوصولات">
              {([
                ["all", "الكل"],
                ["open", "المتبقي"],
                ["paid", "المسوّى"],
                ["overpaid", "الزيادة"],
              ] as [Filter, string][]).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setFilter(value)} className={`filter-pill filter-${value} ${filter === value ? "is-active" : ""}`}>
                  {value === "all" && <ListFilter size={13} className="inline ml-1" />} {label}
                </button>
              ))}
            </div>

            {visibleReceipts.length ? (
              <div className="receipt-list">
                {visibleReceipts.map((receipt) => {
                  const state = receiptState(receipt);
                  const current = balance(receipt);
                  return (
                    <button type="button" className="receipt-item" key={receipt.id} onClick={() => openDetails(receipt)}>
                      <span className={`receipt-stamp stamp-${state === "open" ? "open" : state === "paid" ? "paid" : "over"}`}>
                        {state === "paid" ? <Check size={17} /> : state === "overpaid" ? <Plus size={16} /> : <CalendarDays size={16} />}
                      </span>
                      <span>
                        <span className="receipt-title">{receipt.title}</span>
                        <span className="receipt-meta">{receipt.merchant} · {formatDate(receipt.issuedAt)}</span>
                      </span>
                      <span>
                        <span className="receipt-amount">{formatMoney(state === "overpaid" ? -current : state === "paid" ? receipt.total : current, receipt.currency)}</span>
                        <span className={`receipt-state state-${state === "open" ? "open" : state === "paid" ? "paid" : "over"}`}>{statusCopy(state)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <img src={EMPTY_IMAGE} alt="وصولات ورقية فارغة" />
                <h3 className="empty-title">{query || filter !== "all" ? "لا توجد نتائج بهذه التصفية" : "ابدأ بأول وصل"}</h3>
                <p className="empty-copy">{query || filter !== "all" ? "جرّب تغيير كلمات البحث أو أظهر كل حالات الوصولات." : "أدخل قيمة الوصل، ثم أضف كل دفعة لاحقاً. سنوضح لك المتبقي أو الزيادة تلقائياً."}</p>
                {!query && filter === "all" && <button type="button" className="primary-action" onClick={openReceiptDrawer}><FilePlus2 size={16} /> إضافة وصل</button>}
              </div>
            )}
          </section>
        )}
      </main>

      <nav className="bottom-nav" aria-label="التنقل الرئيسي">
        <button type="button" className={`nav-item ${activeTab === "home" ? "is-active" : ""}`} onClick={() => setActiveTab("home")}><HomeIcon size={19} />الرئيسية</button>
        <div className="nav-add-wrap"><button type="button" className="nav-add" onClick={openReceiptDrawer} aria-label="إضافة وصل"><Plus size={23} /></button></div>
        <button type="button" className={`nav-item ${activeTab === "privacy" ? "is-active" : ""}`} onClick={() => setActiveTab("privacy")}><ShieldCheck size={19} />الحماية</button>
      </nav>

      <Drawer open={receiptDrawerOpen} onOpenChange={setReceiptDrawerOpen} direction="bottom">
        <DrawerContent className="drawer-panel" aria-describedby="new-receipt-description">
          <DrawerHeader className="drawer-heading">
            <div>
              <DrawerTitle className="drawer-title">إضافة وصل جديد</DrawerTitle>
              <DrawerDescription className="drawer-description" id="new-receipt-description">السجل محفوظ محلياً؛ أضف الدفعات لاحقاً من تفاصيل الوصل.</DrawerDescription>
            </div>
            <button className="icon-button" type="button" onClick={() => setReceiptDrawerOpen(false)} aria-label="إغلاق"><X size={18} /></button>
          </DrawerHeader>
          <form className="form-grid" onSubmit={(event) => void handleCreateReceipt(event)}>
            <label className="field-group"><span className="field-label">اسم الوصل أو الفاتورة</span><input className="field-control" required value={receiptForm.title} onChange={(event) => setReceiptForm({ ...receiptForm, title: event.target.value })} placeholder="مثال: مواد مشروع النجارة" /></label>
            <label className="field-group"><span className="field-label">الجهة أو المورد</span><input className="field-control" required value={receiptForm.merchant} onChange={(event) => setReceiptForm({ ...receiptForm, merchant: event.target.value })} placeholder="اسم المتجر أو الشخص" /></label>
            <div className="form-two">
              <label className="field-group"><span className="field-label">إجمالي المبلغ</span><input className="field-control" type="number" min="0" step="any" required inputMode="decimal" value={receiptForm.total} onChange={(event) => setReceiptForm({ ...receiptForm, total: event.target.value })} placeholder="0" /></label>
              <label className="field-group"><span className="field-label">العملة</span><select className="field-control" value={receiptForm.currency} onChange={(event) => setReceiptForm({ ...receiptForm, currency: event.target.value as CurrencyCode })}>{CURRENCIES.map((currency) => <option value={currency.value} key={currency.value}>{currency.label}</option>)}</select></label>
            </div>
            <div className="form-two">
              <label className="field-group"><span className="field-label">تاريخ الوصل</span><input className="field-control" type="date" required value={receiptForm.issuedAt} onChange={(event) => setReceiptForm({ ...receiptForm, issuedAt: event.target.value })} /></label>
              <label className="field-group"><span className="field-label">تاريخ الاستحقاق</span><input className="field-control" type="date" value={receiptForm.dueDate} onChange={(event) => setReceiptForm({ ...receiptForm, dueDate: event.target.value })} /></label>
            </div>
            <label className="field-group"><span className="field-label">ملاحظة (اختياري)</span><textarea className="field-control" value={receiptForm.note} onChange={(event) => setReceiptForm({ ...receiptForm, note: event.target.value })} placeholder="أي تفاصيل تساعدك على تذكّر هذا الوصل" /></label>
            <div className="form-footer"><button type="button" className="soft-action" onClick={() => setReceiptDrawerOpen(false)}>إلغاء</button><button className="primary-action" type="submit"><FilePlus2 size={16} /> حفظ الوصل</button></div>
          </form>
        </DrawerContent>
      </Drawer>

      <Drawer open={detailDrawerOpen} onOpenChange={setDetailDrawerOpen} direction="bottom">
        <DrawerContent className="drawer-panel">
          {selectedReceipt && (
            <>
              <DrawerHeader className="drawer-heading">
                <div>
                  <DrawerTitle className="drawer-title">{selectedReceipt.title}</DrawerTitle>
                  <DrawerDescription className="drawer-description">{selectedReceipt.merchant} · وصل {formatDate(selectedReceipt.issuedAt)}</DrawerDescription>
                </div>
                <button className="icon-button" type="button" onClick={() => setDetailDrawerOpen(false)} aria-label="إغلاق"><X size={18} /></button>
              </DrawerHeader>
              <div className="detail-total">
                <div><span>{currentState === "paid" ? "إجمالي الوصل" : currentState === "overpaid" ? "المبلغ المدفوع بزيادة" : "المتبقي للدفع"}</span><strong>{formatMoney(currentState === "paid" ? selectedReceipt.total : Math.abs(currentBalance), selectedReceipt.currency)}</strong></div>
                <span className="detail-state">{statusCopy(currentState)}</span>
              </div>
              <div className="detail-row"><span>قيمة الوصل</span><strong>{formatMoney(selectedReceipt.total, selectedReceipt.currency)}</strong></div>
              <div className="detail-row"><span>ما دفعته</span><strong>{formatMoney(paidAmount(selectedReceipt), selectedReceipt.currency)}</strong></div>
              <div className="detail-row"><span>الاستحقاق</span><strong>{formatDate(selectedReceipt.dueDate)}</strong></div>
              {selectedReceipt.note && <div className="detail-row"><span>ملاحظتك</span><strong>{selectedReceipt.note}</strong></div>}
              <h3 className="payments-title">سجل الدفعات ({selectedReceipt.payments.length})</h3>
              {selectedReceipt.payments.length ? selectedReceipt.payments.slice().reverse().map((payment) => <div className="payment-row" key={payment.id}><span><strong>{formatMoney(payment.amount, selectedReceipt.currency)}</strong><p>{payment.method} · {formatDate(payment.paidAt)}{payment.note ? ` · ${payment.note}` : ""}</p></span><Check size={17} color="oklch(0.42 0.1 159)" /></div>) : <p className="section-caption">لم تُسجّل أي دفعة لهذا الوصل بعد.</p>}
              <div className="form-footer"><button className="soft-action" type="button" onClick={openPaymentDrawer}><WalletCards size={16} /> تسجيل دفعة</button><button className="primary-action" type="button" onClick={() => { setDetailDrawerOpen(false); setReceiptDrawerOpen(true); }}><FileText size={16} /> وصل جديد</button></div>
              <button className="danger-button" type="button" onClick={() => void handleDeleteReceipt()}><Trash2 size={15} className="inline ml-1" /> حذف هذا الوصل</button>
            </>
          )}
        </DrawerContent>
      </Drawer>

      <Drawer open={paymentDrawerOpen} onOpenChange={setPaymentDrawerOpen} direction="bottom">
        <DrawerContent className="drawer-panel">
          {selectedReceipt && (
            <>
              <DrawerHeader className="drawer-heading"><div><DrawerTitle className="drawer-title">تسجيل دفعة</DrawerTitle><DrawerDescription className="drawer-description">للوصل: {selectedReceipt.title}</DrawerDescription></div><button className="icon-button" type="button" onClick={() => setPaymentDrawerOpen(false)} aria-label="إغلاق"><X size={18} /></button></DrawerHeader>
              <form className="form-grid" onSubmit={(event) => void handleCreatePayment(event)}>
                <label className="field-group"><span className="field-label">مبلغ الدفعة ({CURRENCIES.find((currency) => currency.value === selectedReceipt.currency)?.label})</span><input className="field-control" type="number" step="any" min="0" required inputMode="decimal" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} /></label>
                <div className="form-two"><label className="field-group"><span className="field-label">تاريخ الدفع</span><input className="field-control" type="date" required value={paymentForm.paidAt} onChange={(event) => setPaymentForm({ ...paymentForm, paidAt: event.target.value })} /></label><label className="field-group"><span className="field-label">طريقة الدفع</span><select className="field-control" value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}><option>نقداً</option><option>تحويل</option><option>بطاقة</option><option>أخرى</option></select></label></div>
                <label className="field-group"><span className="field-label">ملاحظة (اختياري)</span><input className="field-control" value={paymentForm.note} onChange={(event) => setPaymentForm({ ...paymentForm, note: event.target.value })} placeholder="رقم التحويل أو أي تذكير" /></label>
                <div className="form-footer"><button type="button" className="soft-action" onClick={() => setPaymentDrawerOpen(false)}>إلغاء</button><button className="primary-action" type="submit"><WalletCards size={16} /> حفظ الدفعة</button></div>
              </form>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

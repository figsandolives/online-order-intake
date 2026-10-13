const $ = selector => document.querySelector(selector);
const API_BASE = "https://162-35-27-249.sslip.io/platform-api";
const PRINT_LOGO_URL = "https://figsolives.online/logo.png";
let employeeToken = sessionStorage.getItem("figsTrackerSession") || "";

async function apiRequest(path, options = {}) {
  async function send() {
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    if (employeeToken) headers.Authorization = `Bearer ${employeeToken}`;
    return fetch(`${API_BASE}${path}`, { ...options, headers });
  }
  let response = await send();
  if (response.status !== 401) return response;
  const code = window.prompt("أدخل رمز إدارة المنصة");
  if (!code) throw new Error("يلزم رمز الإدارة لعرض الطلبات");
  const login = await fetch(`${API_BASE}/auth/employee`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ code }) });
  const session = await login.json().catch(() => ({}));
  if (!login.ok || !session.sessionToken) throw new Error(session.error || "رمز الإدارة غير صحيح");
  employeeToken = session.sessionToken;
  sessionStorage.setItem("figsTrackerSession", employeeToken);
  response = await send();
  return response;
}

async function refreshOrders() {
  try {
    const response = await fetch(`${API_BASE}/tracker/orders`, { headers: { Accept: "application/json" } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data)) throw new Error(data.error || "تعذر قراءة الطلبات");
    orders = data;
    setLiveStatus(true);
    render();
    setSound();
  } catch (error) {
    setLiveStatus(false);
    // Keep the last successful list visible during a brief network interruption.
    // Replacing it with an error makes the operational screen look empty even
    // though the orders are still available on the next refresh.
    if (!orders.length) $("#ordersList").innerHTML = emptyStateHtml("تعذر قراءة الطلبات", error.message || "سيُعاد المحاولة تلقائياً");
    else console.warn("Order refresh failed; keeping the displayed list.", error);
  }
}
let orders = [], activeTab = "new", activeCatalog = localStorage.getItem("figsOlivesTrackerCatalog") === "restaurant" ? "restaurant" : "bakery", page = 1, pageSize = 12;
let soundEnabled = localStorage.getItem("figsOlivesOrderBellEnabled") === "1";
let bellRinging = false;
const money = value => `${Number(value || 0).toFixed(3)} د.ك`;
const invoiceTotalsHtml = order => { const delivery = Number(order.deliveryFee || 0); const products = Number.isFinite(Number(order.subtotal)) ? Number(order.subtotal) : Number(order.total || 0) - delivery; return `<section class="a4-total"><span>قيمة المنتجات <b>${money(products)}</b></span><span>سعر التوصيل <b>${money(delivery)}</b></span><strong>الإجمالي <b>${money(order.total)}</b></strong></section>`; };
// نسخة الطباعة التشغيلية لا تعرض مبلغ التوصيل؛ يبقى في PDF واتساب الخاص بالعميل.
const invoicePrintTotalsHtml = order => { const delivery = Number(order.deliveryFee || 0); const products = Number.isFinite(Number(order.subtotal)) ? Number(order.subtotal) : Number(order.total || 0) - delivery; return `<section class="a4-total"><span>قيمة المنتجات <b>${money(products)}</b></span><strong>الإجمالي <b>${money(order.total)}</b></strong></section>`; };
const preparationOverTwoHours = preparation => { if (!preparation) return false; const hours = (value, unit) => Math.max(1, Number(value) || 0) * (unit === "day" ? 24 : 1); return Math.max(hours(preparation.first, preparation.unit), preparation.hasSecond && Number(preparation.second) ? hours(preparation.second, preparation.secondUnit || preparation.unit) : 0) > 2; };
const invoicePreparationNotice = order => (order.items || []).some(item => preparationOverTwoHours(item.preparation) || (item.options || []).some(option => preparationOverTwoHours(option.preparation))) ? `<p class="a4-preparation-notice">ملاحظة: يوجد في طلبك أصناف تأخذ وقت للتجهيز.. لذا يرجى العلم أنه قد يتأخر طلبك أو يتم تأجيله.</p>` : "";
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
const dateText = value => value ? new Date(Number(value) || value).toLocaleString("ar-KW", { dateStyle:"medium", timeStyle:"short" }) : "—";
const branchName = id => ({ hawalli: "فرع حولي", yarmouk: "فرع اليرموك", abu: "فرع أبو الحصانية" }[id] || "الفرع");
const pickupText = order => `استلام من ${branchName(order.branchId)}`;
const deliveryText = order => order.mode === "pickup" ? pickupText(order) : `توصيل${order.areaName ? ` — ${order.areaName}` : ""}`;
const dueText = order => {
  const seconds = Math.max(0, Math.floor((Date.now() - Number(order.createdAt || Date.now())) / 1000));
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0"), minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0"), secs = String(seconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${secs}`;
};
function isRestaurantOrder(order) { return order.catalogType === "restaurant" || (order.items || []).some(item => item.catalogType === "restaurant"); }
function catalogOf(order) { return isRestaurantOrder(order) ? "restaurant" : "bakery"; }
function scopedOrders() { return orders.filter(order => catalogOf(order) === activeCatalog); }
function filteredOrders() { return scopedOrders().filter(order => activeTab === "new" ? order.status !== "accepted" : order.status === "accepted").sort((a,b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)); }
function transferActionsHtml(order) {
  const id = escapeHtml(order.orderId);
  if (order.branchTransfer?.branch === "yarmouk" && order.branchTransfer?.status === "sent") return "";
  return `<span class="transfer-menu"><button class="transfer-icon" data-transfer-menu="${id}" aria-label="مشاركة وتحويل الطلب" title="مشاركة وتحويل الطلب"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a3 3 0 1 0-2.83-4 3 3 0 0 0 .08.67L8.9 8.34a3 3 0 1 0 0 7.32l6.35 3.67A3 3 0 1 0 16.27 18l-6.35-3.67a3.1 3.1 0 0 0 0-4.66L16.27 6A3 3 0 0 0 18 8Z"/></svg></button></span>`;
}
function transferStatusHtml(order) {
  if (!(order.branchTransfer?.branch === "yarmouk" && order.branchTransfer?.status === "sent")) return "";
  return `<div class="transfer-row"><span class="transfer-status">تم التحويل إلى فرع اليرموك</span><button class="cancel-transfer-button" data-cancel-transfer="${escapeHtml(order.orderId)}">إلغاء التحويل</button></div>`;
}
const icons = {
  truck: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
  store: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v10h16V10M3 6l2-3h14l2 3v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z"/></svg>'
};
function emptyStateHtml(title, hint) { return `<div class="empty-state">${icons.inbox}<strong>${escapeHtml(title)}</strong><span>${escapeHtml(hint)}</span></div>`; }
// Waiting time colour: under 15 minutes normal, under 30 a warning, then late.
function elapsedLevel(order) { const minutes = (Date.now() - Number(order.createdAt || Date.now())) / 60000; return minutes >= 30 ? "late" : minutes >= 15 ? "warn" : ""; }
// "Within two hours" delivery: the order page shows the customer a one-hour
// window starting an hour after payment (or at 9:30 opening), but does not save
// it with the order. Rebuild the same window here from the payment time.
function asapWindow(order) {
  if (order.mode === "pickup" || order.deliveryTiming !== "asap") return null;
  if (order.expectedStart && order.expectedEnd) return { start: new Date(order.expectedStart), end: new Date(order.expectedEnd) };
  const paid = new Date(Date.parse(order.paidAt) || Number(order.createdAt) || Date.now());
  const opening = new Date(paid);
  if (paid.getHours() * 60 + paid.getMinutes() >= 22 * 60) opening.setDate(opening.getDate() + 1);
  opening.setHours(9, 30, 0, 0);
  const start = new Date(Math.max(paid.getTime() + 3600000, opening.getTime()));
  return { start, end: new Date(start.getTime() + 3600000) };
}
const clockText = value => new Intl.DateTimeFormat("ar-KW", { hour: "numeric", minute: "2-digit" }).format(value);
function asapWindowText(order) { const window = asapWindow(order); return window ? `بين ${clockText(window.start)} إلى ${clockText(window.end)}` : ""; }
function deliveryTimeText(order) { return order.scheduledAt ? dateText(order.scheduledAt) : asapWindowText(order) || (order.deliveryTiming === "asap" ? "أقرب وقت" : "عند الجاهزية"); }
function orderCardHtml(order) {
  const isNew = order.status !== "accepted", level = isNew ? elapsedLevel(order) : "";
  const badge = isNew ? `<span class="elapsed ${level}" data-elapsed="${escapeHtml(order.orderId)}">${dueText(order)}</span>` : `<span class="accepted-chip">مقبول</span>`;
  return `<article class="order-card ${isNew ? "is-new" : ""} ${level === "late" ? "is-late" : ""}">
    <div class="card-head"><span class="invoice-number">#${escapeHtml(order.orderId)}</span>${badge}</div>
    <div class="card-customer"><strong>${escapeHtml(order.customerName || "—")}</strong><a href="tel:${escapeHtml(order.phone || "")}">${escapeHtml(order.phone || "—")}</a></div>
    <ul class="card-facts">
      <li>${order.mode === "pickup" ? icons.store : icons.truck}<span>${escapeHtml(deliveryText(order))}</span></li>
      <li>${icons.clock}<span class="${order.scheduledAt ? "scheduled" : ""}">${order.scheduledAt ? "موعد التوصيل: " : ""}${escapeHtml(deliveryTimeText(order))}</span></li>
      <li>${icons.calendar}<span>${dateText(order.createdAt)}</span></li>
    </ul>
    <div class="card-foot"><span class="card-total">${money(order.total)}</span>${transferActionsHtml(order)}<button class="view-button" data-view="${escapeHtml(order.orderId)}">عرض الطلب</button></div>
    ${transferStatusHtml(order)}
  </article>`;
}
function render() {
  const listed = filteredOrders(), pages = Math.max(1, Math.ceil(listed.length / pageSize)); page = Math.min(page, pages);
  const scoped = scopedOrders();
  $("#newCount").textContent = scoped.filter(order => order.status !== "accepted").length; $("#acceptedCount").textContent = scoped.filter(order => order.status === "accepted").length;
  ["bakery", "restaurant"].forEach(catalog => {
    const count = orders.filter(order => catalogOf(order) === catalog && order.status !== "accepted").length;
    const badge = $(`#${catalog}NewCount`); badge.textContent = count; badge.classList.toggle("hidden", !count);
  });
  $("#trackerBrand").textContent = activeCatalog === "restaurant" ? "مطعم التين الطبيعي" : "مخبز التين والزيتون";
  const pageOrders = listed.slice((page - 1) * pageSize, page * pageSize);
  $("#ordersList").innerHTML = pageOrders.length ? pageOrders.map(orderCardHtml).join("") : (activeTab === "new" ? emptyStateHtml("لا توجد طلبات جديدة", "ستظهر الطلبات هنا فور وصولها") : emptyStateHtml("لا توجد طلبات مقبولة", "الطلبات التي تقبلها تنتقل إلى هنا"));
  $("#pageInfo").textContent = `${page} / ${pages}`; $("#previousPage").disabled = page <= 1; $("#nextPage").disabled = page >= pages;
  $("#pagination").classList.toggle("hidden", pages <= 1);
}
function setLiveStatus(ok) {
  const time = new Date().toLocaleTimeString("ar-KW", { hour: "numeric", minute: "2-digit" });
  $("#liveStatus").classList.toggle("offline", !ok);
  if (ok) $("#liveStatusText").textContent = `آخر تحديث ${time}`;
  else $("#liveStatusText").textContent = "تعذر التحديث — إعادة المحاولة";
}
function refreshTimers() { document.querySelectorAll("[data-elapsed]").forEach(node => { const order = orders.find(item => item.orderId === node.dataset.elapsed); if (!order) return; node.textContent = dueText(order); const level = elapsedLevel(order); node.className = `elapsed ${level}`; node.closest(".order-card")?.classList.toggle("is-late", level === "late"); }); }
function optionSummary(option) { const name = option?.nameAr || option?.nameEn || option?.id || ""; return option?.isFilling || option?.flowStepId === "fillings" ? `${Math.max(1, Number(option.quantity) || 1)} ${name}` : name; }
function invoiceItemName(item) { return `${escapeHtml(item.name || item.nameAr || item.id)}${item.options?.length ? `<small>${escapeHtml(item.options.map(optionSummary).join("، "))}</small>` : ""}`; }
function invoiceHtml(order) { const delivery = order.mode === "pickup" ? order.branchId || "الفرع" : `${order.areaName || ""} — ${order.address || ""}`; const deliveryTime = order.scheduledAt ? dateText(order.scheduledAt) : asapWindowText(order) || (order.deliveryTiming === "asap" ? "أقرب وقت متاح" : "إبلاغ العميل عند الجاهزية"); return `<section class="a4-invoice"><header class="a4-head"><img src="logo.png" alt=""><div><h1>فاتورة شراء</h1><p>Purchase Invoice</p></div></header><section class="a4-meta"><div><b>رقم الفاتورة</b><strong>#${escapeHtml(order.orderId)}</strong><b>تاريخ الإصدار</b><strong>${dateText(order.createdAt)}</strong></div><div class="a4-company">شركة صحي ولذيذ للتجهيزات الغذائية<br>حولي، شارع تونس، مجمع علي فهد الخالد، دور الميزانين<br><span dir="ltr">66906605 · 22085888</span></div></section><p class="a4-customer-line">${escapeHtml(order.customerName || "—")} <i>·</i> <span dir="ltr">${escapeHtml(order.phone || "—")}</span> <i>·</i> ${escapeHtml(delivery)}</p><table class="a4-items"><thead><tr><th>#</th><th>الصنف</th><th>الملاحظات</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>${(order.items || []).map((item,index) => `<tr><td>${index+1}</td><td><b>${invoiceItemName(item)}</b><small dir="ltr">${escapeHtml(item.nameEn || item.name || item.id)}</small></td><td>${escapeHtml(item.note || "—")}</td><td>${item.quantity}</td><td>${money(item.unitPrice)}</td><td>${money(item.total || item.unitPrice * item.quantity)}</td></tr>`).join("")}</tbody></table>${invoicePreparationNotice(order)}<section class="a4-summary-row"><div class="a4-delivery-time"><small>وقت التوصيل</small><b>${escapeHtml(deliveryTime)}</b></div>${invoiceTotalsHtml(order)}</section></section>`; }
function trackerDeliveryTime(order) { const window = asapWindow(order); if (window) return `خلال ساعتين:<br>${new Intl.DateTimeFormat("ar-KW", { weekday:"long", day:"numeric", month:"long", year:"numeric" }).format(window.start)}،<br>${asapWindowText(order)}`; if (!order.scheduledAt) return order.deliveryTiming === "asap" ? "أقرب وقت متاح" : "إبلاغ العميل عند الجاهزية"; const end = new Date(order.scheduledAt), start = new Date(end.getTime() - 3600000); const date = new Intl.DateTimeFormat("ar-KW", { weekday:"long", day:"numeric", month:"long", year:"numeric" }).format(end); const time = value => new Intl.DateTimeFormat("ar-KW", {hour:"numeric",minute:"2-digit"}).format(value); return `وقت التوصيل المحدد:<br>${date}،<br>بين ${time(start)} إلى ${time(end)}`; }
function trackerPrintInvoice(order) { const delivery = order.mode === "pickup" ? order.branchId || "الفرع" : `${order.areaName || ""} — ${order.address || ""}`; const rows = (order.items || []).map((item,index)=>`<tr><td>${index+1}</td><td><b>${invoiceItemName(item)}</b><small dir="ltr">${escapeHtml(item.nameEn || item.name || item.id)}</small></td><td>${escapeHtml(item.note || "—")}</td><td>${item.quantity}</td><td>${money(item.unitPrice)}</td><td>${money(item.total || item.unitPrice * item.quantity)}</td></tr>`).join(""); return `<section class="a4-invoice"><header class="a4-head"><img src="${PRINT_LOGO_URL}" alt="مخبز التين والزيتون"><div><h1>فاتورة شراء</h1><p>Purchase Invoice</p></div></header><section class="a4-meta"><div><b>رقم الفاتورة</b><strong>#${escapeHtml(order.orderId)}</strong><b>تاريخ الإصدار</b><strong>${dateText(order.createdAt)}</strong></div><div class="a4-company">شركة صحي ولذيذ للتجهيزات الغذائية<br>حولي، شارع تونس، مجمع علي فهد الخالد، دور الميزانين<br><span dir="ltr">66906605 · 22085888</span></div></section><p class="a4-customer-line">${escapeHtml(order.customerName || "—")} <i>·</i> <span dir="ltr">${escapeHtml(order.phone || "—")}</span> <i>·</i> ${escapeHtml(delivery)}</p><table class="a4-items"><thead><tr><th>#</th><th>الصنف</th><th>الملاحظات</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table>${invoicePreparationNotice(order)}<section class="a4-summary-row"><div class="a4-delivery-time"><small>وقت التوصيل</small><b>${trackerDeliveryTime(order)}</b></div>${invoicePrintTotalsHtml(order)}</section><div class="a4-paid">✓&nbsp; مدفوع: ${escapeHtml(String(order.paymentMethod || "KNET").toUpperCase())}</div></section>`; }
function showOrder(order) { const delivery = order.mode === "pickup" ? branchName(order.branchId) : `${order.areaName || ""} — ${order.address || ""}`; const items = (order.items || []).map((item,index)=>`<tr><td>${index+1}</td><td><b>${escapeHtml(item.name || item.nameAr || item.id)}</b><small dir="ltr">${escapeHtml(item.nameEn || item.name || item.id)}</small></td><td>${escapeHtml(item.note || "—")}</td><td>${item.quantity}</td><td>${money(item.unitPrice)}</td><td>${money(item.total || item.unitPrice * item.quantity)}</td></tr>`).join(""); $("#orderDetails").innerHTML = `<div class="order-view-top"><div><span>فاتورة شراء</span><h1>#${escapeHtml(order.orderId)}</h1><small>تاريخ الإصدار: ${dateText(order.createdAt)}</small></div><div class="dialog-actions">${order.status === "accepted" ? `<button class="print-button" data-print="${escapeHtml(order.orderId)}">طباعة الفاتورة</button>` : `<button class="accept-button" data-accept="${escapeHtml(order.orderId)}">قبول الطلب</button>`}</div></div><main class="order-view-grid"><section class="order-info-card"><h2>معلومات الفاتورة</h2><dl><div><dt>العميل</dt><dd>${escapeHtml(order.customerName || "—")}</dd></div><div><dt>الهاتف</dt><dd dir="ltr">${escapeHtml(order.phone || "—")}</dd></div><div><dt>نوع الطلب</dt><dd>${escapeHtml(deliveryText(order))}</dd></div><div><dt>العنوان / الفرع</dt><dd>${escapeHtml(delivery)}</dd></div><div><dt>موعد التوصيل</dt><dd>${escapeHtml(deliveryTimeText(order))}</dd></div><div><dt>طريقة الدفع</dt><dd>${String(order.paymentMethod || "KNET").toUpperCase()}</dd></div></dl><div class="order-total"><span>الإجمالي</span><strong>${money(order.total)}</strong></div></section><section class="order-products-card"><h2>المنتجات</h2><table class="items"><thead><tr><th>#</th><th>الصنف</th><th>الملاحظات</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>${items || '<tr><td colspan="6">لا توجد منتجات</td></tr>'}</tbody></table></section></main>`; if (!$("#orderDialog").open) $("#orderDialog").showModal(); }
async function acceptOrder(orderId) { const button = document.querySelector(`[data-accept="${CSS.escape(orderId)}"]`); if (button) { button.disabled = true; button.textContent = "جارٍ القبول…"; } try { const response = await fetch(`${API_BASE}/tracker/orders/accept`,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({orderId})}); const data = await response.json().catch(()=>({})); if (!response.ok || !data.ok) throw new Error(data.error || "تعذر قبول الطلب"); const accepted = { ...(orders.find(order => order.orderId === orderId) || {}), status:"accepted", acceptedAt:new Date().toISOString() }; orders = orders.map(order => order.orderId === orderId ? accepted : order); render(); setSound(); showOrder(accepted); } catch(error) { alert(error.message || "تعذر قبول الطلب"); if (button) { button.disabled=false; button.textContent="قبول الطلب"; } } }
async function printOrder(order) { document.querySelector(".print-sheet")?.remove(); const sheet = document.createElement("div"); sheet.className="print-sheet"; sheet.innerHTML=trackerPrintInvoice(order); document.body.append(sheet); const logo = sheet.querySelector("img"); await Promise.race([logo?.decode?.().catch(()=>undefined), new Promise(resolve => setTimeout(resolve, 1200))]); window.print(); sheet.remove(); }
// Override the legacy print helper so pickup invoices explicitly name the branch.
async function printOrder(order) {
  document.querySelector(".print-sheet")?.remove();
  const sheet = document.createElement("div");
  sheet.className = "print-sheet";
  sheet.innerHTML = trackerPrintInvoice(order);
  if (order.mode === "pickup") {
    const customerLine = sheet.querySelector(".a4-customer-line");
    if (customerLine) customerLine.innerHTML = `${escapeHtml(order.customerName || "—")} <i>·</i> <span dir="ltr">${escapeHtml(order.phone || "—")}</span> <i>·</i> ${escapeHtml(pickupText(order))}`;
  }
  document.body.append(sheet);
  const logo = sheet.querySelector("img");
  await Promise.race([logo?.decode?.().catch(() => undefined), new Promise(resolve => setTimeout(resolve, 1200))]);
  window.print();
  sheet.remove();
}
async function createTransferPdfBase64(order) {
  if (!window.html2canvas || !window.jspdf?.jsPDF) throw new Error("تعذر تجهيز ملف PDF في المتصفح");
  const exportNode = document.createElement("div");
  // Reuse the exact A4 print stylesheet; without print-sheet the logo and
  // invoice dimensions are rendered as unstyled page content.
  exportNode.className = "print-sheet pdf-export";
  exportNode.innerHTML = trackerPrintInvoice(order);
  document.body.append(exportNode);
  try {
    await document.fonts?.ready;
    const logo = exportNode.querySelector("img");
    await Promise.race([logo?.decode?.().catch(() => undefined), new Promise(resolve => setTimeout(resolve, 1200))]);
    const source = exportNode.querySelector(".a4-invoice");
    const canvas = await html2canvas(source, { scale: 2, backgroundColor: "#fff", useCORS: true, logging: false });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");
    const width = 190, printableHeight = 277, imageHeight = canvas.height * width / canvas.width;
    const image = canvas.toDataURL("image/jpeg", .94);
    let remaining = imageHeight, y = 10;
    pdf.addImage(image, "JPEG", 10, y, width, imageHeight, undefined, "FAST");
    remaining -= printableHeight;
    while (remaining > .5) { pdf.addPage(); y = -(imageHeight - remaining); pdf.addImage(image, "JPEG", 10, y, width, imageHeight, undefined, "FAST"); remaining -= printableHeight; }
    return pdf.output("datauristring").split(",")[1];
  } finally { exportNode.remove(); }
}
async function transferToYarmouk(orderId, button) {
  const order = orders.find(item => item.orderId === orderId);
  if (!order) return;
  button.disabled = true; button.textContent = "جارٍ التحويل…";
  try {
    const pdfBase64 = await createTransferPdfBase64(order);
    const response = await apiRequest("/admin/orders/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, pdfBase64 }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "تعذر التحويل إلى فرع اليرموك");
    const transferred = { ...order, branchTransfer: { branch: "yarmouk", status: "sent", phone: "50203306", transferredAt: data.transferredAt || new Date().toISOString() } };
    orders = orders.map(item => item.orderId === orderId ? transferred : item); render();
  } catch (error) { alert(error.message || "تعذر التحويل إلى فرع اليرموك"); button.disabled = false; button.textContent = "تحويل إلى اليرموك"; }
}
async function cancelYarmoukTransfer(orderId, button) {
  button.disabled = true; button.textContent = "جارٍ الإلغاء…";
  try {
    const response = await apiRequest("/admin/orders/cancel-transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "تعذر إلغاء التحويل");
    orders = orders.map(item => item.orderId === orderId ? { ...item, branchTransfer: null } : item); render();
  } catch (error) { alert(error.message || "تعذر إلغاء التحويل"); button.disabled = false; button.textContent = "إلغاء التحويل"; }
}
function updateSoundButton() { const button = $("#enableSoundButton"); button.classList.toggle("active", soundEnabled); button.classList.toggle("ringing", soundEnabled && bellRinging); $("#soundButtonText").textContent = soundEnabled ? "الجرس مفعّل" : "تفعيل الجرس"; }
// The bell only rings for the section (bakery or restaurant) chosen on this device.
function hasPendingOrders() { return scopedOrders().some(order => order.status !== "accepted"); }
function stopOrderBell() { const audio = $("#newOrderSound"); bellRinging = false; audio.loop = false; audio.pause(); audio.currentTime = 0; updateSoundButton(); }
function startOrderBell() { if (!soundEnabled || !hasPendingOrders()) return stopOrderBell(); const audio = $("#newOrderSound"); audio.loop = true; bellRinging = true; if (audio.paused || audio.ended) audio.play().catch(() => { bellRinging = false; updateSoundButton(); }); updateSoundButton(); }
async function enableOrderBell() { const audio = $("#newOrderSound"); try { audio.volume = 1; audio.loop = true; audio.currentTime = 0; await audio.play(); bellRinging = true; soundEnabled = true; localStorage.setItem("figsOlivesOrderBellEnabled", "1"); updateSoundButton(); if (!hasPendingOrders()) stopOrderBell(); } catch { soundEnabled = false; bellRinging = false; localStorage.removeItem("figsOlivesOrderBellEnabled"); updateSoundButton(); alert("تعذر تشغيل الجرس. تأكد من أن صوت المتصفح غير مكتوم."); } }
function setSound() { if (soundEnabled && hasPendingOrders()) startOrderBell(); else stopOrderBell(); }
$("#enableSoundButton").onclick = enableOrderBell;
updateSoundButton();
document.querySelectorAll("[data-tab]").forEach(button=>button.onclick=()=>{activeTab=button.dataset.tab; page=1; document.querySelectorAll("[data-tab]").forEach(tab=>tab.classList.toggle("active",tab===button)); render();});
function selectCatalog(catalog) { activeCatalog = catalog === "restaurant" ? "restaurant" : "bakery"; localStorage.setItem("figsOlivesTrackerCatalog", activeCatalog); page = 1; document.body.dataset.catalog = activeCatalog; document.querySelectorAll(".catalog-switch [data-catalog]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.catalog === activeCatalog))); document.title = `متابعة طلبات الأونلاين | ${activeCatalog === "restaurant" ? "مطعم التين الطبيعي" : "مخبز التين والزيتون"}`; render(); setSound(); }
document.querySelectorAll(".catalog-switch [data-catalog]").forEach(button=>button.onclick=()=>selectCatalog(button.dataset.catalog));
$("#pageSize").onchange=event=>{pageSize=Number(event.target.value);page=1;render();}; $("#previousPage").onclick=()=>{page--;render();}; $("#nextPage").onclick=()=>{page++;render();}; $("#closeDialog").onclick=()=>$("#orderDialog").close(); $("#orderDialog").onclick=event=>{if(event.target===$("#orderDialog")) $("#orderDialog").close();};
document.addEventListener("click",event=>{const view=event.target.closest("[data-view]"),accept=event.target.closest("[data-accept]"),print=event.target.closest("[data-print]"),transferMenu=event.target.closest("[data-transfer-menu]"),transfer=event.target.closest("[data-transfer]"),cancelTransfer=event.target.closest("[data-cancel-transfer]");if(view){const order=orders.find(item=>item.orderId===view.dataset.view);if(order)showOrder(order);}if(accept)acceptOrder(accept.dataset.accept);if(print){const order=orders.find(item=>item.orderId===print.dataset.print);if(order)printOrder(order);}if(transferMenu){const menu=transferMenu.closest(".transfer-menu");const open=menu.querySelector(".transfer-popover");document.querySelectorAll(".transfer-popover").forEach(node=>node.remove());if(!open)menu.insertAdjacentHTML("beforeend",`<div class="transfer-popover"><button class="transfer-button" data-transfer="${escapeHtml(transferMenu.dataset.transferMenu)}">تحويل إلى اليرموك</button></div>`);}else if(!transfer&&!event.target.closest(".transfer-popover"))document.querySelectorAll(".transfer-popover").forEach(node=>node.remove());if(transfer)transferToYarmouk(transfer.dataset.transfer,transfer);if(cancelTransfer)cancelYarmoukTransfer(cancelTransfer.dataset.cancelTransfer,cancelTransfer);});
refreshOrders();
setInterval(refreshOrders, 30000);
setInterval(refreshTimers,1000); selectCatalog(activeCatalog);

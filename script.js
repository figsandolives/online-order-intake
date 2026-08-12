const $ = selector => document.querySelector(selector);
const ORDER_ACTION_URL = "https://us-central1-menassafigs.cloudfunctions.net/acceptOnlineOrder";
const YARMOUK_TRANSFER_URL = "https://us-central1-menassafigs.cloudfunctions.net/transferOnlineOrderToYarmouk";
const YARMOUK_CANCEL_URL = "https://us-central1-menassafigs.cloudfunctions.net/cancelOnlineOrderYarmoukTransfer";
const PRINT_LOGO_URL = "https://figsolives.online/logo.png";
const db = window.ORDERING_FIREBASE?.database;
let orders = [], activeTab = "new", activeCatalog = "bakery", page = 1, pageSize = 10;
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
function scopedOrders() { return orders.filter(order => activeCatalog === "restaurant" ? isRestaurantOrder(order) : !isRestaurantOrder(order)); }
function filteredOrders() { return scopedOrders().filter(order => activeTab === "new" ? order.status !== "accepted" : order.status === "accepted").sort((a,b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)); }
function transferActionsHtml(order) {
  const id = escapeHtml(order.orderId);
  const transferred = order.branchTransfer?.branch === "yarmouk" && order.branchTransfer?.status === "sent";
  if (transferred) return `<div class="order-actions"><div class="actions"><button class="view-button" data-view="${id}">عرض</button><span class="transfer-status">تم التحويل إلى فرع اليرموك</span></div><button class="cancel-transfer-button" data-cancel-transfer="${id}">إلغاء التحويل</button></div>`;
  return `<div class="order-actions"><div class="actions"><button class="view-button" data-view="${id}">عرض</button><span class="transfer-menu"><button class="transfer-icon" data-transfer-menu="${id}" aria-label="مشاركة وتحويل الطلب" title="مشاركة وتحويل الطلب"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a3 3 0 1 0-2.83-4 3 3 0 0 0 .08.67L8.9 8.34a3 3 0 1 0 0 7.32l6.35 3.67A3 3 0 1 0 16.27 18l-6.35-3.67a3.1 3.1 0 0 0 0-4.66L16.27 6A3 3 0 0 0 18 8Z"/></svg></button></span></div></div>`;
}
function render() {
  const listed = filteredOrders(), pages = Math.max(1, Math.ceil(listed.length / pageSize)); page = Math.min(page, pages);
  const scoped = scopedOrders();
  $("#newCount").textContent = scoped.filter(order => order.status !== "accepted").length; $("#acceptedCount").textContent = scoped.filter(order => order.status === "accepted").length;
  $("#trackerBrand").textContent = activeCatalog === "restaurant" ? "مطعم التين الطبيعي" : "مخبز التين والزيتون";
  $("#tableTitle").textContent = activeTab === "new" ? "الطلبات الجديدة" : "الطلبات المقبولة";
  $("#tableHint").textContent = activeTab === "new" ? "طلبات تحتاج إلى قبول" : "طلبات تم قبولها وجاهزة للطباعة";
  $("#ordersHead").innerHTML = activeTab === "new" ? "<tr><th>رقم الفاتورة</th><th>الاسم</th><th>رقم الهاتف</th><th>السعر الإجمالي</th><th>طريقة التوصيل</th><th>تاريخ الإنشاء</th><th>موعد التوصيل</th><th>انقضى</th><th>الإجراءات</th></tr>" : "<tr><th>رقم الفاتورة</th><th>الاسم</th><th>رقم الهاتف</th><th>السعر الإجمالي</th><th>طريقة التوصيل</th><th>تاريخ الإنشاء</th><th>الإجراءات</th></tr>";
  const pageOrders = listed.slice((page - 1) * pageSize, page * pageSize);
  $("#ordersBody").innerHTML = pageOrders.length ? pageOrders.map(order => activeTab === "new" ? `<tr><td class="invoice-number">${escapeHtml(order.orderId)}</td><td><strong>${escapeHtml(order.customerName || "—")}</strong></td><td dir="ltr">${escapeHtml(order.phone || "—")}</td><td>${money(order.total)}</td><td>${escapeHtml(deliveryText(order))}</td><td>${dateText(order.createdAt)}</td><td>${order.scheduledAt ? dateText(order.scheduledAt) : order.deliveryTiming === "asap" ? "أقرب وقت" : "عند الجاهزية"}</td><td><span class="elapsed" data-elapsed="${escapeHtml(order.orderId)}">${dueText(order)}</span></td><td>${transferActionsHtml(order)}</td></tr>` : `<tr><td class="invoice-number">${escapeHtml(order.orderId)}</td><td><strong>${escapeHtml(order.customerName || "—")}</strong></td><td dir="ltr">${escapeHtml(order.phone || "—")}</td><td>${money(order.total)}</td><td>${escapeHtml(deliveryText(order))}</td><td>${dateText(order.createdAt)}</td><td>${transferActionsHtml(order)}</td></tr>`).join("") : `<tr class="empty-row"><td colspan="9">${activeTab === "new" ? "لا توجد طلبات جديدة حالياً" : "لا توجد طلبات مقبولة حالياً"}</td></tr>`;
  $("#pageInfo").textContent = `${page} / ${pages}`; $("#previousPage").disabled = page <= 1; $("#nextPage").disabled = page >= pages;
}
function refreshTimers() { document.querySelectorAll("[data-elapsed]").forEach(node => { const order = orders.find(item => item.orderId === node.dataset.elapsed); if (order) node.textContent = dueText(order); }); }
function optionSummary(option) { const name = option?.nameAr || option?.nameEn || option?.id || ""; return option?.isFilling || option?.flowStepId === "fillings" ? `${Math.max(1, Number(option.quantity) || 1)} ${name}` : name; }
function invoiceItemName(item) { return `${escapeHtml(item.name || item.nameAr || item.id)}${item.options?.length ? `<small>${escapeHtml(item.options.map(optionSummary).join("، "))}</small>` : ""}`; }
function invoiceHtml(order) { const delivery = order.mode === "pickup" ? order.branchId || "الفرع" : `${order.areaName || ""} — ${order.address || ""}`; const deliveryTime = order.scheduledAt ? dateText(order.scheduledAt) : order.deliveryTiming === "asap" ? "أقرب وقت متاح" : "إبلاغ العميل عند الجاهزية"; return `<section class="a4-invoice"><header class="a4-head"><img src="logo.png" alt=""><div><h1>فاتورة شراء</h1><p>Purchase Invoice</p></div></header><section class="a4-meta"><div><b>رقم الفاتورة</b><strong>#${escapeHtml(order.orderId)}</strong><b>تاريخ الإصدار</b><strong>${dateText(order.createdAt)}</strong></div><div class="a4-company">شركة صحي ولذيذ للتجهيزات الغذائية<br>حولي، شارع تونس، مجمع علي فهد الخالد، دور الميزانين<br><span dir="ltr">66906605 · 22085888</span></div></section><p class="a4-customer-line">${escapeHtml(order.customerName || "—")} <i>·</i> <span dir="ltr">${escapeHtml(order.phone || "—")}</span> <i>·</i> ${escapeHtml(delivery)}</p><table class="a4-items"><thead><tr><th>#</th><th>الصنف</th><th>الملاحظات</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>${(order.items || []).map((item,index) => `<tr><td>${index+1}</td><td><b>${invoiceItemName(item)}</b><small dir="ltr">${escapeHtml(item.nameEn || item.name || item.id)}</small></td><td>${escapeHtml(item.note || "—")}</td><td>${item.quantity}</td><td>${money(item.unitPrice)}</td><td>${money(item.total || item.unitPrice * item.quantity)}</td></tr>`).join("")}</tbody></table>${invoicePreparationNotice(order)}<section class="a4-summary-row"><div class="a4-delivery-time"><small>وقت التوصيل</small><b>${escapeHtml(deliveryTime)}</b></div>${invoiceTotalsHtml(order)}</section></section>`; }
function trackerDeliveryTime(order) { if (!order.scheduledAt) return order.deliveryTiming === "asap" ? "أقرب وقت متاح" : "إبلاغ العميل عند الجاهزية"; const end = new Date(order.scheduledAt), start = new Date(end.getTime() - 3600000); const date = new Intl.DateTimeFormat("ar-KW", { weekday:"long", day:"numeric", month:"long", year:"numeric" }).format(end); const time = value => new Intl.DateTimeFormat("ar-KW", {hour:"numeric",minute:"2-digit"}).format(value); return `وقت التوصيل المحدد:<br>${date}،<br>بين ${time(start)} إلى ${time(end)}`; }
function trackerPrintInvoice(order) { const delivery = order.mode === "pickup" ? order.branchId || "الفرع" : `${order.areaName || ""} — ${order.address || ""}`; const rows = (order.items || []).map((item,index)=>`<tr><td>${index+1}</td><td><b>${invoiceItemName(item)}</b><small dir="ltr">${escapeHtml(item.nameEn || item.name || item.id)}</small></td><td>${escapeHtml(item.note || "—")}</td><td>${item.quantity}</td><td>${money(item.unitPrice)}</td><td>${money(item.total || item.unitPrice * item.quantity)}</td></tr>`).join(""); return `<section class="a4-invoice"><header class="a4-head"><img src="${PRINT_LOGO_URL}" alt="مخبز التين والزيتون"><div><h1>فاتورة شراء</h1><p>Purchase Invoice</p></div></header><section class="a4-meta"><div><b>رقم الفاتورة</b><strong>#${escapeHtml(order.orderId)}</strong><b>تاريخ الإصدار</b><strong>${dateText(order.createdAt)}</strong></div><div class="a4-company">شركة صحي ولذيذ للتجهيزات الغذائية<br>حولي، شارع تونس، مجمع علي فهد الخالد، دور الميزانين<br><span dir="ltr">66906605 · 22085888</span></div></section><p class="a4-customer-line">${escapeHtml(order.customerName || "—")} <i>·</i> <span dir="ltr">${escapeHtml(order.phone || "—")}</span> <i>·</i> ${escapeHtml(delivery)}</p><table class="a4-items"><thead><tr><th>#</th><th>الصنف</th><th>الملاحظات</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table>${invoicePreparationNotice(order)}<section class="a4-summary-row"><div class="a4-delivery-time"><small>وقت التوصيل</small><b>${trackerDeliveryTime(order)}</b></div>${invoicePrintTotalsHtml(order)}</section><div class="a4-paid">✓&nbsp; مدفوع: ${escapeHtml(String(order.paymentMethod || "KNET").toUpperCase())}</div></section>`; }
function showOrder(order) { const delivery = order.mode === "pickup" ? order.branchId || "—" : `${order.areaName || ""} — ${order.address || ""}`; const items = (order.items || []).map((item,index)=>`<tr><td>${index+1}</td><td><b>${escapeHtml(item.name || item.nameAr || item.id)}</b><small dir="ltr">${escapeHtml(item.nameEn || item.name || item.id)}</small></td><td>${escapeHtml(item.note || "—")}</td><td>${item.quantity}</td><td>${money(item.unitPrice)}</td><td>${money(item.total || item.unitPrice * item.quantity)}</td></tr>`).join(""); $("#orderDetails").innerHTML = `<div class="order-view-top"><div><span>فاتورة شراء</span><h1>#${escapeHtml(order.orderId)}</h1><small>تاريخ الإصدار: ${dateText(order.createdAt)}</small></div><div class="dialog-actions">${order.status === "accepted" ? `<button class="print-button" data-print="${escapeHtml(order.orderId)}">طباعة الفاتورة</button>` : `<button class="accept-button" data-accept="${escapeHtml(order.orderId)}">قبول الطلب</button>`}</div></div><main class="order-view-grid"><section class="order-info-card"><h2>معلومات الفاتورة</h2><dl><div><dt>العميل</dt><dd>${escapeHtml(order.customerName || "—")}</dd></div><div><dt>الهاتف</dt><dd dir="ltr">${escapeHtml(order.phone || "—")}</dd></div><div><dt>نوع الطلب</dt><dd>${escapeHtml(deliveryText(order))}</dd></div><div><dt>العنوان / الفرع</dt><dd>${escapeHtml(delivery)}</dd></div><div><dt>موعد التوصيل</dt><dd>${order.scheduledAt ? dateText(order.scheduledAt) : order.deliveryTiming === "asap" ? "أقرب وقت" : "عند الجاهزية"}</dd></div><div><dt>طريقة الدفع</dt><dd>${String(order.paymentMethod || "KNET").toUpperCase()}</dd></div></dl><div class="order-total"><span>الإجمالي</span><strong>${money(order.total)}</strong></div></section><section class="order-products-card"><h2>المنتجات</h2><table class="items"><thead><tr><th>#</th><th>الصنف</th><th>الملاحظات</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>${items || '<tr><td colspan="6">لا توجد منتجات</td></tr>'}</tbody></table></section></main>`; if (!$("#orderDialog").open) $("#orderDialog").showModal(); }
async function acceptOrder(orderId) { const button = document.querySelector(`[data-accept="${CSS.escape(orderId)}"]`); if (button) { button.disabled = true; button.textContent = "جارٍ القبول…"; } try { const response = await fetch(ORDER_ACTION_URL,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({orderId})}); const data = await response.json().catch(()=>({})); if (!response.ok || !data.ok) throw new Error(data.error || "تعذر قبول الطلب"); const accepted = { ...(orders.find(order => order.orderId === orderId) || {}), status:"accepted", acceptedAt:new Date().toISOString() }; orders = orders.map(order => order.orderId === orderId ? accepted : order); render(); setSound(); showOrder(accepted); } catch(error) { alert(error.message || "تعذر قبول الطلب"); if (button) { button.disabled=false; button.textContent="قبول الطلب"; } } }
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
    const response = await fetch(YARMOUK_TRANSFER_URL, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ orderId, pdfBase64 }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "تعذر التحويل إلى فرع اليرموك");
    const transferred = { ...order, branchTransfer: { branch: "yarmouk", status: "sent", phone: "50203306", transferredAt: data.transferredAt || new Date().toISOString() } };
    orders = orders.map(item => item.orderId === orderId ? transferred : item); render();
  } catch (error) { alert(error.message || "تعذر التحويل إلى فرع اليرموك"); button.disabled = false; button.textContent = "تحويل إلى اليرموك"; }
}
async function cancelYarmoukTransfer(orderId, button) {
  button.disabled = true; button.textContent = "جارٍ الإلغاء…";
  try {
    const response = await fetch(YARMOUK_CANCEL_URL, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ orderId }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "تعذر إلغاء التحويل");
    orders = orders.map(item => item.orderId === orderId ? { ...item, branchTransfer: null } : item); render();
  } catch (error) { alert(error.message || "تعذر إلغاء التحويل"); button.disabled = false; button.textContent = "إلغاء التحويل"; }
}
function updateSoundButton() { const button = $("#enableSoundButton"); button.classList.toggle("active", soundEnabled); button.textContent = soundEnabled ? "جرس الطلبات مفعّل" : "تفعيل جرس الطلبات"; }
function hasPendingOrders() { return orders.some(order => order.status !== "accepted"); }
function stopOrderBell() { const audio = $("#newOrderSound"); bellRinging = false; audio.loop = false; audio.pause(); audio.currentTime = 0; }
function startOrderBell() { if (!soundEnabled || !hasPendingOrders()) return stopOrderBell(); const audio = $("#newOrderSound"); audio.loop = true; bellRinging = true; if (audio.paused || audio.ended) audio.play().catch(() => { bellRinging = false; }); }
async function enableOrderBell() { const audio = $("#newOrderSound"); try { audio.volume = 1; audio.loop = true; audio.currentTime = 0; await audio.play(); bellRinging = true; soundEnabled = true; localStorage.setItem("figsOlivesOrderBellEnabled", "1"); updateSoundButton(); if (!hasPendingOrders()) stopOrderBell(); } catch { soundEnabled = false; bellRinging = false; localStorage.removeItem("figsOlivesOrderBellEnabled"); updateSoundButton(); alert("تعذر تشغيل الجرس. تأكد من أن صوت المتصفح غير مكتوم."); } }
function setSound() { if (soundEnabled && hasPendingOrders()) startOrderBell(); else stopOrderBell(); }
$("#enableSoundButton").onclick = enableOrderBell;
updateSoundButton();
document.querySelectorAll("[data-tab]").forEach(button=>button.onclick=()=>{activeTab=button.dataset.tab; page=1; document.querySelectorAll("[data-tab]").forEach(tab=>tab.classList.toggle("active",tab===button)); render();});
document.querySelectorAll("[data-catalog]").forEach(button=>button.onclick=()=>{activeCatalog=button.dataset.catalog; page=1; document.querySelectorAll("[data-catalog]").forEach(tab=>tab.classList.toggle("active",tab===button)); render(); setSound();});
$("#pageSize").onchange=event=>{pageSize=Number(event.target.value);page=1;render();}; $("#previousPage").onclick=()=>{page--;render();}; $("#nextPage").onclick=()=>{page++;render();}; $("#closeDialog").onclick=()=>$("#orderDialog").close(); $("#orderDialog").onclick=event=>{if(event.target===$("#orderDialog")) $("#orderDialog").close();};
document.addEventListener("click",event=>{const view=event.target.closest("[data-view]"),accept=event.target.closest("[data-accept]"),print=event.target.closest("[data-print]"),transferMenu=event.target.closest("[data-transfer-menu]"),transfer=event.target.closest("[data-transfer]"),cancelTransfer=event.target.closest("[data-cancel-transfer]");if(view){const order=orders.find(item=>item.orderId===view.dataset.view);if(order)showOrder(order);}if(accept)acceptOrder(accept.dataset.accept);if(print){const order=orders.find(item=>item.orderId===print.dataset.print);if(order)printOrder(order);}if(transferMenu){const menu=transferMenu.closest(".transfer-menu");const open=menu.querySelector(".transfer-popover");document.querySelectorAll(".transfer-popover").forEach(node=>node.remove());if(!open)menu.insertAdjacentHTML("beforeend",`<div class="transfer-popover"><button class="transfer-button" data-transfer="${escapeHtml(transferMenu.dataset.transferMenu)}">تحويل إلى اليرموك</button></div>`);}else if(!transfer&&!event.target.closest(".transfer-popover"))document.querySelectorAll(".transfer-popover").forEach(node=>node.remove());if(transfer)transferToYarmouk(transfer.dataset.transfer,transfer);if(cancelTransfer)cancelYarmoukTransfer(cancelTransfer.dataset.cancelTransfer,cancelTransfer);});
if (!db) { $("#ordersBody").innerHTML='<tr class="empty-row"><td colspan="9">تعذر الاتصال بقاعدة البيانات.</td></tr>'; } else window.ORDERING_FIREBASE.auth.signInAnonymously().catch(()=>undefined).finally(()=>db.ref("orderingPlatform/onlineOrders").on("value",snapshot=>{orders=Object.values(snapshot.val()||{});render();setSound();},()=>{$("#ordersBody").innerHTML='<tr class="empty-row"><td colspan="9">تعذر قراءة الطلبات. تأكد من نشر قواعد Firebase الجديدة.</td></tr>';}));
setInterval(refreshTimers,1000); render();

// فاتورة الأونلاين الموحّدة (A4) — التصميم المعتمد من شاشة متابعة الطلبات.
// نفس الملف حرفياً في المتجر (figsandolives/order) وشاشة المتابعة (figsandolives/online-order-intake):
// أي تعديل هنا يُنسخ للمستودعين معاً.
(function () {
  const PRINT_LOGO_URL = "https://figsolives.online/logo.png";
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const money = value => `${Number(value || 0).toFixed(3)} د.ك`;
  const BRANCHES = { hawalli: "فرع حولي", yarmouk: "فرع اليرموك", abu: "فرع أبو الحصانية" };
  const branchName = id => BRANCHES[id] || "الفرع";
  const dateText = value => value ? new Date(Number(value) || value).toLocaleString("ar-KW", { dateStyle: "medium", timeStyle: "short" }) : "—";
  const clockText = value => new Intl.DateTimeFormat("ar-KW", { hour: "numeric", minute: "2-digit" }).format(value);
  const isRestaurantOrder = order => order.catalogType === "restaurant" || (order.items || []).some(item => item.catalogType === "restaurant");
  const optionSummary = option => { const name = option?.nameAr || option?.nameEn || option?.id || ""; return option?.isFilling || option?.flowStepId === "fillings" ? `${Math.max(1, Number(option.quantity) || 1)} ${name}` : name; };
  const preparationOverTwoHours = preparation => { if (!preparation) return false; const hours = (value, unit) => Math.max(1, Number(value) || 0) * (unit === "day" ? 24 : 1); return Math.max(hours(preparation.first, preparation.unit), preparation.hasSecond && Number(preparation.second) ? hours(preparation.second, preparation.secondUnit || preparation.unit) : 0) > 2; };

  // «خلال ساعتين»: نفس نافذة الساعة التي رآها العميل في صفحة الطلب.
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
  function deliveryTime(order) {
    const window = asapWindow(order);
    if (window) return `بين ${clockText(window.start)} إلى ${clockText(window.end)}`;
    // «notify»: أصناف تحضيرها أطول من ساعتين، والعميل طلب إبلاغه بالواتساب.
    if (!order.scheduledAt && order.deliveryTiming === "notify") return "أرجو إبلاغي عن طريق الواتساب بتاريخ ووقت التوصيل المستغرق للتحضير ..";
    if (!order.scheduledAt) return order.deliveryTiming === "asap" ? "أقرب وقت متاح" : "إبلاغ العميل عند الجاهزية";
    const end = new Date(order.scheduledAt), start = new Date(end.getTime() - 3600000);
    const date = new Intl.DateTimeFormat("ar-KW", { weekday: "long", day: "numeric", month: "long" }).format(end);
    return `${date}<br>بين ${clockText(start)} إلى ${clockText(end)}`;
  }
  const preparationNotice = order => (order.items || []).some(item => preparationOverTwoHours(item.preparation) || (item.options || []).some(option => preparationOverTwoHours(option.preparation)))
    ? `<p class="inv-notice">ملاحظة: يوجد في طلبك أصناف تأخذ وقت للتجهيز.. لذا يرجى العلم أنه قد يتأخر طلبك أو يتم تأجيله.</p>` : "";
  // الأسئلة الاحترازية: العميل أفصح (مثلاً عن السيلياك) وتابع الدفع بعد التنبيه، فيطبع إقراره تحت المنتجات.
  const precautionNotes = order => (Array.isArray(order.precautions) ? order.precautions : []).filter(entry => entry && entry.invoiceNote)
    .map(entry => `<p class="inv-declaration">${escapeHtml(entry.invoiceNote)}</p>`).join("");
  // خصم السلة المتروكة ليس كوبوناً: يظهر باسمه «خصم السلة ١٠٪» بدل رمز عشوائي.
  const discountLabel = order => order.coupon?.cartOffer ? escapeHtml(order.coupon.labelAr || "خصم السلة") : `خصم الكوبون ${escapeHtml(order.coupon?.code || "")}`;

  // نفس ترتيب صفحة الدفع الأخيرة: الإجمالي، الخصم بالأحمر، رسوم التوصيل، ثم الإجمالي النهائي وفوقه المبلغ قبل الخصم مشطوباً.
  function totals(order) {
    const delivery = Number(order.deliveryFee || 0);
    const products = Number.isFinite(Number(order.subtotal)) ? Number(order.subtotal) : Number(order.total || 0) - delivery + Number(order.discount || 0);
    const discount = order.coupon ? Number(order.discount || 0) : 0;
    const rows = [`<div><span>الإجمالي</span><b>${money(products)}</b></div>`];
    if (discount > 0) rows.push(`<div class="b-discount"><span><bdi>${discountLabel(order)}</bdi></span><b>-${money(discount)}</b></div>`);
    if (order.mode !== "pickup" || delivery > 0) rows.push(`<div><span>رسوم التوصيل</span><b>${money(delivery)}</b></div>`);
    const before = discount > 0 ? `<s class="b-before">${money(products + delivery)}</s>` : "";
    rows.push(`<div class="b-grand"><span>الإجمالي النهائي</span><b>${before}<em>${money(order.total)}</em></b></div>`);
    return `<div class="b-totals">${rows.join("")}</div>`;
  }

  function itemRow(item, productImage) {
    const image = productImage(item.id) || "";
    const photo = image ? `<img src="${escapeHtml(image)}" alt="" crossorigin="anonymous" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'inv-photo-empty'}))">` : `<span class="inv-photo-empty"></span>`;
    const options = escapeHtml((item.options || []).map(optionSummary).filter(Boolean).join("، "));
    const note = escapeHtml(item.note || "");
    return `<tr><td class="b-photo">${photo}</td><td class="b-name"><b>${escapeHtml(item.name || item.nameAr || item.id)}</b><small dir="ltr">${escapeHtml(item.nameEn || item.name || item.id)}</small>${options ? `<em>${options}</em>` : ""}</td><td class="b-note">${note ? `<span>${note}</span>` : ""}</td><td class="b-qty"><span>${Number(item.quantity) || 0}</span></td><td class="b-money">${money(item.unitPrice)}</td><td class="b-money b-total">${money(item.total || item.unitPrice * item.quantity)}</td></tr>`;
  }

  // options.productImage(id) يعيد رابط صورة المنتج (https) أو فارغاً.
  function html(order, options = {}) {
    const productImage = options.productImage || (() => "");
    const pickup = order.mode === "pickup";
    const restaurant = isRestaurantOrder(order);
    const method = ({ knet: "KNET", applepay: "Apple Pay" })[String(order.paymentMethod || "knet").toLowerCase()] || String(order.paymentMethod).toUpperCase();
    const brandAr = restaurant ? "مطعم التين الطبيعي" : "مخبز التين والزيتون";
    const brandEn = restaurant ? "Natural Figs Restaurant" : "Figs &amp; Olives Bakery";
    const place = escapeHtml(pickup ? branchName(order.branchId) : (order.areaName || "—"));
    const address = pickup ? "" : escapeHtml(order.address || "");
    // هوامش الصفحة داخل الفاتورة: صف فارغ يتكرر أعلى وأسفل كل صفحة مطبوعة،
    // فلا تلامس حافة الورق حتى لو اختيرت هوامش «بلا» في نافذة الطباعة.
    return `<table class="inv-page"><thead><tr><td class="inv-space"></td></tr></thead><tfoot><tr><td class="inv-space"></td></tr></tfoot><tbody><tr><td>
  <article class="inv inv-b">
    <header class="b-head"><div class="b-brand"><img src="${PRINT_LOGO_URL}" alt="" crossorigin="anonymous"><div><strong>${brandAr}</strong><small>${brandEn}</small></div></div><div class="b-no"><small>فاتورة شراء</small><strong dir="ltr">${escapeHtml(order.orderId)}</strong><span>${dateText(order.createdAt)}</span></div></header>
    <section class="b-info">
      <div><label>العميل</label><b>${escapeHtml(order.customerName || "—")}</b><span dir="ltr">${escapeHtml(order.phone || "")}</span></div>
      <div><label>${pickup ? "الاستلام من" : "التوصيل إلى"}</label><b>${place}</b><span>${address}</span></div>
      <div class="b-time${!order.scheduledAt && order.deliveryTiming === "notify" ? " is-long" : ""}"><label>${pickup ? "وقت الاستلام" : "وقت التوصيل"}</label><b>${deliveryTime(order)}</b></div>
    </section>
    <table class="b-items"><colgroup><col style="width:16mm"><col><col style="width:34mm"><col style="width:13mm"><col style="width:20mm"><col style="width:21mm"></colgroup>
      <thead><tr><th colspan="2">المنتج</th><th>الملاحظات</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr></thead>
      <tbody>${(order.items || []).map(item => itemRow(item, productImage)).join("")}</tbody></table>
    ${preparationNotice(order)}
    ${precautionNotes(order)}
    <section class="b-foot"><div class="b-stamp"><strong>مدفوع</strong><span>PAID · ${escapeHtml(method)}</span></div>${totals(order)}</section>
    <footer class="b-contact">حولي، شارع تونس، مجمع علي فهد الخالد، دور الميزانين · <span dir="ltr">66906605 · 22085888</span></footer>
  </article></td></tr></tbody></table>`;
  }

  // ينتظر الشعار وصور المنتجات حتى لا تنقص من الصفحة.
  function imagesReady(root, timeout = 2500) {
    const images = [...root.querySelectorAll("img")].map(image => image.complete ? Promise.resolve() : new Promise(resolve => { image.addEventListener("load", resolve, { once: true }); image.addEventListener("error", resolve, { once: true }); }));
    return Promise.race([Promise.all(images), new Promise(resolve => setTimeout(resolve, timeout))]);
  }

  // ملف PDF بنفس الفاتورة (للتحميل والإرسال).
  async function pdf(order, options = {}) {
    if (!window.html2canvas || !window.jspdf?.jsPDF) throw new Error("تعذر تجهيز ملف PDF في المتصفح");
    const node = document.createElement("div");
    node.className = "print-sheet pdf-export";
    node.innerHTML = html(order, options);
    document.body.append(node);
    try {
      await document.fonts?.ready;
      await imagesReady(node);
      const canvas = await window.html2canvas(node.querySelector(".inv"), { scale: 2, backgroundColor: "#fff", useCORS: true, logging: false });
      const doc = new window.jspdf.jsPDF("p", "mm", "a4");
      const width = 190, printableHeight = 277, imageHeight = canvas.height * width / canvas.width;
      const image = canvas.toDataURL("image/jpeg", .94);
      let remaining = imageHeight;
      doc.addImage(image, "JPEG", 10, 10, width, imageHeight, undefined, "FAST");
      remaining -= printableHeight;
      while (remaining > .5) { doc.addPage(); doc.addImage(image, "JPEG", 10, -(imageHeight - remaining), width, imageHeight, undefined, "FAST"); remaining -= printableHeight; }
      return doc;
    } finally { node.remove(); }
  }

  async function print(order, options = {}) {
    document.querySelector(".print-sheet")?.remove();
    const sheet = document.createElement("div");
    sheet.className = "print-sheet";
    sheet.innerHTML = html(order, options);
    document.body.append(sheet);
    await imagesReady(sheet);
    window.print();
    sheet.remove();
  }

  window.OnlineInvoice = { html, pdf, print, imagesReady, discountLabel, money };
})();

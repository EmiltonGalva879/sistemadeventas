const { jsPDF } = window.jspdf;

const DB = {
  get(key) { return JSON.parse(localStorage.getItem('salesstock_' + key) || '[]'); },
  set(key, data) { localStorage.setItem('salesstock_' + key, JSON.stringify(data)); },
  init() {
    if (!localStorage.getItem('salesstock_initialized')) {
      this.set('users', [{ id: 1, username: 'admin', password: 'admin123', role: 'ADMIN', created: new Date().toISOString() }]);
      this.set('products', [
        { id: 1, name: 'Taladro Inalámbrico', price: 89.99, stock: 15, minStock: 5, barcode: 'S1700000001', created: new Date().toISOString() },
        { id: 2, name: 'Destornillador Phillips', price: 12.50, stock: 50, minStock: 10, barcode: 'S1700000002', created: new Date().toISOString() },
        { id: 3, name: 'Sierra Circular', price: 145.00, stock: 3, minStock: 5, barcode: 'S1700000003', created: new Date().toISOString() },
        { id: 4, name: 'Martillo de Guerra', price: 25.00, stock: 20, minStock: 8, barcode: 'S1700000004', created: new Date().toISOString() },
        { id: 5, name: 'Alicate Universal', price: 18.75, stock: 8, minStock: 10, barcode: 'S1700000005', created: new Date().toISOString() }
      ]);
      this.set('sales', []);
      localStorage.setItem('salesstock_initialized', 'true');
    }
  }
};
DB.init();

let state = {
  page: 'login',
  user: null,
  cart: [],
  search: '',
  modal: null,
  alertDismissed: false,
  testResult: '',
  loginError: ''
};

function login(username, password) {
  const users = DB.get('users');
  const user = users.find(u => u.username === username && u.password === password);
  if (user) { state.user = user; state.page = 'sales'; state.loginError = ''; render(); return true; }
  state.loginError = 'Usuario o contraseña incorrecta';
  return false;
}

function logout() { state.user = null; state.cart = []; state.page = 'login'; state.loginError = ''; render(); }

function getProducts() {
  const products = DB.get('products');
  if (!state.search) return products;
  return products.filter(p => p.name.toLowerCase().includes(state.search.toLowerCase()) || p.barcode.includes(state.search));
}

function getLowStock() {
  return DB.get('products').filter(p => p.stock <= p.minStock);
}

function saveProduct(product) {
  const products = DB.get('products');
  if (product.id) {
    const idx = products.findIndex(p => p.id === product.id);
    if (idx >= 0) products[idx] = { ...products[idx], ...product };
  } else {
    product.id = Date.now();
    product.barcode = product.barcode || 'S' + Date.now().toString().slice(-10);
    products.push(product);
  }
  DB.set('products', products);
}

function saveQuickProduct(name, price, stock, minStock, barcode) {
  const products = DB.get('products');
  const newProduct = {
    id: Date.now(),
    name: name,
    price: parseFloat(price),
    stock: parseInt(stock) || 0,
    minStock: parseInt(minStock) || 5,
    barcode: barcode,
    created: new Date().toISOString()
  };
  products.push(newProduct);
  DB.set('products', products);
  state.modal = null;
  render();
  alert('Producto agregado: ' + name);
}

function deleteProduct(id) {
  const products = DB.get('products').filter(p => p.id !== id);
  DB.set('products', products);
}

function getSales() { return DB.get('sales'); }
function getTodaySales() {
  const today = new Date().toISOString().split('T')[0];
  return getSales().filter(s => s.created.startsWith(today));
}

function promptDeleteSale(id) {
  const pw = prompt('Ingrese password de administrador:');
  if (pw !== 'admin123') { alert('Password incorrecta'); return; }
  deleteSale(id);
}

function deleteSale(id) {
  const sales = getSales();
  const sale = sales.find(s => s.id === id);
  if (!sale) return;
  if (!confirm('¿Eliminar venta #' + id + '?')) return;
  const products = DB.get('products');
  sale.items.forEach(item => {
    const p = products.find(prod => prod.id === item.id);
    if (p) p.stock += item.quantity;
  });
  DB.set('products', products);
  DB.set('sales', sales.filter(s => s.id !== id));
  alert('Venta eliminada');
  render();
}

function addToCart(product) {
  const existing = state.cart.find(item => item.id === product.id);
  if (existing) {
    if (existing.quantity < product.stock) existing.quantity++;
  } else {
    state.cart.push({ ...product, quantity: 1 });
  }
}

function updateCartQty(id, qty) {
  const item = state.cart.find(i => i.id === id);
  if (item && qty > 0) {
    const product = DB.get('products').find(p => p.id === id);
    item.quantity = Math.min(qty, product.stock);
  } else if (item && qty <= 0) {
    state.cart = state.cart.filter(i => i.id !== id);
  }
  render();
}

function removeFromCart(id) {
  state.cart = state.cart.filter(i => i.id !== id);
}

function getCartTotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function cancelCart() {
  if (state.cart.length === 0) return;
  if (!confirm('¿Cancelar todo el carrito?')) return;
  state.cart = [];
  render();
}

function showPaymentOptions(mode) {
  const total = getCartTotal();
  state.modal = {
    type: 'payment',
    total: total,
    paymentMode: mode || 'sale'
  };
  render();
}

let printWindow = null;

function submitSale(paymentType) {
  const customerName = document.getElementById('customer-name')?.value || '';
  const customerPhone = document.getElementById('customer-phone')?.value || '';
  const notes = document.getElementById('sale-notes')?.value || '';
  state.modal = null;
  printWindow = window.open('', '_blank', 'width=800,height=600');
  completeSale(paymentType, { customerName, customerPhone, notes });
}

function submitQuote() {
  const customerName = document.getElementById('customer-name')?.value || '';
  const customerPhone = document.getElementById('customer-phone')?.value || '';
  const notes = document.getElementById('sale-notes')?.value || '';
  state.modal = null;
  printWindow = window.open('', '_blank', 'width=800,height=600');
  makeQuote({ customerName, customerPhone, notes });
}

function completeSale(paymentType, customerData) {
  if (state.cart.length === 0) return;
  const modoPago = paymentType || 'contado';
  const isCredit = modoPago === 'credito';
  const total = getCartTotal();
  const interest = isCredit ? total * 0.05 : 0;
  const finalTotal = total + interest;
  
  const sale = {
    id: Date.now(),
    items: state.cart.map(i => ({ id: i.id, name: i.name, barcode: i.barcode, quantity: i.quantity, price: i.price, subtotal: i.price * i.quantity })),
    total: finalTotal,
    subtotal: total,
    interest: interest,
    paymentType: modoPago,
    user: state.user.username,
    customerName: customerData.customerName || '',
    customerPhone: customerData.customerPhone || '',
    notes: customerData.notes || '',
    created: new Date().toISOString()
  };
  const products = DB.get('products');
  state.cart.forEach(item => {
    const product = products.find(p => p.id === item.id);
    if (product) product.stock -= item.quantity;
  });
  DB.set('products', products);
  DB.set('sales', [...getSales(), sale]);
  generateInvoice(sale);
  
  // Open cash drawer if enabled (only for contado)
  if (!isCredit && localStorage.getItem('salesstock_cashdrawer') === 'yes') {
    openCashDrawer();
  }
  
  state.cart = [];
  state.modal = null;
  render();
}

let html5QrCode = null;

function startCameraScan() {
  state.modal = { type: 'camera' };
  render();
  setTimeout(() => {
    html5QrCode = new Html5Qrcode("camera-reader");
    const config = { fps: 10, qrbox: 250 };
    html5QrCode.start(
      { facingMode: "environment" },
      config,
      (decodedText, decodedResult) => {
        html5QrCode.stop();
        state.modal = null;
        scanProductBarcode(decodedText);
      },
      (errorMessage) => {}
    );
  }, 500);
}

function stopCameraScan() {
  if (html5QrCode) {
    html5QrCode.stop();
    html5QrCode = null;
  }
  state.modal = null;
}

function makeQuote(customerData) {
  if (state.cart.length === 0) return;
  const quote = {
    id: 'COT-' + Date.now(),
    items: state.cart.map(i => ({ id: i.id, name: i.name, barcode: i.barcode, quantity: i.quantity, price: i.price, subtotal: i.price * i.quantity })),
    total: getCartTotal(),
    user: state.user.username,
    customerName: customerData.customerName || '',
    customerPhone: customerData.customerPhone || '',
    notes: customerData.notes || '',
    created: new Date().toISOString()
  };
  generateQuoteInvoice(quote);
  state.cart = [];
  render();
  alert('Cotización generada: ' + quote.id);
}

function openCashDrawer() {
  // Try to open cash drawer via USB
  // ESC/POS command: ESC p 0 25 250 (some drawers respond to this)
  // Since we can't send raw USB, we use a workaround with printer
  const drawerEnabled = localStorage.getItem('salesstock_cashdrawer');
  if (drawerEnabled === 'yes') {
    try {
      // Create a minimal print job to trigger cash drawer
      // Many ESC/POS printers with cash drawer port respond to this
      const cmd = '\x1b' + 'p' + '\x00' + '\x19' + '\x96';
      // Try using ActiveX for older browsers or direct print
      const printWindow = window.open('', '', 'width=1,height=1');
      if (printWindow) {
        printWindow.document.write('<script>window.close()</script>');
        printWindow.document.close();
        printWindow.close();
      }
    } catch(e) {
      console.log('Cash drawer: cannot trigger');
    }
  }
}

function getUsers() { return DB.get('users'); }
function saveUser(user) {
  const users = DB.get('users');
  if (user.id) {
    const idx = users.findIndex(u => u.id === user.id);
    if (idx >= 0) users[idx] = { ...users[idx], ...user };
  } else {
    user.id = Date.now();
    users.push(user);
  }
  DB.set('users', users);
}
function deleteUser(id) {
  DB.set('users', getUsers().filter(u => u.id !== id));
}

function testScanner() {
  state.testResult = '<div style="color:#f59e0b">⏳ Escanee un código con el lector... (10 segundos)</div>';
  render();
  let scanned = false;
  const timeout = setTimeout(() => {
    if (!scanned) {
      state.testResult = '<div style="color:#ef4444">❌ Lector no detectado. Verifique que esté conectado como teclado USB</div>';
      render();
    }
  }, 10000);
  const handler = (e) => {
    clearTimeout(timeout);
    scanned = true;
    const code = e.key;
    document.removeEventListener('keydown', handler);
    if (code && code.length > 0) {
      state.testResult = '<div style="color:#10b981">✅ Lector conectado: código "' + code + '"</div>';
    } else {
      state.testResult = '<div style="color:#ef4444">❌ Sin lectura. Verifique conexión</div>';
    }
    render();
  };
  document.addEventListener('keydown', handler);
}

function testPrinter() {
  try {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(localStorage.getItem('salesstock_bizname') || 'SalesStock Pro', 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.text('TEST DE IMPRESORA', 105, 35, { align: 'center' });
    doc.text('Fecha: ' + new Date().toLocaleString('es-ES'), 105, 45, { align: 'center' });
    doc.text('Si ve esta factura, la impresora está', 105, 60, { align: 'center' });
    doc.text('correctamente conectada.', 105, 70, { align: 'center' });
    doc.save('test-impresora.pdf');
    state.testResult = '<div style="color:#10b981">✅ Impresora lista. Descargando prueba PDF...</div>';
  } catch (e) {
    state.testResult = '<div style="color:#ef4444">❌ Error: ' + e.message + '</div>';
  }
  render();
}

function testCashDrawer() {
  state.testResult = '<div style="color:#f59e0b">⏳ Intentando abrir cajón...</div>';
  render();
  openCashDrawer();
  setTimeout(() => {
    state.testResult = '<div style="color:#10b981">✅ Señal enviada. Si el cajón no se abrió, verifique la conexión USB del cajón a la impresora.</div>';
    render();
  }, 1000);
}

function getStats() {
  const products = DB.get('products');
  const today = getTodaySales();
  return {
    totalProducts: products.length,
    lowStock: products.filter(p => p.stock <= p.minStock).length,
    totalUsers: getUsers().length,
    todaySales: today.reduce((s, s2) => s + s2.total, 0)
  };
}

const fmtMoney = (v) => '$' + v.toFixed(2);
const fmtDate = (d) => new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const PAGE_W = 80;
const MARGIN_X = 8;
const INNER_W = PAGE_W - MARGIN_X * 2;
const FONT = 'helvetica';
const LINE_COLOR = [180, 180, 180];
let pdfY = 8;
function abbreviateText(doc, text, maxWidth) {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && doc.getTextWidth(t + '...') > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + '...';
}
function pdfLine(doc, x, w, y) {
  doc.setDrawColor(...LINE_COLOR);
  doc.setLineWidth(0.4);
  doc.line(x, y, x + w, y);
}
function pdfTitle(doc, text, y) {
  doc.setFont(FONT, 'bold');
  doc.setFontSize(13);
  doc.text(text, PAGE_W / 2, y, { align: 'center' });
  return y + 5;
}
function pdfField(doc, label, value, y) {
  doc.setFont(FONT, 'bold');
  doc.setFontSize(9);
  doc.text(label, MARGIN_X, y, { align: 'left' });
  doc.setFont(FONT, 'normal');
  doc.text(value, MARGIN_X + INNER_W * 0.35, y, { align: 'left' });
  return y + 5;
}
function pdfCalcInvoiceHeight(sale) {
  const bizName = localStorage.getItem('salesstock_bizname') || '';
  const bizRnc = localStorage.getItem('salesstock_bizrnc') || '';
  const bizPhone = localStorage.getItem('salesstock_bizphone') || '';
  const bizAddr = localStorage.getItem('salesstock_bizaddress') || '';
  const tmp = new jsPDF({ unit: 'mm', format: [80, 1000] });
  let h = 10;
  h += 8;
  if (bizName) h += 4;
  [bizRnc, bizPhone].forEach(v => { if (v) h += 4; });
  if (bizAddr) {
    const lines = tmp.splitTextToSize(bizAddr, INNER_W);
    h += lines.length * 3.5;
  }
  h += 4 + 16 + 4;
  if (sale.customerName) h += 5;
  if (sale.customerPhone) h += 5;
  if (sale.notes) {
    const lines = tmp.splitTextToSize(sale.notes, INNER_W);
    h += lines.length * 3.5 + 4;
  }
  h += 4 + 16 + 4;
  sale.items.forEach(() => {
    h += 7 + 2;
  });
  h += 4 + 16 + 4;
  return h;
}

function generateQuoteInvoice(quote) {
  const doc = new jsPDF({ unit: 'mm', format: [PAGE_W, pdfCalcInvoiceHeight(quote)] });
  let y = MARGIN_X;
  const bizName = localStorage.getItem('salesstock_bizname') || 'SALESSTOCK PRO';
  const bizRnc = localStorage.getItem('salesstock_bizrnc') || '';
  const bizPhone = localStorage.getItem('salesstock_bizphone') || '';
  const bizAddr = localStorage.getItem('salesstock_bizaddress') || '';

  doc.setFont(FONT, 'bold');
  doc.setFontSize(15);
  doc.text(bizName, PAGE_W / 2, y, { align: 'center' });
  y += 5;
  doc.setFont(FONT, 'normal');
  doc.setFontSize(9);
  if (bizRnc) { doc.text('RNC: ' + bizRnc, PAGE_W / 2, y, { align: 'center' }); y += 4; }
  if (bizPhone) { doc.text('Tel: ' + bizPhone, PAGE_W / 2, y, { align: 'center' }); y += 4; }
  if (bizAddr) {
    const lines = doc.splitTextToSize(bizAddr, INNER_W);
    doc.text(lines, PAGE_W / 2, y, { align: 'center' });
    y += lines.length * 3.5;
  }
  y += 2;
  pdfLine(doc, MARGIN_X, INNER_W, y);
  y += 4;

  y = pdfTitle(doc, 'COTIZACIÓN', y);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(9);
  doc.text('N° ' + quote.id, PAGE_W / 2, y, { align: 'center' });
  y += 4;
  doc.text('Fecha: ' + new Date(quote.created).toLocaleDateString('es-ES'), PAGE_W / 2, y, { align: 'center' });
  y += 4;
  doc.text('Vendedor: ' + quote.user, PAGE_W / 2, y, { align: 'center' });
  y += 4;
  pdfLine(doc, MARGIN_X, INNER_W, y);
  y += 4;

  if (quote.customerName || quote.customerPhone) {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(9);
    doc.text('CLIENTE', MARGIN_X, y, { align: 'left' });
    y += 4;
    doc.setFont(FONT, 'normal');
    if (quote.customerName) y = pdfField(doc, 'Nombre:', quote.customerName, y);
    if (quote.customerPhone) y = pdfField(doc, 'Teléfono:', quote.customerPhone, y);
    y += 1;
    pdfLine(doc, MARGIN_X, INNER_W, y);
    y += 4;
  }

  if (quote.notes) {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(9);
    doc.text('NOTAS', MARGIN_X, y, { align: 'left' });
    y += 4;
    doc.setFont(FONT, 'normal');
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(quote.notes, INNER_W);
    doc.text(lines, MARGIN_X, y, { align: 'left' });
    y += lines.length * 3.5 + 2;
    doc.setFontSize(9);
    pdfLine(doc, MARGIN_X, INNER_W, y);
    y += 4;
  }

  doc.setFont(FONT, 'bold');
  doc.setFontSize(9);
  const colQty = MARGIN_X;
  const colDescStart = MARGIN_X + 10;
  const colUnit = MARGIN_X + INNER_W - 18;
  const colTotal = MARGIN_X + INNER_W;
  doc.text('CANT', colQty, y, { align: 'left' });
  doc.text('DESCRIPCIÓN', colDescStart, y, { align: 'left' });
  doc.text('P.U.', colUnit, y, { align: 'right' });
  doc.text('TOTAL', colTotal, y, { align: 'right' });
  y += 2;
  pdfLine(doc, MARGIN_X, INNER_W, y);
  y += 3;

  doc.setFont(FONT, 'normal');
  doc.setFontSize(8);
  quote.items.forEach(item => {
    const name = abbreviateText(doc, item.name, INNER_W - 22);
    const lineH = 7;
    const pu = '$' + item.price.toFixed(2);
    const tot = '$' + item.subtotal.toFixed(2);
    doc.text(String(item.quantity), colQty, y + 1.2, { align: 'left' });
    doc.text(name, colDescStart, y + 1.2, { align: 'left' });
    doc.text(pu, colUnit, y + 1.2, { align: 'right' });
    doc.text(tot, colTotal, y + 1.2, { align: 'right' });
    y += lineH + 2;
  });

  y += 1;
  pdfLine(doc, MARGIN_X, INNER_W, y);
  y += 4;

  doc.setFont(FONT, 'bold');
  doc.setFontSize(11);
  doc.text('TOTAL: ' + fmtMoney(quote.total), colTotal, y, { align: 'right' });
  y += 5;

  doc.setFont(FONT, 'normal');
  doc.setFontSize(8);
  doc.text('No es venta - Validez: 7 días', PAGE_W / 2, y, { align: 'center' });
  y += 4;
  doc.text('Gracias por su preferencia', PAGE_W / 2, y, { align: 'center' });

  doc.save('cotizacion-' + quote.id + '.pdf');
  if (printWindow && !printWindow.closed) {
    try {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      printWindow.location.href = url;
      setTimeout(() => {
        try { printWindow.focus(); printWindow.print(); } catch (e) {}
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, 300);
    } catch (e) {
      setTimeout(() => window.print(), 300);
    }
  } else {
    setTimeout(() => window.print(), 300);
  }
}

function generateInvoice(sale) {
  const doc = new jsPDF({ unit: 'mm', format: [PAGE_W, pdfCalcInvoiceHeight(sale)] });
  let y = MARGIN_X;
  const bizName = localStorage.getItem('salesstock_bizname') || 'SALESSTOCK PRO';
  const bizRnc = localStorage.getItem('salesstock_bizrnc') || '';
  const bizPhone = localStorage.getItem('salesstock_bizphone') || '';
  const bizAddr = localStorage.getItem('salesstock_bizaddress') || '';

  doc.setFont(FONT, 'bold');
  doc.setFontSize(15);
  doc.text(bizName, PAGE_W / 2, y, { align: 'center' });
  y += 5;
  doc.setFont(FONT, 'normal');
  doc.setFontSize(9);
  if (bizRnc) { doc.text('RNC: ' + bizRnc, PAGE_W / 2, y, { align: 'center' }); y += 4; }
  if (bizPhone) { doc.text('Tel: ' + bizPhone, PAGE_W / 2, y, { align: 'center' }); y += 4; }
  if (bizAddr) {
    const lines = doc.splitTextToSize(bizAddr, INNER_W);
    doc.text(lines, PAGE_W / 2, y, { align: 'center' });
    y += lines.length * 3.5;
  }
  y += 2;
  pdfLine(doc, MARGIN_X, INNER_W, y);
  y += 4;

  y = pdfTitle(doc, 'FACTURA', y);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(9);
  doc.text('N° ' + sale.id, PAGE_W / 2, y, { align: 'center' });
  y += 4;
  doc.text('Fecha: ' + new Date(sale.created).toLocaleDateString('es-ES') + ' ' + new Date(sale.created).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }), PAGE_W / 2, y, { align: 'center' });
  y += 4;
  doc.text('Cajero: ' + sale.user, PAGE_W / 2, y, { align: 'center' });
  y += 4;
  pdfLine(doc, MARGIN_X, INNER_W, y);
  y += 4;

  if (sale.customerName || sale.customerPhone) {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(9);
    doc.text('CLIENTE', MARGIN_X, y, { align: 'left' });
    y += 4;
    doc.setFont(FONT, 'normal');
    if (sale.customerName) y = pdfField(doc, 'Nombre:', sale.customerName, y);
    if (sale.customerPhone) y = pdfField(doc, 'Teléfono:', sale.customerPhone, y);
    y += 1;
    pdfLine(doc, MARGIN_X, INNER_W, y);
    y += 4;
  }

  if (sale.notes) {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(9);
    doc.text('NOTAS', MARGIN_X, y, { align: 'left' });
    y += 4;
    doc.setFont(FONT, 'normal');
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(sale.notes, INNER_W);
    doc.text(lines, MARGIN_X, y, { align: 'left' });
    y += lines.length * 3.5 + 2;
    doc.setFontSize(9);
    pdfLine(doc, MARGIN_X, INNER_W, y);
    y += 4;
  }

  doc.setFont(FONT, 'bold');
  doc.setFontSize(9);
  const colQty = MARGIN_X;
  const colDescStart = MARGIN_X + 10;
  const colUnit = MARGIN_X + INNER_W - 18;
  const colTotal = MARGIN_X + INNER_W;
  doc.text('CANT', colQty, y, { align: 'left' });
  doc.text('DESCRIPCIÓN', colDescStart, y, { align: 'left' });
  doc.text('P.U.', colUnit, y, { align: 'right' });
  doc.text('TOTAL', colTotal, y, { align: 'right' });
  y += 2;
  pdfLine(doc, MARGIN_X, INNER_W, y);
  y += 3;

  doc.setFont(FONT, 'normal');
  doc.setFontSize(8);
  sale.items.forEach(item => {
    const name = abbreviateText(doc, item.name, INNER_W - 22);
    const lineH = 7;
    const pu = '$' + item.price.toFixed(2);
    const tot = '$' + item.subtotal.toFixed(2);
    doc.text(String(item.quantity), colQty, y + 1.2, { align: 'left' });
    doc.text(name, colDescStart, y + 1.2, { align: 'left' });
    doc.text(pu, colUnit, y + 1.2, { align: 'right' });
    doc.text(tot, colTotal, y + 1.2, { align: 'right' });
    y += lineH + 2;
  });

  y += 1;
  pdfLine(doc, MARGIN_X, INNER_W, y);
  y += 4;

  doc.setFont(FONT, 'bold');
  doc.setFontSize(11);
  doc.text('TOTAL: ' + fmtMoney(sale.total), colTotal, y, { align: 'right' });
  y += 5;

  doc.setFont(FONT, 'normal');
  doc.setFontSize(8);
  if (sale.paymentType === 'credito') {
    doc.text('*** PAGO A CRÉDITO ***', PAGE_W / 2, y, { align: 'center' });
    y += 4;
    doc.text('Se cobrará 5% extra en 30 días', PAGE_W / 2, y, { align: 'center' });
  } else {
    doc.text('¡GRACIAS POR SU COMPRA!', PAGE_W / 2, y, { align: 'center' });
  }
  y += 4;
  pdfLine(doc, MARGIN_X, INNER_W, y);
  y += 3;
  doc.text('Documento generado por SalesStock Pro', PAGE_W / 2, y, { align: 'center' });

  doc.save('venta-' + sale.id + '.pdf');
  if (printWindow && !printWindow.closed) {
    try {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      printWindow.location.href = url;
      setTimeout(() => {
        try { printWindow.focus(); printWindow.print(); } catch (e) {}
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, 300);
    } catch (e) {
      setTimeout(() => window.print(), 300);
    }
  } else {
    setTimeout(() => window.print(), 300);
  }
}


function render() {
  const app = document.getElementById('app');
  if (!state.user) {
    app.innerHTML = renderLogin();
    return;
  }
  const lowStock = getLowStock();
  const showAlert = lowStock.length > 0 && !state.alertDismissed;
  app.innerHTML = `
    <div class="app">
      <div class="sidebar">
        <div class="logo">${(localStorage.getItem('salesstock_bizname') || 'SalesStock').split(' ')[0]}<span>Pro</span></div>
        <nav class="nav">
          <div class="nav-link ${state.page === 'sales' ? 'active' : ''}" onclick="state.page='sales';state.testResult='';render()">💰 Punto de Venta</div>
          <div class="nav-link ${state.page === 'products' ? 'active' : ''}" onclick="state.page='products';state.testResult='';render()">📦 Productos</div>
          <div class="nav-link ${state.page === 'reports' ? 'active' : ''}" onclick="state.page='reports';state.testResult='';render()">📈 Reportes</div>
          <div class="nav-link ${state.page === 'dashboard' ? 'active' : ''}" onclick="state.page='dashboard';state.testResult='';render()">📊 Dashboard</div>
          ${state.user.role === 'ADMIN' ? `<div class="nav-link ${state.page === 'users' ? 'active' : ''}" onclick="state.page='users';state.testResult='';render()">👥 Usuarios</div>` : ''}
        </nav>
        <div class="user-info">
          <div class="avatar">${state.user.username[0].toUpperCase()}</div>
          <div class="user-details">
            <div class="user-name">${state.user.username}</div>
            <div class="user-role">${state.user.role === 'ADMIN' ? 'Administrador' : 'Usuario'}</div>
          </div>
        </div>
        <button class="btn btn-secondary" style="width:100%;margin-top:12px" onclick="logout()">Cerrar Sesión</button>
      </div>
      <main class="main ${showAlert ? 'main-with-alert' : ''}">
        ${renderPage()}
      </main>
    </div>
    ${showAlert ? renderLowStockAlert(lowStock) : ''}
    ${state.modal ? renderModal() : ''}
  `;
}

function renderLowStockAlert(lowStock) {
  const items = lowStock.map(p => `${p.name}`).join(', ');
  return `
    <div class="alert-container" onclick="this.style.display='none'">
      <div class="alert-box" onclick="event.stopPropagation();state.page='products';state.search='';render()">
        <div class="alert-icon">⚠️</div>
        <div class="alert-content">
          <div class="alert-title">⚡ ALERTA: Stock Bajo</div>
          <div class="alert-subtitle">${items}</div>
        </div>
        <button class="alert-close" onclick="state.alertDismissed=true;render()">✕</button>
      </div>
    </div>
  `;
}

function renderLogin() {
  return `
    <div class="login-container">
      <div class="login-card">
        <div class="login-logo">
          <h1>${(localStorage.getItem('salesstock_bizname') || 'SalesStock').split(' ')[0]}<span>Pro</span></h1>
          <p>Sistema de Gestión de Ventas e Inventario</p>
        </div>
        <form onsubmit="event.preventDefault();if(login(this.u.value,this.p.value))render()">
          ${state.loginError ? '<div style="background:#fee2e2;color:#dc2626;padding:12px;border-radius:8px;margin-bottom:15px;text-align:center;font-weight:600">' + state.loginError + '</div>' : ''}
          <div class="form-group">
            <label>Usuario</label>
            <input class="form-control" name="u" placeholder="Usuario" required>
          </div>
          <div class="form-group">
            <label>Contraseña</label>
            <input type="password" class="form-control" name="p" placeholder="Contraseña" required>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%">Iniciar Sesión</button>
        </form>
      </div>
    </div>
  `;
}

function renderPage() {
  switch (state.page) {
    case 'dashboard': return renderDashboard();
    case 'products': return renderProducts();
    case 'sales': return renderSales();
    case 'users': return renderUsers();
    case 'reports': return renderReports();
    default: return renderDashboard();
  }
}

function renderDashboard() {
  const stats = getStats();
  const recent = getSales().slice(-10).reverse();
  return `
    <div class="header"><h1>Dashboard</h1></div>
    <div class="stats">
      <div class="stat"><div class="stat-icon blue">📦</div><div class="stat-info"><h3>Total Productos</h3><div class="stat-value">${stats.totalProducts}</div></div></div>
      <div class="stat"><div class="stat-icon green">💰</div><div class="stat-info"><h3>Ventas de Hoy</h3><div class="stat-value">${fmtMoney(stats.todaySales)}</div></div></div>
      <div class="stat"><div class="stat-icon purple">👥</div><div class="stat-info"><h3>Total Usuarios</h3><div class="stat-value">${stats.totalUsers}</div></div></div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-header"><h2 class="card-title">Últimas Ventas</h2><a class="btn btn-secondary btn-sm" href="#sales">Ver todas</a></div>
        ${recent.length ? `<table><thead><tr><th>ID</th><th>Fecha</th><th>Total</th><th>Usuario</th><th></th></tr></thead><tbody>${recent.slice(0,5).map(s=>`<tr><td>#${s.id}</td><td>${fmtDate(s.created)}</td><td class="text-success">${fmtMoney(s.total)}</td><td>${s.user}</td><td><button class="btn btn-danger btn-sm" onclick="promptDeleteSale(${s.id})">🗑️</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No hay ventas recientes</div>'}
      </div>
    </div>
  `;
}

function renderProducts() {
  const products = getProducts();
  return `
    <div class="header"><h1>Productos</h1><button class="btn btn-primary" onclick="state.modal={type:'product'};render()">+ Nuevo Producto</button></div>
    <div class="card" style="background:#1e293b;color:#fff;padding:20px;margin-bottom:20px">
      <div style="font-size:13px;margin-bottom:8px;color:#94a3b8">ESCANER DE PRODUCTOS</div>
      <div style="display:flex;gap:10px">
        <input id="scanner-prod" class="form-control" style="font-size:20px;padding:16px;text-align:center;font-weight:700;background:#fff;color:#1e293b" placeholder="Escanear codigo de barras..." onkeydown="if(event.key==='Enter'){scanProductBarcode(this.value);this.value=''}">
        <button class="btn btn-primary" onclick="startCameraScan()" style="padding:16px 20px;font-size:18px">📷</button>
      </div>
    </div>
    <div class="search">
      <input class="search-input" placeholder="Buscar productos..." value="${state.search}" oninput="state.search=this.value;render()">
    </div>
    <div class="card">
      <table>
        <thead><tr><th>Nombre</th><th>Precio</th><th>Stock</th><th>Mín.</th><th>Barcode</th><th>Acciones</th></tr></thead>
        <tbody>
          ${products.length ? products.map(p=>`
            <tr class="${p.stock <= p.minStock ? 'low-stock' : ''}">
              <td><strong>${p.name}</strong></td>
              <td>${fmtMoney(p.price)}</td>
              <td>${p.stock}</td>
              <td>${p.minStock}</td>
              <td style="font-family:monospace;font-size:12px">${p.barcode || '-'}</td>
              <td>
                <div class="flex gap-2">
                  <button class="btn btn-secondary btn-sm" onclick="showBarcode('${p.barcode}','${p.name}')">📱</button>
                  <button class="btn btn-primary btn-sm" onclick="state.modal={type:'barcodePrint',product:${JSON.stringify(p).replace(/"/g,'&quot;')}};render()">🏷️</button>
                  <button class="btn btn-secondary btn-sm" onclick="state.modal={type:'product',product:${JSON.stringify(p).replace(/"/g,'&quot;')}};render()">✏️</button>
                  <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id});render()">🗑️</button>
                </div>
              </td>
            </tr>
          `).join('') : '<tr><td colspan="6"><div class="empty">No se encontraron productos</div></td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function renderSales() {
  const products = getProducts().filter(p => p.stock > 0);
  return `
    <div class="header"><h1>Punto de Venta</h1><div style="color:#64748b">${new Date().toLocaleDateString('es-ES')}</div></div>
    <div style="display:grid;grid-template-columns:1fr 350px;gap:20px;height:calc(100vh - 160px)">
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card" style="background:#1e293b;color:#fff;padding:20px">
          <div style="font-size:13px;margin-bottom:8px;color:#94a3b8">ESCANER</div>
          <div style="display:flex;gap:10px">
            <input id="scanner-input" class="form-control" style="font-size:20px;padding:16px;text-align:center;font-weight:700;background:#fff;color:#1e293b" placeholder="Escanear codigo..." onkeydown="if(event.key==='Enter'){scanBarcode(this.value);this.value=''}">
            <button class="btn btn-primary" onclick="startCameraScan()" style="padding:16px 20px;font-size:18px">📷</button>
          </div>
        </div>
        <div class="card" style="flex:1;overflow:hidden">
          <div class="card-header"><h2 class="card-title">Productos</h2></div>
          <div style="padding:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;max-height:400px;overflow-y:auto">
            ${products.map(p => 
              '<div style="padding:14px;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer" onclick="addProdById(' + p.id + ')"><div style="font-weight:600;font-size:13px">' + p.name + '</div><div style="font-size:11px;color:#64748b">Cod:' + (p.barcode || '-') + ' | Stock:' + p.stock + '</div><div style="font-size:12px;color:#10b981">' + fmtMoney(p.price) + '</div></div>'
            ).join('')}
          </div>
        </div>
      </div>
      <div class="card" style="display:flex;flex-direction:column;height:100%">
        <div class="card-header" style="background:#f8fafc"><h2 class="card-title">Carrito</h2></div>
        <div style="flex:1;overflow-y:auto;padding:12px">
          ${state.cart.length ? state.cart.map(item =>
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid #e2e8f0"><div style="flex:1"><div style="font-weight:600;font-size:13px">' + item.name + '</div><div style="font-size:11px;color:#64748b">Cod:' + (item.barcode || '-') + ' | ' + fmtMoney(item.price) + '</div></div><div style="display:flex;align-items:center;gap:6px"><button class="btn btn-secondary btn-sm" style="padding:6px" onclick="updateCartQty(' + item.id + ',' + (item.quantity-1) + ');render()">-</button><span>' + item.quantity + '</span><button class="btn btn-secondary btn-sm" style="padding:6px" onclick="updateCartQty(' + item.id + ',' + (item.quantity+1) + ');render()">+</button><span style="color:#10b981;font-weight:600">' + fmtMoney(item.price * item.quantity) + '</span></div></div>'
          ).join('') : '<div class="empty"><div>Carrito vacio</div></div>'}
        </div>
        <div style="padding:20px;border-top:2px solid #e2e8f0;background:#f8fafc">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Total:</span><span style="font-size:22px;font-weight:700;color:#10b981">${fmtMoney(getCartTotal())}</span></div>
          <div style="display:flex;gap:10px">
            <button class="btn btn-danger" style="flex:1;padding:16px;font-size:16px" onclick="cancelCart()">CANCELAR</button>
            <button class="btn btn-primary" style="flex:1;padding:16px;font-size:16px" onclick="if(state.cart.length){showPaymentOptions('quote')}">📄 COTIZAR</button>
            <button class="btn btn-success" style="flex:1;padding:16px;font-size:16px" onclick="if(state.cart.length){showPaymentOptions('sale')}">💵 COBRAR</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function addProdById(id) {
  const products = DB.get('products');
  const p = products.find(x => x.id === id);
  if (p) addToCart(p);
  render();
}

function findProduct(query) {
  const products = DB.get('products');
  const q = query.toLowerCase().trim();
  if (!q) return null;
  
  // 1. Búsqueda EXACTA por código de barras
  let product = products.find(p => p.barcode === query);
  if (product) return product;
  
  // 2. Búsqueda PARCIAL por código de barras
  product = products.find(p => p.barcode && p.barcode.toLowerCase().includes(q));
  if (product) return product;
  
  // 3. Búsqueda por nombre (parcial, sin distinción de mayúsculas)
  product = products.find(p => p.name.toLowerCase().includes(q));
  if (product) return product;
  
  return null;
}

function scanBarcode(code) {
  code = code.trim();
  if (!code) return;
  
  const product = findProduct(code);
  
  if (product) {
    addToCart(product);
  } else {
    alert('Producto no encontrado: ' + code);
  }
  render();
  setTimeout(function() { 
    var inp = document.getElementById('scanner-input'); 
    if(inp) { inp.value = ''; inp.focus(); } 
  }, 100);
}

function scanProductBarcode(code) {
  code = code.trim();
  if (!code) return;
  
  const product = findProduct(code);
  
  if (product) {
    if (product.stock > 0) {
      addToCart(product);
      alert('Agregado: ' + product.name + ' - ' + fmtMoney(product.price));
    } else {
      alert('Sin stock: ' + product.name);
    }
  } else {
    state.modal = { type: 'quickAddProduct', barcode: code };
  }
  render();
  setTimeout(function() {
    var inp = document.getElementById('scanner-prod');
    if(inp) { inp.value = ''; inp.focus(); }
  }, 100);
}

function renderUsers() {
  if (state.user.role !== 'ADMIN') return '<div class="empty">Acceso denegado</div>';
  const users = getUsers();
  return `
    <div class="header"><h1>Usuarios</h1><button class="btn btn-primary" onclick="state.modal={type:'user'};render()">+ Nuevo</button></div>
    
    <!-- DATOS DE LA EMPRESA - TODO EN UN SOLO ESPACIO -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header"><h2 class="card-title">🏢 Datos de la Empresa</h2></div>
      <div style="padding:20px">
        <table style="width:100%">
          <tr>
            <td style="padding:15px;border-bottom:1px solid #e2e8f0">
              <div style="display:flex;align-items:center;gap:15px">
                <span style="font-size:24px">📛</span>
                <div style="flex:1">
                  <strong>Nombre de la Empresa</strong>
                  <p style="color:#64748b;font-size:12px">Aparece en facturas, cotizaciones y reportes</p>
                </div>
                <input type="text" id="bizname" value="${localStorage.getItem('salesstock_bizname') || 'SalesStock Pro'}" style="padding:8px;border:1px solid #e2e8f0;border-radius:4px;width:220px" placeholder="Nombre de la empresa">
                <button class="btn btn-primary btn-sm" onclick="localStorage.setItem('salesstock_bizname',document.getElementById('bizname').value);render()">Guardar</button>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:15px;border-bottom:1px solid #e2e8f0">
              <div style="display:flex;align-items:center;gap:15px">
                <span style="font-size:24px">🪪</span>
                <div style="flex:1">
                  <strong>RNC / NIT</strong>
                  <p style="color:#64748b;font-size:12px">Registro fiscal de la empresa</p>
                </div>
                <input type="text" id="bizrnc" value="${localStorage.getItem('salesstock_bizrnc') || ''}" style="padding:8px;border:1px solid #e2e8f0;border-radius:4px;width:200px" placeholder="000-0000000-0">
                <button class="btn btn-primary btn-sm" onclick="localStorage.setItem('salesstock_bizrnc',document.getElementById('bizrnc').value);render()">Guardar</button>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:15px;border-bottom:1px solid #e2e8f0">
              <div style="display:flex;align-items:center;gap:15px">
                <span style="font-size:24px">📞</span>
                <div style="flex:1">
                  <strong>Teléfono de la Empresa</strong>
                  <p style="color:#64748b;font-size:12px">Contacto principal</p>
                </div>
                <input type="text" id="bizphone" value="${localStorage.getItem('salesstock_bizphone') || ''}" style="padding:8px;border:1px solid #e2e8f0;border-radius:4px;width:200px" placeholder="(809) 000-0000">
                <button class="btn btn-primary btn-sm" onclick="localStorage.setItem('salesstock_bizphone',document.getElementById('bizphone').value);render()">Guardar</button>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:15px;border-bottom:1px solid #e2e8f0">
              <div style="display:flex;align-items:center;gap:15px">
                <span style="font-size:24px">📍</span>
                <div style="flex:1">
                  <strong>Dirección</strong>
                  <p style="color:#64748b;font-size:12px">Dirección física del negocio</p>
                </div>
                <input type="text" id="bizaddress" value="${localStorage.getItem('salesstock_bizaddress') || ''}" style="padding:8px;border:1px solid #e2e8f0;border-radius:4px;width:300px" placeholder="Calle, ciudad, país">
                <button class="btn btn-primary btn-sm" onclick="localStorage.setItem('salesstock_bizaddress',document.getElementById('bizaddress').value);render()">Guardar</button>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:15px">
              <div style="background:#f8fafc;padding:10px;border-radius:8px">
                <strong>Estado del sistema:</strong> <span style="color:#10b981">Configurado</span>
                <p style="color:#64748b;font-size:12px;margin-top:4px">Los datos guardados se imprimen automáticamente en facturas y cotizaciones.</p>
              </div>
            </td>
          </tr>
        </table>
      </div>
    </div>
    
    <!-- GESTION DE USUARIOS -->
    <div class="card">
      <table>
        <thead><tr><th>Usuario</th><th>Rol</th><th>Fecha</th><th>Acciones</th></tr></thead>
        <tbody>
          ${users.map(u=>`
            <tr>
              <td><strong>${u.username}</strong></td>
              <td><span class="badge ${u.role==='ADMIN'?'badge-warning':'badge-info'}">${u.role==='ADMIN'?'Administrador':'Usuario'}</span></td>
              <td>${fmtDate(u.created)}</td>
              <td>
                <div class="flex gap-2">
                  <button class="btn btn-secondary btn-sm" onclick="state.modal={type:'user',user:${JSON.stringify(u).replace(/"/g,'&quot;')}};render()">✏️</button>
                  <button class="btn btn-danger btn-sm" onclick="if(confirm('¿Eliminar?')){deleteUser(${u.id});render()}">🗑️</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderReports() {
  const today = new Date().toISOString().split('T')[0];
  const sales = getTodaySales();
  const total = sales.reduce((s, s2) => s + s2.total, 0);
  return `
    <div class="header"><h1>Reportes</h1><button class="btn btn-primary" onclick="exportPDF()">📥 Exportar PDF</button></div>
    <div class="stats">
      <div class="stat"><div class="stat-icon blue">🧾</div><div class="stat-info"><h3>Transacciones</h3><div class="stat-value">${sales.length}</div></div></div>
      <div class="stat"><div class="stat-icon green">📦</div><div class="stat-info"><h3>Artículos</h3><div class="stat-value">${sales.reduce((s,s2)=>s+s2.items.reduce((ss,i)=>ss+i.quantity,0),0)}</div></div></div>
      <div class="stat"><div class="stat-icon orange">💰</div><div class="stat-info"><h3>Ingresos</h3><div class="stat-value">${fmtMoney(total)}</div></div></div>
    </div>
    <div class="card">
      <div class="card-header"><h2 class="card-title">Detalle - ${new Date(today).toLocaleDateString('es-ES')}</h2></div>
      ${sales.length ? `<table><thead><tr><th>ID</th><th>Hora</th><th>Productos</th><th>Total</th><th></th></tr></thead><tbody>${sales.map(s=>`<tr><td>#${s.id}</td><td>${new Date(s.created).toLocaleTimeString('es-ES')}</td><td>${s.items.map(i=>i.name).join(', ')}</td><td class="text-success" style="font-weight:600">${fmtMoney(s.total)}</td><td><button class="btn btn-danger btn-sm" onclick="promptDeleteSale(${s.id})">🗑️</button></td></tr>`).join('')}</tbody><tfoot><tr style="background:#f8fafc"><td colspan="2" style="text-align:right;font-weight:600">TOTAL:</td><td class="text-success" style="font-weight:700;font-size:16px">${fmtMoney(total)}</td><td></td></tr></tfoot></table>` : '<div class="empty">No hay ventas hoy</div>'}
    </div>
  `;
}

function renderModal() {
  const m = state.modal;
  if (!m) return '';
  let html = '';
  if (m.type === 'product') {
    const p = m.product || {};
    html = `
      <div class="modal-overlay" onclick="state.modal=null;render()">
        <div class="modal" onclick="event.stopPropagation()">
          <div class="modal-header"><h2 class="modal-title">${p.id?'Editar':'Nuevo'} Producto</h2><button class="btn btn-secondary" onclick="state.modal=null;render()">✕</button></div>
          <form onsubmit="event.preventDefault();saveProduct({id:${p.id||'null'},name:this.n.value,price:parseFloat(this.pr.value),stock:parseInt(this.s.value),minStock:parseInt(this.m.value),barcode:this.b.value});state.modal=null;render()">
            <div class="modal-body">
              <div class="form-group"><label>Nombre *</label><input class="form-control" name="n" value="${p.name||''}" required></div>
              <div class="form-row">
                <div class="form-group"><label>Precio *</label><input class="form-control" name="pr" type="number" step="0.01" value="${p.price||''}" required></div>
                <div class="form-group"><label>Stock</label><input class="form-control" name="s" type="number" value="${p.stock||''}"></div>
              </div>
              <div class="form-row">
                <div class="form-group"><label>Stock Mínimo</label><input class="form-control" name="m" type="number" value="${p.minStock||10}"></div>
                <div class="form-group"><label>Barcode</label><input class="form-control" name="b" value="${p.barcode||''}"></div>
              </div>
            </div>
            <div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="state.modal=null;render()">Cancelar</button><button type="submit" class="btn btn-primary">${p.id?'Actualizar':'Crear'}</button></div>
          </form>
        </div>
      </div>
    `;
  } else if (m.type === 'user') {
    const u = m.user || {};
    html = `
      <div class="modal-overlay" onclick="state.modal=null;render()">
        <div class="modal" onclick="event.stopPropagation()">
          <div class="modal-header"><h2 class="modal-title">${u.id?'Editar':'Nuevo'} Usuario</h2><button class="btn btn-secondary" onclick="state.modal=null;render()">✕</button></div>
          <form onsubmit="event.preventDefault();saveUser({id:${u.id||'null'},username:this.u.value,password:this.p.value,role:this.r.value,created:new Date().toISOString()});state.modal=null;render()">
            <div class="modal-body">
              <div class="form-group"><label>Usuario *</label><input class="form-control" name="u" value="${u.username||''}" required></div>
              ${!u.id ? `<div class="form-group"><label>Contraseña *</label><input class="form-control" name="p" required></div>` : ''}
              <div class="form-group"><label>Rol</label><select class="form-control" name="r"><option value="USER" ${u.role==='USER'?'selected':''}>Usuario</option><option value="ADMIN" ${u.role==='ADMIN'?'selected':''}>Administrador</option></select></div>
            </div>
            <div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="state.modal=null;render()">Cancelar</button><button type="submit" class="btn btn-primary">${u.id?'Actualizar':'Crear'}</button></div>
          </form>
        </div>
      </div>
    `;
  } else if (m.type === 'barcode') {
    html = `
      <div class="modal-overlay" onclick="state.modal=null;render()">
        <div class="modal" onclick="event.stopPropagation()" style="max-width:350px">
          <div class="modal-header"><h2 class="modal-title">Código de Barras</h2><button class="btn btn-secondary" onclick="state.modal=null;render()">✕</button></div>
          <div class="modal-body" style="text-align:center">
            <h3 style="margin-bottom:16px">${m.name}</h3>
            <svg id="barcode"></svg>
            <p style="margin-top:16px;font-family:monospace;color:#64748b">${m.barcode}</p>
          </div>
        </div>
      </div>
    `;
  } else if (m.type === 'payment') {
    html = `
      <div class="modal-overlay" onclick="state.modal=null;render()">
        <div class="modal" onclick="event.stopPropagation()">
          <div class="modal-header"><h2 class="modal-title">Datos del Cliente y Facturación</h2><button class="btn btn-secondary" onclick="state.modal=null;render()">✕</button></div>
          <div class="modal-body">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
              <div class="form-group" style="margin-bottom:0">
                <label>Nombre del Cliente</label>
                <input type="text" id="customer-name" class="form-control" placeholder="Nombre completo">
              </div>
              <div class="form-group" style="margin-bottom:0">
                <label>Teléfono del Cliente</label>
                <input type="text" id="customer-phone" class="form-control" placeholder="(000) 000-0000">
              </div>
            </div>
            <div class="form-group" style="margin-bottom:20px">
              <label>Notas</label>
              <textarea id="sale-notes" class="form-control" rows="2" placeholder="Información adicional, instrucciones especiales..."></textarea>
            </div>
            <div style="background:#f8fafc;padding:16px;border-radius:8px;margin-bottom:20px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <strong>Total del carrito:</strong>
                <span style="font-size:22px;font-weight:700;color:#10b981">${fmtMoney(m.total)}</span>
              </div>
            </div>
            <p style="margin-bottom:20px;color:#64748b;font-size:12px">
              ${m.paymentMode === 'sale' ? 'Seleccione la forma de pago:' : 'Generar cotización sin pago:'}
            </p>
            <div style="display:flex;flex-direction:column;gap:15px">
              ${m.paymentMode === 'sale' ? `
                <button class="btn btn-success" style="padding:20px;font-size:18px" onclick="submitSale('contado')">
                  💵 Pagar de una vez
                  <div style="font-size:14px;font-weight:normal;margin-top:5px">Total: ${fmtMoney(m.total)}</div>
                </button>
                <button class="btn btn-primary" style="padding:20px;font-size:18px" onclick="submitSale('credito')">
                  📊 Pagar a Crédito
                  <div style="font-size:14px;font-weight:normal;margin-top:5px">Total: ${fmtMoney(m.total * 1.05)} (5% interés)</div>
                </button>
              ` : ''}
              ${m.paymentMode === 'quote' ? `
                <button class="btn btn-secondary" style="padding:20px;font-size:18px" onclick="submitQuote()">
                  📄 Generar Cotización
                  <div style="font-size:13px;font-weight:normal;margin-top:5px">Guardar como borrador sin pago</div>
                </button>
              ` : ''}
            </div>
            ${m.paymentMode === 'sale' ? '<p style="margin-top:20px;color:#64748b;font-size:12px">* Crédito: se cobrará 5% extra después de 30 días</p>' : ''}
          </div>
        </div>
      </div>
    `;
  } else if (m.type === 'quickAddProduct') {
    html = `
      <div class="modal-overlay" onclick="state.modal=null;render()">
        <div class="modal" onclick="event.stopPropagation()">
          <div class="modal-header"><h2 class="modal-title">Agregar Producto</h2><button class="btn btn-secondary" onclick="state.modal=null;render()">✕</button></div>
          <form onsubmit="event.preventDefault();saveQuickProduct(this.n.value,this.pr.value,this.s.value,this.m.value,this.b.value)">
            <div class="modal-body">
              <div class="alert-box" style="background:#dbeafe;color:#1e40af;border-color:#93c5fd;margin-bottom:15px">
                Código detectado: <strong>${m.barcode}</strong>
              </div>
              <div class="form-group"><label>Nombre *</label><input class="form-control" name="n" placeholder="Nombre del producto" required></div>
              <div class="form-row">
                <div class="form-group"><label>Precio *</label><input class="form-control" name="pr" type="number" step="0.01" placeholder="0.00" required></div>
                <div class="form-group"><label>Stock</label><input class="form-control" name="s" type="number" value="0"></div>
              </div>
              <div class="form-row">
                <div class="form-group"><label>Stock Mínimo</label><input class="form-control" name="m" type="number" value="5"></div>
                <div class="form-group"><label>Código</label><input class="form-control" name="b" value="${m.barcode}" readonly style="background:#f3f4f6"></div>
              </div>
            </div>
            <div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="state.modal=null;render()">Cancelar</button><button type="submit" class="btn btn-primary">Agregar</button></div>
          </form>
        </div>
      </div>
    `;
  } else if (m.type === 'barcodePrint') {
    const p = m.product || {};
    html = `
      <div class="modal-overlay" onclick="state.modal=null;render()">
        <div class="modal" onclick="event.stopPropagation()" style="max-width:400px">
          <div class="modal-header"><h2 class="modal-title">Imprimir Etiqueta</h2><button class="btn btn-secondary" onclick="state.modal=null;render()">✕</button></div>
          <div class="modal-body" style="text-align:center">
            <h3 style="margin-bottom:16px">${p.name}</h3>
            <p style="margin-bottom:20px;color:#64748b">Codigo: <strong>${p.barcode || '-'}</strong></p>
            <div class="form-group" style="text-align:left">
              <label>Cantidad de etiquetas</label>
              <input id="label-qty" class="form-control" type="number" min="1" max="500" value="1" style="font-size:18px;text-align:center;font-weight:600">
            </div>
            <p style="color:#64748b;font-size:12px">Formato: 60 x 25 mm</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="state.modal=null;render()">Cancelar</button>
            <button type="button" class="btn btn-success" onclick="printSingleLabel(state.modal.product, parseInt(document.getElementById('label-qty').value))">🖨️ Imprimir</button>
          </div>
        </div>
      </div>
    `;
  } else if (m.type === 'camera') {
    html = `
      <div class="modal-overlay" onclick="stopCameraScan();state.modal=null;render()">
        <div class="modal" onclick="event.stopPropagation()" style="max-width:500px">
          <div class="modal-header">
            <h2 class="modal-title">Escáner de Código</h2>
            <button class="btn btn-secondary" onclick="event.stopPropagation();stopCameraScan();state.modal=null;render()">✕</button>
          </div>
          <div class="modal-body" style="text-align:center">
            <p style="margin-bottom:15px;color:#64748b">Apunta el código de barras o QR con la cámara</p>
            <div id="camera-reader" style="width:100%;max-width:400px;margin:0 auto;border:2px solid #e2e8f0;border-radius:8px;overflow:hidden"></div>
          </div>
        </div>
      </div>
    `;
  }
  return html;
}

function showBarcode(barcode, name) {
  state.modal = { type: 'barcode', barcode, name };
  render();
  setTimeout(() => { JsBarcode('#barcode', barcode, { format: 'CODE128', width: 2, height: 80, displayValue: true, fontSize: 14 }); }, 100);
}

function exportPDF() {
  const sales = getTodaySales();
  const total = sales.reduce((s, s2) => s + s2.total, 0);
  const doc = new jsPDF();
  doc.setFontSize(20);
  doc.text(localStorage.getItem('salesstock_bizname') || 'SalesStock Pro', 105, 20, { align: 'center' });
  doc.setFontSize(14);
  doc.text('Reporte de Ventas Diarias', 105, 32, { align: 'center' });
  doc.setFontSize(10);
  doc.text('Fecha: ' + new Date().toLocaleDateString('es-ES'), 20, 45);
  doc.text('Generado por: ' + state.user.username, 20, 52);
  doc.line(20, 58, 190, 58);
  doc.setFontSize(12);
  doc.text('Resumen', 20, 68);
  doc.setFontSize(10);
  doc.text('Transacciones: ' + sales.length, 20, 78);
  doc.text('Ingresos: $' + total.toFixed(2), 20, 85);
  doc.line(20, 92, 190, 92);
  doc.setFontSize(12);
  doc.text('Detalle de Ventas', 20, 102);
  let y = 115;
  doc.setFontSize(9);
  doc.text('ID', 20, y);
  doc.text('Hora', 45, y);
  doc.text('Productos', 75, y);
  doc.text('Total', 160, y);
  y += 6;
  sales.forEach(s => {
    const prods = s.items.map(i => i.name + '(' + i.quantity + ')').join(', ').substring(0, 40);
    doc.text('#' + s.id, 20, y);
    doc.text(new Date(s.created).toLocaleTimeString('es-ES'), 45, y);
    doc.text(prods, 75, y);
    doc.text('$' + s.total.toFixed(2), 160, y);
    y += 6;
  });
  y += 10;
  doc.setFontSize(14);
  doc.text('Total: $' + total.toFixed(2), 105, y, { align: 'center' });
  doc.save('reporte-' + new Date().toISOString().split('T')[0] + '.pdf');
}

function printBarcodeLabels() {
  const products = DB.get('products');
  generateLabelPDF(products);
}

function printSingleLabel(product, quantity) {
  if (!quantity || quantity < 1) quantity = 1;
  const list = [];
  for (let i = 0; i < quantity; i++) list.push(product);
  generateLabelPDF(list);
}

function generateLabelPDF(products) {
  if (!products.length) { alert('No hay productos para imprimir'); return; }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const labelW = 60;
  const labelH = 25;
  const marginX = 12;
  const marginY = 12;
  const gapX = 6;
  const gapY = 4;
  const cols = 3;
  const rowsPerPage = Math.floor((297 - marginY * 2 + gapY) / (labelH + gapY));

  let col = 0, row = 0;
  products.forEach((p) => {
    if (row >= rowsPerPage) {
      doc.addPage();
      row = 0;
      col = 0;
    }

    const x = marginX + col * (labelW + gapX);
    const y = marginY + row * (labelH + gapY);

    doc.setDrawColor(180);
    doc.rect(x, y, labelW, labelH);

    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 80;
    try {
      JsBarcode(canvas, p.barcode || ('S' + p.id), {
        format: 'CODE128',
        width: 2,
        height: 40,
        displayValue: true,
        fontSize: 12,
        margin: 0
      });
      const imgData = canvas.toDataURL('image/png');
      doc.addImage(imgData, 'PNG', x + 2, y + 2, labelW - 4, 12);
    } catch (e) {
      doc.setFontSize(8);
      doc.text(p.barcode || 'N/A', x + 4, y + 6);
    }

    const name = p.name.length > 22 ? p.name.substring(0, 20) + '..' : p.name;
    const nameW = doc.getTextWidth(name);
    doc.text(name, x + (labelW - nameW) / 2, y + 17);

    const price = '$' + p.price.toFixed(2);
    const priceW = doc.getTextWidth(price);
    doc.text(price, x + (labelW - priceW) / 2, y + 23);

    col++;
    if (col >= cols) {
      col = 0;
      row++;
    }
  });

  doc.save('etiquetas.pdf');
}

// Exponer al window para que el HTML pueda acceder
window.state = state;
window.logout = logout;
window.isDirty = false;
window.showPaymentOptions = showPaymentOptions;
window.submitSale = submitSale;
window.submitQuote = submitQuote;

// Marcar changes cuando el carrito cambia
const originalAddToCart = addToCart;
addToCart = function(product) {
  originalAddToCart(product);
  window.isDirty = true;
};

const originalUpdateCartQty = updateCartQty;
updateCartQty = function(id, qty) {
  originalUpdateCartQty(id, qty);
  window.isDirty = true;
};

const originalRemoveFromCart = removeFromCart;
removeFromCart = function(id) {
  originalRemoveFromCart(id);
  window.isDirty = true;
};

const originalCancelCart = cancelCart;
cancelCart = function() {
  originalCancelCart();
  window.isDirty = false;
};

  const originalCompleteSale = completeSale;
  completeSale = function(paymentType, customerData) {
    originalCompleteSale(paymentType, customerData);
    window.isDirty = false;
  };

  const originalMakeQuote = makeQuote;
  makeQuote = function(customerData) {
    originalMakeQuote(customerData);
    window.isDirty = false;
  };

const originalLogout = logout;
logout = function() {
  if (window.isDirty && state.cart.length > 0) {
    if (!confirm('⚠️ Tienes ' + state.cart.length + ' producto(s) en el carrito.\n\n¿Seguro que quieres cerrar sesión? Se perderán los productos del carrito.')) {
      return;
    }
  }
  originalLogout();
};

// Confirmar antes de recargar/cerrar pestaña
window.addEventListener('beforeunload', (e) => {
  if (window.isDirty && state.cart && state.cart.length > 0) {
    e.preventDefault();
    e.returnValue = 'Tienes productos en el carrito. ¿Seguro que quieres salir?';
    return 'Tienes productos en el carrito. ¿Seguro que quieres salir?';
  }
});

render();
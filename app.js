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

function showPaymentOptions() {
  const total = getCartTotal();
  state.modal = {
    type: 'payment',
    total: total
  };
  render();
}

function completeSale(paymentType) {
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

function stopCameraScan() {
  const html5QrCode = new Html5Qrcode("camera-reader");
  html5QrCode.stop();
}

function makeQuote() {
  if (state.cart.length === 0) return;
  const quote = {
    id: 'COT-' + Date.now(),
    items: state.cart.map(i => ({ id: i.id, name: i.name, barcode: i.barcode, quantity: i.quantity, price: i.price, subtotal: i.price * i.quantity })),
    total: getCartTotal(),
    user: state.user.username,
    created: new Date().toISOString()
  };
  generateQuoteInvoice(quote);
  state.cart = [];
  render();
  alert('Cotización generada: ' + quote.id);
}

function generateQuoteInvoice(quote) {
  const itemCount = quote.items.length;
  const baseHeight = 80;
  const perItemHeight = 7;
  const footerHeight = 30;
  const totalHeight = baseHeight + (itemCount * perItemHeight) + footerHeight;
  
  const doc = new jsPDF({ unit: 'mm', format: [80, totalHeight] });
  let y = 5;
  
  // Header
  doc.setFontSize(12);
  doc.text(localStorage.getItem('salesstock_bizname') || 'SALESSTOCK PRO', 40, y, { align: 'center' });
  y += 4;
  doc.setFontSize(10);
  doc.text('COTIZACION', 40, y, { align: 'center' });
  y += 4;
  doc.setFontSize(8);
  doc.text('COT #: ' + quote.id, 40, y, { align: 'center' });
  y += 3;
  doc.text(new Date(quote.created).toLocaleDateString('es-ES'), 40, y, { align: 'center' });
  y += 3;
  doc.text('Vendedor: ' + quote.user, 40, y, { align: 'center' });
  y += 4;
  doc.text('--------------------------------', 40, y, { align: 'center' });
  y += 3;
  
  // Items
  doc.setFontSize(7);
  quote.items.forEach(item => {
    const nome = item.name.substring(0, 12);
    const cant = item.quantity.toString();
    const pu = '$' + item.price.toFixed(2);
    const tot = '$' + item.subtotal.toFixed(2);
    doc.text(nome, 5, y);
    doc.text(cant, 35, y);
    doc.text(pu, 48, y);
    doc.text(tot, 62, y);
    y += 4;
  });
  
  y += 2;
  doc.text('--------------------------------', 40, y, { align: 'center' });
  y += 3;
  
  // Total
  doc.setFontSize(10);
  doc.text('TOTAL: $' + quote.total.toFixed(2), 60, y, { align: 'right' });
  y += 5;
  
  // Footer
  doc.setFontSize(8);
  doc.text('No es venta - Validez: 7 dias', 40, y, { align: 'center' });
  
  doc.save('cotizacion-' + quote.id + '.pdf');
  
  if (localStorage.getItem('salesstock_print') !== 'auto') {
    setTimeout(() => window.print(), 500);
  }
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

function generateInvoice(sale) {
  // Calcular altura dinámica basada en cantidad de productos
  const itemCount = sale.items.length;
  const baseHeight = 80; // altura mínima
  const perItemHeight = 7; // mm por producto
  const footerHeight = 30; // espacio para total y mensajes
  const totalHeight = baseHeight + (itemCount * perItemHeight) + footerHeight;
  
  const doc = new jsPDF({ unit: 'mm', format: [80, totalHeight] });
  let y = 5;
  
  // Header compacto
  doc.setFontSize(12);
  doc.text(localStorage.getItem('salesstock_bizname') || 'SALESSTOCK PRO', 40, y, { align: 'center' });
  y += 4;
  doc.setFontSize(8);
  doc.text('FACTURA #: ' + sale.id, 40, y, { align: 'center' });
  y += 3;
  doc.text(new Date(sale.created).toLocaleDateString('es-ES') + ' ' + new Date(sale.created).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }), 40, y, { align: 'center' });
  y += 3;
  doc.text('Cajero: ' + sale.user, 40, y, { align: 'center' });
  y += 4;
  doc.text('--------------------------------', 40, y, { align: 'center' });
  y += 3;
  
  // Items - compacto
  doc.setFontSize(7);
  doc.text('Prod', 5, y);
  doc.text('Cant', 35, y);
  doc.text('P.U.', 48, y);
  doc.text('Total', 62, y);
  y += 3;
  
  sale.items.forEach(item => {
    const nome = item.name.substring(0, 12);
    const cant = item.quantity.toString();
    const pu = '$' + item.price.toFixed(2);
    const tot = '$' + item.subtotal.toFixed(2);
    doc.text(nome, 5, y);
    doc.text(cant, 35, y);
    doc.text(pu, 48, y);
    doc.text(tot, 62, y);
    y += 4;
  });
  
  y += 2;
  doc.text('--------------------------------', 40, y, { align: 'center' });
  y += 3;
  
  // Total
  doc.setFontSize(10);
  if (sale.paymentType === 'credito') {
    doc.text('Sub: $' + sale.subtotal.toFixed(2), 60, y, { align: 'right' });
    y += 3;
    doc.text('Int(5%): $' + sale.interest.toFixed(2), 60, y, { align: 'right' });
    y += 3;
  }
  doc.text('TOTAL: $' + sale.total.toFixed(2), 60, y, { align: 'right' });
  y += 4;
  
  // Mensaje final
  doc.setFontSize(8);
  if (sale.paymentType === 'credito') {
    doc.text('*** PAGO A CREDITO ***', 40, y, { align: 'center' });
    y += 3;
    doc.text('Se cobrara 5% extra en 30 dias', 40, y, { align: 'center' });
  } else {
    doc.text('GRACIAS', 40, y, { align: 'center' });
  }
  
  // Save as PDF
  doc.save('venta-' + sale.id + '.pdf');
  
  // Print based on configuration
  const printConfig = localStorage.getItem('salesstock_print') || 'ask';
  if (printConfig === 'auto') {
    try {
      doc.autoPrint();
      window.open(doc.output('bloburl'), '_blank');
    } catch(e) {
      setTimeout(() => window.print(), 500);
    }
  } else {
    setTimeout(() => window.print(), 500);
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
            <button class="btn btn-primary" style="flex:1;padding:16px;font-size:16px" onclick="if(state.cart.length){makeQuote()}">COTIZAR</button>
            <button class="btn btn-success" style="flex:1;padding:16px;font-size:16px" onclick="if(state.cart.length){showPaymentOptions()}">COBRAR</button>
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
    // Abrir modal para agregar producto con código pre-llenado
    state.modal = { type: 'quickAddProduct', barcode: code };
    render();
  }
  render();
  setTimeout(function() { 
    var inp = document.getElementById('scanner-prod'); 
    if(inp) { inp.value = ''; inp.focus(); } 
  }, 100);
}
  render();
  setTimeout(function() { var inp = document.getElementById('scanner-input'); if(inp) { inp.value = ''; inp.focus(); } }, 100);


function scanProductBarcode(code) {
  code = code.trim();
  if (!code) return;
  const products = DB.get('products');
  const product = products.find(p => p.barcode === code);
  if (product) {
    if (product.stock > 0) {
      addToCart(product);
      alert('Agregado: ' + product.name + ' - ' + fmtMoney(product.price));
    } else {
      alert('Sin stock: ' + product.name);
    }
    render();
  } else {
    // Abrir modal para agregar producto con código pre-llenado
    state.modal = { type: 'quickAddProduct', barcode: code };
    render();
  }
  setTimeout(function() { var inp = document.getElementById('scanner-prod'); if(inp) { inp.value = ''; inp.focus(); } }, 100);
}

function renderUsers() {
  if (state.user.role !== 'ADMIN') return '<div class="empty">Acceso denegado</div>';
  const users = getUsers();
  return `
    <div class="header"><h1>Usuarios</h1><button class="btn btn-primary" onclick="state.modal={type:'user'};render()">+ Nuevo</button></div>
    
    <!-- DISPOSITIVOS CONECTADOS - TODO EN UNO SOLO ESPACIO -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header"><h2 class="card-title">📱 Dispositivos Conectados</h2></div>
      <div style="padding:20px">
        <table style="width:100%">
          <tr>
            <td style="padding:15px;border-bottom:1px solid #e2e8f0">
              <div style="display:flex;align-items:center;gap:15px">
                <span style="font-size:24px">🏪</span>
                <div style="flex:1">
                  <strong>Nombre del Negocio</strong>
                  <p style="color:#64748b;font-size:12px">Este nombre aparece en las facturas</p>
                </div>
                <input type="text" id="bizname" value="${localStorage.getItem('salesstock_bizname') || 'SalesStock Pro'}" style="padding:8px;border:1px solid #e2e8f0;border-radius:4px;width:200px" placeholder="Nombre de su negocio">
                <button class="btn btn-primary btn-sm" onclick="localStorage.setItem('salesstock_bizname',document.getElementById('bizname').value);render()">Guardar</button>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:15px;border-bottom:1px solid #e2e8f0">
              <div style="display:flex;align-items:center;gap:15px">
                <span style="font-size:24px">🗨️</span>
                <div style="flex:1">
                  <strong>Lector de Códigos</strong>
                  <p style="color:#64748b;font-size:12px">Conecte por USB (modo teclado)</p>
                </div>
                <button class="btn btn-primary btn-sm" onclick="testScanner()">Probar</button>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:15px;border-bottom:1px solid #e2e8f0">
              <div style="display:flex;align-items:center;gap:15px">
                <span style="font-size:24px">🖨️</span>
                <div style="flex:1">
                  <strong>Impresora</strong>
                  <p style="color:#64748b;font-size:12px">Modo:</p>
                  <select onchange="localStorage.setItem('salesstock_print',this.value)" style="padding:5px;border:1px solid #e2e8f0;border-radius:4px">
                    <option value="ask" ${localStorage.getItem('salesstock_print')!=='auto'?'selected':''}>Preguntar</option>
                    <option value="auto" ${localStorage.getItem('salesstock_print')==='auto'?'selected':''}>Automático</option>
                  </select>
                </div>
                <button class="btn btn-success btn-sm" onclick="testPrinter()">Probar</button>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:15px;border-bottom:1px solid #e2e8f0">
              <div style="display:flex;align-items:center;gap:15px">
                <span style="font-size:24px">💰</span>
                <div style="flex:1">
                  <strong>Cajón de Dinero</strong>
                  <p style="color:#64748b;font-size:12px">Conectado a la impresora vía USB</p>
                </div>
                <label style="display:flex;align-items:center;gap:5px">
                  <input type="checkbox" ${localStorage.getItem('salesstock_cashdrawer')==='yes'?'checked':''} onchange="localStorage.setItem('salesstock_cashdrawer',this.checked?'yes':'no')">
                  <span>Activar</span>
                </label>
                <button class="btn btn-warning btn-sm" style="color:#fff" onclick="testCashDrawer()">Probar</button>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:15px">
              <div style="background:#f8fafc;padding:10px;border-radius:8px">
                <strong>Estado:</strong> ${state.testResult || '<span style="color:#64748b">Sin pruebas recientes</span>'}
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
          <div class="modal-header"><h2 class="modal-title">Forma de Pago</h2><button class="btn btn-secondary" onclick="state.modal=null;render()">✕</button></div>
          <div class="modal-body">
            <p style="margin-bottom:20px;color:#64748b">Seleccione la forma de pago:</p>
            <div style="display:flex;flex-direction:column;gap:15px">
              <button class="btn btn-success" style="padding:20px;font-size:18px" onclick="state.modal=null;completeSale('contado')">
                💵 Pagar de una vez
                <div style="font-size:14px;font-weight:normal;margin-top:5px">Total: ${fmtMoney(m.total)}</div>
              </button>
              <button class="btn btn-primary" style="padding:20px;font-size:18px" onclick="state.modal=null;completeSale('credito')">
                📊 Pagar a Crédito
                <div style="font-size:14px;font-weight:normal;margin-top:5px">Total: ${fmtMoney(m.total * 1.05)} (5% interés)</div>
              </button>
            </div>
            <p style="margin-top:20px;color:#64748b;font-size:12px">* Crédito: se cobrará 5% extra después de 30 días</p>
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

// Exponer al window para que el HTML pueda acceder
window.state = state;
window.logout = logout;
window.isDirty = false;

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
completeSale = function(paymentType) {
  originalCompleteSale(paymentType);
  window.isDirty = false;
};

const originalMakeQuote = makeQuote;
makeQuote = function() {
  originalMakeQuote();
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
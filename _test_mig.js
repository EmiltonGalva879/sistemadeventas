const fs = require('fs');
const code = fs.readFileSync('app.js','utf8');
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k,v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
function makeEl(){ return { innerHTML:'', style:{}, value:'', contains:()=>false, querySelectorAll:()=>[], getAttribute:()=>null, appendChild(){}, addEventListener(){}, focus(){} }; }
const _els = {};
function getEl(id){ if(!_els[id]) _els[id]=makeEl(); return _els[id]; }
global.document = { getElementById: (id) => getEl(id), createElement: () => makeEl(), addEventListener: () => {} };
global.window = global;
global.jspdf = { jsPDF: function(){ return { setFontSize(){}, text(){}, setFont(){}, splitTextToSize(){return ['']}, output(){return {}}, save(){}, setDrawColor(){}, setLineWidth(){}, line(){}, rect(){}, addImage(){}, addPage(){} }; } };
global.addEventListener = () => {};
global.alert = ()=>{}; global.prompt = ()=> '10'; global.confirm = ()=> true;
global.setTimeout = (fn)=>{}; global.URL = { createObjectURL:()=> 'blob:x', revokeObjectURL(){} };
global.open = ()=> ({ location:{}, focus(){}, print(){}, close(){} });

try {
  eval(code);
  console.log('LOAD OK');
} catch(e){ console.log('LOAD ERROR:', e.message); console.log(e.stack); process.exit(1); }

const users = global.DB.get('users');
console.log('USERS after load:', JSON.stringify(users));
const u = users[0];
if (u && u.username === 'Sistemapro' && u.password === 'Sistemapro1532') {
  console.log('ADMIN CREDENTIALS MIGRATED OK');
} else {
  console.log('ADMIN CREDENTIALS NOT UPDATED');
}
const products = global.DB.get('products');
console.log('PRODUCTS after load:', products.length, '(seed defaults removed)');

// Lê o "Histórico de pedidos" do InDrive pelo cabo USB (adb) e salva em minhas-corridas/historico-indrive.csv
// Uso: abra o InDrive no Histórico de pedidos, com o celular no cabo, e rode:
//   node ferramentas/puxar-historico-indrive.mjs
// Só lê a tela e rola a lista. Não toca em nenhuma corrida nem botão.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ADB = process.env.ADB || 'C:\\Users\\thier\\platform-tools\\adb.exe';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.join(RAIZ, 'minhas-corridas', 'historico-indrive.csv');
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8', maxBuffer: 50e6 });
const espera = ms => new Promise(ok => setTimeout(ok, ms));
const desescapa = s => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// corridas já salvas antes (pra poder rodar de novo sem duplicar)
const corridas = new Map();
if (existsSync(SAIDA)) {
  const [cab, ...linhas] = readFileSync(SAIDA, 'utf8').trim().split('\n');
  const cols = cab.split(';');
  for (const l of linhas) { const v = l.split(';'); const o = Object.fromEntries(cols.map((c, i) => [c, v[i]])); corridas.set(o.id, o); }
}
const antes = corridas.size;

function hora24(t) {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(t || '');
  if (!m) return t || '';
  let h = +m[1];
  if (m[3]) { const pm = m[3].toUpperCase() === 'PM'; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

function lerTela() {
  const xml = adb('exec-out', 'uiautomator', 'dump', '/dev/tty');
  if (!xml.includes('sinet.startup.inDriver')) throw new Error('O InDrive não está na tela.');
  const vistos = [];
  let data = ultimaData; // corridas no topo da tela ainda são do último dia visto antes de rolar
  for (const m of xml.matchAll(/<node ([^>]*?)\/?>/g)) {
    const at = {};
    for (const a of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) at[a[1]] = desescapa(a[2]);
    const id = at['resource-id'] || '';
    const valor = at.text || at['content-desc'] || '';
    let x;
    if ((x = /^deal_history_list_header_(\d{4}-\d{2}-\d{2})$/.exec(id))) { data = x[1]; continue; }
    if ((x = /^deal_history_list_deal_cell_([0-9a-f-]{36})(PickupLabel|DropoffLabel|TimeLabel|FareLabel)?$/.exec(id))) {
      const uuid = x[1];
      const c = corridas.get(uuid) || { id: uuid, data: '', hora: '', embarque: '', destino: '', valor: '', status: '' };
      if (data && !c.data) c.data = data;
      if (x[2] === 'PickupLabel') c.embarque = valor;
      if (x[2] === 'DropoffLabel') c.destino = valor;
      if (x[2] === 'TimeLabel') c.hora = hora24(valor);
      if (x[2] === 'FareLabel') c.valor = valor.replace(/[^\d,]/g, '').replace(',', '.');
      corridas.set(uuid, c);
      ultimo = uuid;
      vistos.push(uuid);
      continue;
    }
    if (id === 'deal_list_item_status_label' && ultimo) corridas.get(ultimo).status = valor;
  }
  ultimaData = data;
  return new Set(vistos);
}
let ultimo = null, ultimaData = null;

function salvar() {
  mkdirSync(path.dirname(SAIDA), { recursive: true });
  const cols = ['id', 'data', 'hora', 'embarque', 'destino', 'valor', 'status'];
  const limpa = s => String(s ?? '').replace(/[;\n\r]/g, ' ').trim();
  const lista = [...corridas.values()].sort((a, b) => (b.data + b.hora).localeCompare(a.data + a.hora));
  writeFileSync(SAIDA, cols.join(';') + '\n' + lista.map(c => cols.map(k => limpa(c[k])).join(';')).join('\n') + '\n');
}

const [, larg, alt] = /(\d+)x(\d+)/.exec(adb('shell', 'wm', 'size')) || [0, 1080, 2400];
const W = +larg || 1080, H = +alt || 2400;
const X = String(Math.round(W / 2));
// volta pro topo da lista antes de começar
for (let i = 0; i < 15; i++) adb('shell', 'input', 'swipe', X, String(Math.round(H * 0.35)), X, String(Math.round(H * 0.9)), '120');
await espera(1500);
let semNovidade = 0, rodada = 0;
while (semNovidade < 4) {
  rodada++;
  const tamanho = corridas.size;
  lerTela();
  salvar();
  const novas = corridas.size - tamanho;
  process.stdout.write(`rolagem ${rodada}: +${novas} (total ${corridas.size})\n`);
  semNovidade = novas ? 0 : semNovidade + 1;
  // rola a lista pra baixo devagar (de 75% até 40% da altura), sem "embalo", pra não pular corrida
  adb('shell', 'input', 'swipe', X, String(Math.round(H * 0.75)), X, String(Math.round(H * 0.4)), '1200');
  await espera(semNovidade ? 2500 : 1300); // se não veio nada, dá tempo da lista carregar mais
}
salvar();
console.log(`Pronto: ${corridas.size} pedidos no arquivo (${corridas.size - antes} novos). ${SAIDA}`);

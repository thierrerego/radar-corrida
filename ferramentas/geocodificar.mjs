// Transforma os endereços do histórico em coordenadas (OpenStreetMap / Nominatim) e calcula a rota de cada corrida (OSRM).
// Guarda tudo em cache na pasta minhas-corridas (que não vai pro GitHub), então pode rodar de novo sem refazer.
//   node ferramentas/geocodificar.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = path.join(RAIZ, 'minhas-corridas');
const ARQ_END = path.join(PASTA, 'enderecos.json');
const ARQ_ROTAS = path.join(PASTA, 'rotas.json');
const UA = { 'User-Agent': 'radar-corrida/0.1 (uso pessoal)' };
const VIEWBOX = '-45.20,-11.95,-44.85,-12.30'; // só Barreiras
const espera = ms => new Promise(ok => setTimeout(ok, ms));
const lerJSON = (f, p) => existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : p;

const linhas = readFileSync(path.join(PASTA, 'historico-indrive.csv'), 'utf8').trim().split('\n').slice(1)
  .map(l => { const [id, data, hora, embarque, destino, valor, status] = l.split(';'); return { id, data, hora, embarque, destino, valor: +valor, status }; });

// ---------- 1) endereços -> coordenadas ----------
const enderecos = lerJSON(ARQ_END, {});
const unicos = [...new Set(linhas.flatMap(c => [c.embarque, c.destino]).filter(Boolean))].filter(e => !(e in enderecos));
console.log(`Endereços: ${Object.keys(enderecos).length} já prontos, ${unicos.length} pra buscar (~${Math.ceil(unicos.length * 1.1 / 60)} min)`);

function variacoes(e) {
  const limpo = e.replace(/^R\.\s*/i, 'Rua ').replace(/^Av\.\s*/i, 'Avenida ').replace(/^Tv\.\s*/i, 'Travessa ');
  const semNumero = limpo.replace(/,?\s*\d+\s*[a-zA-Z]?$/, '').trim();
  return [...new Set([limpo, semNumero])].filter(Boolean);
}
async function buscar(q) {
  const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=br&viewbox=${VIEWBOX}&bounded=1&q=${encodeURIComponent(q)}`;
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(u, { headers: UA });
      if (r.status === 429) { await espera(5000); continue; }
      const j = await r.json();
      await espera(1100); // regra do Nominatim: no máximo 1 busca por segundo
      return j[0] || null;
    } catch { await espera(3000); }
  }
  return null;
}
let n = 0;
for (const e of unicos) {
  let achado = null, tentativas = 0;
  for (const q of variacoes(e)) {
    tentativas++;
    const r = await buscar(q);
    if (r) {
      const a = r.address || {};
      achado = { lat: +(+r.lat).toFixed(5), lon: +(+r.lon).toFixed(5), bairro: a.suburb || a.neighbourhood || a.quarter || a.city_district || '', precisao: tentativas === 1 ? 'exato' : 'rua' };
      break;
    }
  }
  enderecos[e] = achado;
  if (++n % 25 === 0) { writeFileSync(ARQ_END, JSON.stringify(enderecos)); console.log(`  ${n}/${unicos.length}`); }
}
writeFileSync(ARQ_END, JSON.stringify(enderecos));
const achados = Object.values(enderecos).filter(Boolean).length;
console.log(`Endereços achados: ${achados} de ${Object.keys(enderecos).length}`);

// ---------- 2) rota de cada corrida (distância e tempo de carro) ----------
const rotas = lerJSON(ARQ_ROTAS, {});
const faltam = linhas.filter(c => !c.status && enderecos[c.embarque] && enderecos[c.destino] && !(c.id in rotas));
console.log(`Rotas: ${faltam.length} pra calcular`);
n = 0;
for (const c of faltam) {
  const a = enderecos[c.embarque], b = enderecos[c.destino];
  let rota = null;
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`, { headers: UA });
    const j = await r.json();
    if (j.routes?.[0]) rota = { km: +(j.routes[0].distance / 1000).toFixed(2), min: +(j.routes[0].duration / 60).toFixed(1) };
  } catch {}
  rotas[c.id] = rota;
  await espera(1000);
  if (++n % 50 === 0) { writeFileSync(ARQ_ROTAS, JSON.stringify(rotas)); console.log(`  ${n}/${faltam.length}`); }
}
writeFileSync(ARQ_ROTAS, JSON.stringify(rotas));
console.log(`Rotas prontas: ${Object.values(rotas).filter(Boolean).length}`);

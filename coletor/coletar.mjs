// Robô coletor: mede o trânsito de cada ponto no TomTom e guarda numa linha de CSV.
// Roda sozinho no GitHub Actions (de 30 em 30 min). Pra testar no PC:
//   $env:TOMTOM_KEY = "sua-chave"; node coletor/coletar.mjs
import { readFile, appendFile, writeFile, readdir, access, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA_DADOS = path.join(RAIZ, 'dados');
const CHAVE = process.env.TOMTOM_KEY;
if (!CHAVE) { console.error('Falta a variável TOMTOM_KEY.'); process.exit(1); }

// Horário de Barreiras (UTC-3, sem horário de verão), no formato 2026-11-08T14:30-03:00
function agoraBarreiras() {
  const t = new Date(Date.now() - 3 * 3600e3);
  const p = n => String(n).padStart(2, '0');
  return {
    texto: `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}-03:00`,
    mes: `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}`
  };
}

async function medir(p) {
  const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/12/json?point=${p.lat},${p.lon}&unit=KMPH&key=${CHAVE}`;
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const r = await fetch(url);
    if (r.ok) {
      const f = (await r.json()).flowSegmentData;
      return [f.currentSpeed, f.freeFlowSpeed, f.confidence];
    }
    if (r.status === 403 || r.status === 401) throw new Error('chave recusada (' + r.status + ')');
    await new Promise(ok => setTimeout(ok, 1500));
  }
  throw new Error('TomTom não respondeu');
}

const { pontos } = JSON.parse(await readFile(path.join(RAIZ, 'pontos.json'), 'utf8'));
const { texto, mes } = agoraBarreiras();
const linhas = [];
let falhas = 0;
for (const p of pontos) {
  try {
    const [vel, livre, conf] = await medir(p);
    linhas.push(`${texto},${p.id},${vel},${livre},${conf}`);
  } catch (e) {
    falhas++;
    console.warn(`  ${p.id}: ${e.message}`);
    if (e.message.startsWith('chave')) break;
  }
  await new Promise(ok => setTimeout(ok, 150)); // não metralhar a API
}

await mkdir(PASTA_DADOS, { recursive: true });
const arquivo = path.join(PASTA_DADOS, `${mes}.csv`);
const existe = await access(arquivo).then(() => true, () => false);
if (linhas.length) {
  await appendFile(arquivo, (existe ? '' : 'quando,ponto,vel,vel_livre,confianca\n') + linhas.join('\n') + '\n');
}
// índice com a lista de arquivos, pro app saber o que carregar
const arquivos = (await readdir(PASTA_DADOS)).filter(n => /^\d{4}-\d{2}\.csv$/.test(n)).sort();
await writeFile(path.join(PASTA_DADOS, 'indice.json'), JSON.stringify({ arquivos }, null, 2) + '\n');

console.log(`${texto}: ${linhas.length} pontos medidos, ${falhas} falhas.`);
if (!linhas.length) process.exit(1);

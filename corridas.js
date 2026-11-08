// Aba "Minhas corridas": insights do histórico do InDrive (arquivos da pasta minhas-corridas, que não vai pro GitHub).
// Usa as funções e variáveis do index.html: $, esc, corDe, RAMPA, GRADIENTE_CALOR, DIAS, DIAS_LONGO, novoMapa, mapas.
(() => {
  const R = v => 'R$ ' + (isFinite(v) ? v : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const N = (v, c = 1) => (isFinite(v) ? v : 0).toFixed(c).replace('.', ',');
  const APROX_MIN = 5;      // minutos estimados indo buscar o passageiro
  const DUR_PADRAO = 12;    // minutos de corrida quando não deu pra calcular a rota
  const GAP_TURNO = 60;     // mais de 60 min sem corrida = fim do turno
  let TODAS = [], filtradas = [], camadaCalor = null;

  const mediana = arr => { if (!arr.length) return NaN; const s = [...arr].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  // descarta distância absurda (endereço posto no lugar errado pelo mapa): menos de R$ 1,20/km ou mais de R$ 15/km
  const kmValido = c => c.km >= 0.5 && c.km <= 40 && c.valor / c.km >= 1.2 && c.valor / c.km <= 15;

  async function carregar() {
    let csv, enderecos = {}, rotas = {};
    try {
      const r = await fetch('minhas-corridas/historico-indrive.csv', { cache: 'no-store' });
      if (!r.ok) throw 0;
      csv = await r.text();
    } catch { $('#corSemDados').hidden = false; return; }
    try { enderecos = await (await fetch('minhas-corridas/enderecos.json', { cache: 'no-store' })).json(); } catch {}
    try { rotas = await (await fetch('minhas-corridas/rotas.json', { cache: 'no-store' })).json(); } catch {}

    TODAS = csv.trim().split('\n').slice(1).map(l => {
      const [id, data, hora, emb, dest, valor, status] = l.split(';');
      const [y, mo, d] = data.split('-').map(Number), [hh, mm] = hora.split(':').map(Number);
      const dt = new Date(y, mo - 1, d, hh, mm);
      const rota = rotas[id] || null;
      return { id, data, hora, h: hh, dia: dt.getDay(), dt, emb, dest, valor: +valor, cancelada: !!status, status,
        a: enderecos[emb] || null, b: enderecos[dest] || null, km: rota?.km ?? null, dur: rota?.min ?? null };
    }).sort((x, y) => x.dt - y.dt);
    $('#corConteudo').hidden = false;
    $('#corRampa').style.background = `linear-gradient(90deg, ${RAMPA.join(',')})`;
    mapas.corridas = novoMapa('mapaCorridas');
    ['#corPeriodo', '#corMetricaHora', '#corFiltroDia', '#corFiltroHora'].forEach(s => $(s).onchange = s === '#corMetricaHora' ? desenharHoras : (s === '#corPeriodo' ? recalcular : redesenharMapaCorridas));
    recalcular();
  }

  // ---------- cálculos ----------
  let A = null; // resultado das análises do período escolhido
  function recalcular() {
    const p = $('#corPeriodo').value;
    const ultima = TODAS.length ? TODAS[TODAS.length - 1].dt : new Date();
    const corte = p === 'tudo' ? 0 : ultima.getTime() - (+p) * 86400e3;
    filtradas = TODAS.filter(c => c.dt.getTime() >= corte);
    A = analisar(filtradas);
    desenharKpis(); desenharInsights(); desenharHoras(); desenharGrade(); desenharFaixas(); desenharDias();
    desenharBairros(); desenharMeses(); redesenharMapaCorridas();
  }

  function analisar(lista) {
    const feitas = lista.filter(c => !c.cancelada);
    const fim = c => new Date(c.dt.getTime() + (APROX_MIN + (c.dur ?? DUR_PADRAO)) * 60e3);

    // turnos: corridas com até 60 min de intervalo
    const turnos = [];
    for (const c of feitas) {
      const t = turnos[turnos.length - 1];
      if (t && (c.dt - fim(t.corridas[t.corridas.length - 1])) / 60e3 <= GAP_TURNO) t.corridas.push(c);
      else turnos.push({ corridas: [c] });
    }
    // minutos trabalhados por (dia da semana, hora) e o tempo até a próxima corrida
    const trab = [...Array(7)].map(() => Array(24).fill(0));
    const receita = [...Array(7)].map(() => Array(24).fill(0));
    const esperas = [];
    for (const t of turnos) {
      t.ini = t.corridas[0].dt; t.fim = fim(t.corridas[t.corridas.length - 1]);
      t.receita = t.corridas.reduce((s, c) => s + c.valor, 0);
      for (let m = t.ini.getTime(); m < t.fim.getTime(); m += 5 * 60e3) { const d = new Date(m); trab[d.getDay()][d.getHours()] += 5; }
      t.corridas.forEach((c, i) => {
        const prox = t.corridas[i + 1];
        if (prox) esperas.push({ c, min: Math.max(0, (prox.dt - fim(c)) / 60e3) });
      });
    }
    feitas.forEach(c => receita[c.dia][c.h] += c.valor);
    const minTotal = turnos.reduce((s, t) => s + (t.fim - t.ini) / 60e3, 0);
    const comKm = feitas.filter(kmValido);

    // por hora do dia
    const porHora = [...Array(24)].map((_, h) => {
      const min = trab.reduce((s, d) => s + d[h], 0), rec = receita.reduce((s, d) => s + d[h], 0);
      const doH = lista.filter(c => c.h === h), feitasH = doH.filter(c => !c.cancelada), kmH = feitasH.filter(kmValido);
      return { h, min, rh: min >= 60 ? rec / (min / 60) : NaN, n: feitasH.length,
        rkm: kmH.length >= 5 ? kmH.reduce((s, c) => s + c.valor, 0) / kmH.reduce((s, c) => s + c.km, 0) : NaN,
        canc: doH.length >= 5 ? doH.filter(c => c.cancelada).length / doH.length * 100 : NaN };
    });
    // por dia da semana
    const diasTrab = [...Array(7)].map(() => new Set());
    feitas.forEach(c => diasTrab[c.dia].add(c.data));
    const porDia = [...Array(7)].map((_, d) => {
      const min = trab[d].reduce((s, x) => s + x, 0), rec = receita[d].reduce((s, x) => s + x, 0);
      return { d, rh: min >= 60 ? rec / (min / 60) : NaN, n: feitas.filter(c => c.dia === d).length, dias: diasTrab[d].size, rec };
    });
    // faixas de distância
    const faixas = [[0, 2], [2, 4], [4, 6], [6, 10], [10, 99]].map(([de, ate]) => {
      const f = comKm.filter(c => c.km >= de && c.km < ate);
      return { nome: ate === 99 ? `${de} km ou mais` : `${de} a ${ate} km`, n: f.length, rkm: f.reduce((s, c) => s + c.valor, 0) / f.reduce((s, c) => s + c.km, 0), media: f.reduce((s, c) => s + c.valor, 0) / f.length };
    }).filter(f => f.n);
    // bairros
    const agrupar = (arr, chave) => { const m = {}; arr.forEach(x => { const k = chave(x); if (k) (m[k] ||= []).push(x); }); return m; };
    const emb = Object.entries(agrupar(feitas, c => c.a?.bairro)).map(([b, cs]) => {
      const k = cs.filter(kmValido);
      return { b, n: cs.length, media: cs.reduce((s, c) => s + c.valor, 0) / cs.length, rkm: k.length >= 5 ? k.reduce((s, c) => s + c.valor, 0) / k.reduce((s, c) => s + c.km, 0) : NaN };
    }).sort((x, y) => y.n - x.n);
    const dest = Object.entries(agrupar(esperas, e => e.c.b?.bairro)).map(([b, es]) => ({ b, n: es.length, espera: mediana(es.map(e => e.min)) }))
      .filter(x => x.n >= 8).sort((x, y) => x.espera - y.espera);
    // mês a mês
    const meses = Object.entries(agrupar(lista, c => c.data.slice(0, 7))).map(([m, cs]) => {
      const f = cs.filter(c => !c.cancelada), k = f.filter(kmValido), dias = new Set(f.map(c => c.data)).size;
      return { m, n: f.length, canc: cs.length - f.length, rec: f.reduce((s, c) => s + c.valor, 0), dias,
        rkm: k.length ? k.reduce((s, c) => s + c.valor, 0) / k.reduce((s, c) => s + c.km, 0) : NaN, media: f.reduce((s, c) => s + c.valor, 0) / f.length };
    }).sort((x, y) => x.m.localeCompare(y.m));

    return { lista, feitas, turnos, trab, receita, minTotal, comKm, porHora, porDia, faixas, emb, dest, meses, esperas,
      receitaTotal: feitas.reduce((s, c) => s + c.valor, 0),
      rkm: comKm.reduce((s, c) => s + c.valor, 0) / comKm.reduce((s, c) => s + c.km, 0),
      kmMedio: mediana(comKm.map(c => c.km)), esperaMed: mediana(esperas.map(e => e.min)),
      dias: new Set(feitas.map(c => c.data)).size };
  }

  // ---------- desenho ----------
  function desenharKpis() {
    const k = [
      [A.feitas.length.toLocaleString('pt-BR'), 'corridas feitas', `${A.lista.length - A.feitas.length} canceladas`],
      [R(A.receitaTotal), 'faturamento', `${A.dias} dias rodando`],
      [R(A.receitaTotal / A.feitas.length), 'por corrida', `${N(A.feitas.length / A.dias)} corridas por dia`],
      [R(A.receitaTotal / (A.minTotal / 60)), 'por hora trabalhada', `${N(A.minTotal / 60 / A.dias)} h por dia, em média`],
      [R(A.rkm), 'por km', `corrida típica: ${N(A.kmMedio)} km`],
      [`${Math.round(A.esperaMed)} min`, 'espera entre corridas', 'mediana, dentro do turno']
    ];
    $('#corKpis').innerHTML = k.map(([v, t, r]) => `<div class="kpi"><div class="v">${v}</div><div>${t}</div><div class="r">${r}</div></div>`).join('');
    const cob = A.feitas.length ? Math.round(A.comKm.length / A.feitas.length * 100) : 0;
    $('#corInfo').textContent = `${A.lista.length} pedidos de ${fmtData(A.lista[0]?.data)} a ${fmtData(A.lista[A.lista.length - 1]?.data)} · distância calculada em ${cob}% das corridas`;
  }
  const fmtData = d => d ? d.split('-').reverse().join('/') : '';
  const faixaH = h => `${h}h–${(h + 1) % 24}h`;

  function desenharInsights() {
    const ins = [];
    const horas = A.porHora.filter(x => x.min >= 180 && isFinite(x.rh)).sort((a, b) => b.rh - a.rh);
    if (horas.length >= 4) {
      ins.push(`<b>Horários que mais rendem por hora trabalhada:</b> ${horas.slice(0, 3).map(x => `${faixaH(x.h)} (${R(x.rh)}/h)`).join(', ')}. Os mais fracos: ${horas.slice(-2).map(x => `${faixaH(x.h)} (${R(x.rh)}/h)`).join(' e ')}.`);
    }
    const dias = A.porDia.filter(x => isFinite(x.rh)).sort((a, b) => b.rh - a.rh);
    if (dias.length >= 3) ins.push(`<b>Melhor dia em R$/hora:</b> ${DIAS_LONGO[dias[0].d]} (${R(dias[0].rh)}/h). O mais fraco é ${DIAS_LONGO[dias[dias.length - 1].d]} (${R(dias[dias.length - 1].rh)}/h).`);
    const fx = A.faixas.filter(f => f.n >= 10), curtas = fx[0], longas = fx[fx.length - 1];
    if (fx.length >= 2) {
      ins.push(`<b>Corrida curta paga mais por km:</b> ${curtas.nome} rende ${R(curtas.rkm)}/km, e ${longas.nome} rende ${R(longas.rkm)}/km. ${curtas.rkm > longas.rkm * 1.3 ? 'Vale priorizar corrida curta, desde que a espera entre elas seja pequena.' : ''}`);
    }
    const kmH = A.porHora.filter(x => isFinite(x.rkm) && x.n >= 15).sort((a, b) => b.rkm - a.rkm);
    if (kmH.length >= 4) ins.push(`<b>Horário com melhor preço por km:</b> ${faixaH(kmH[0].h)} (${R(kmH[0].rkm)}/km). O pior é ${faixaH(kmH[kmH.length - 1].h)} (${R(kmH[kmH.length - 1].rkm)}/km).`);
    if (A.emb.length >= 3) {
      ins.push(`<b>Onde você mais pega passageiro:</b> ${A.emb.slice(0, 3).map(x => `${esc(x.b)} (${x.n})`).join(', ')}.`);
      const bons = A.emb.filter(x => x.n >= 15 && isFinite(x.rkm)).sort((a, b) => b.rkm - a.rkm);
      if (bons.length >= 3) ins.push(`<b>Bairro de embarque com melhor R$/km:</b> ${esc(bons[0].b)} (${R(bons[0].rkm)}/km). O pior é ${esc(bons[bons.length - 1].b)} (${R(bons[bons.length - 1].rkm)}/km).`);
    }
    if (A.dest.length >= 3) {
      const r = A.dest[0], l = A.dest[A.dest.length - 1];
      ins.push(`<b>Melhor lugar pra terminar a corrida:</b> ${esc(r.b)}, de onde a próxima sai em ~${Math.round(r.espera)} min. O pior é ${esc(l.b)}, com ~${Math.round(l.espera)} min de espera.`);
    }
    const canc = A.porHora.filter(x => isFinite(x.canc) && x.n >= 15).sort((a, b) => b.canc - a.canc);
    if (canc.length) ins.push(`<b>Cancelamento:</b> o pior horário é ${faixaH(canc[0].h)}, com ${Math.round(canc[0].canc)}% dos pedidos cancelados.`);
    const ms = A.meses.filter(m => m.n >= 30);
    if (ms.length >= 2) {
      const a = ms[0], b = ms[ms.length - 1];
      const d = (b.rkm / a.rkm - 1) * 100;
      if (isFinite(d)) ins.push(`<b>Preço por km ao longo do tempo:</b> ${R(a.rkm)}/km em ${nomeMes(a.m)} e ${R(b.rkm)}/km em ${nomeMes(b.m)} (${d >= 0 ? '+' : ''}${Math.round(d)}%).`);
    }
    $('#corInsights').innerHTML = ins.map(t => `<li>${t}</li>`).join('') || '<li class="sub">Poucos dados nesse período.</li>';
  }
  const nomeMes = m => ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+m.slice(5) - 1] + '/' + m.slice(2, 4);

  function desenharHoras() {
    const met = $('#corMetricaHora').value;
    const fmt = { rh: v => 'R$' + Math.round(v), rkm: v => N(v, 2), n: v => v, canc: v => Math.round(v) + '%' }[met];
    const nome = { rh: 'R$ por hora trabalhada', rkm: 'R$ por km', n: 'corridas', canc: '% cancelados' }[met];
    const vals = A.porHora.map(x => x[met]);
    const max = Math.max(...vals.filter(isFinite), 0.0001);
    $('#corHoras').innerHTML = A.porHora.map(x => {
      const v = x[met], ok = isFinite(v) && v > 0;
      return `<div class="col" title="${faixaH(x.h)}: ${ok ? fmt(v) + ' ' + nome : 'pouco dado'} · ${x.n} corridas · ${N(x.min / 60)} h trabalhadas">
        <span class="val">${ok ? fmt(v) : ''}</span><div class="b ${ok ? '' : 'fraco'}" style="height:${ok ? Math.max(2, v / max * 100) : 2}%"></div><span class="lbl">${x.h}</span></div>`;
    }).join('');
  }

  function desenharGrade() {
    const cel = (d, h) => A.trab[d][h] >= 60 ? A.receita[d][h] / (A.trab[d][h] / 60) : NaN;
    const vals = []; for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) { const v = cel(d, h); if (isFinite(v)) vals.push(v); }
    const min = Math.min(...vals), max = Math.max(...vals);
    let html = '<tr><th></th>' + [...Array(24)].map((_, i) => `<th>${i}</th>`).join('') + '</tr>';
    for (let d = 0; d < 7; d++) {
      html += `<tr><th>${DIAS[d]}</th>`;
      for (let h = 0; h < 24; h++) {
        const v = cel(d, h);
        const tip = `${DIAS_LONGO[d]}, ${faixaH(h)}: ` + (isFinite(v) ? `${R(v)}/h · ${N(A.trab[d][h] / 60)} h trabalhadas` : 'pouco dado');
        html += `<td title="${tip}" style="cursor:default;${isFinite(v) ? `background:${corDe(max > min ? (v - min) / (max - min) : .5)}` : ''}"></td>`;
      }
      html += '</tr>';
    }
    $('#corGrade').innerHTML = html;
  }

  function barrasH(el, itens) {
    const max = Math.max(...itens.map(i => i.v).filter(isFinite), 0.0001);
    el.innerHTML = itens.map(i => `<div class="barra-h"><span>${i.nome}</span><div class="trilho"><div class="enche" style="width:${isFinite(i.v) ? i.v / max * 100 : 0}%"></div></div><span class="num">${i.txt}</span></div>`).join('');
  }
  function desenharFaixas() {
    barrasH($('#corFaixas'), A.faixas.map(f => ({ nome: f.nome, v: f.rkm, txt: `${R(f.rkm)}/km · ${f.n}` })));
    $('#corFaixas').insertAdjacentHTML('beforeend', '<p class="sub">R$ por km · número de corridas. A distância é a rota de carro entre o embarque e o destino.</p>');
  }
  function desenharDias() {
    barrasH($('#corDias'), [1, 2, 3, 4, 5, 6, 0].map(d => { const x = A.porDia[d]; return { nome: DIAS_LONGO[d], v: x.rh, txt: isFinite(x.rh) ? `${R(x.rh)}/h · ${x.dias} dias` : '—' }; }));
    $('#corDias').insertAdjacentHTML('beforeend', '<p class="sub">R$ por hora trabalhada · quantos dias você rodou nesse dia da semana.</p>');
  }

  function desenharBairros() {
    $('#corBairrosEmb').innerHTML = '<tr><th>Bairro</th><th class="n">Corridas</th><th class="n">Média</th><th class="n">R$/km</th></tr>' +
      A.emb.slice(0, 15).map(x => `<tr><td>${esc(x.b)}</td><td class="n">${x.n}</td><td class="n">${R(x.media)}</td><td class="n">${isFinite(x.rkm) ? N(x.rkm, 2) : '—'}</td></tr>`).join('');
    $('#corBairrosDest').innerHTML = '<tr><th>Terminou em</th><th class="n">Vezes</th><th class="n">Próxima em</th></tr>' +
      A.dest.slice(0, 15).map(x => `<tr><td>${esc(x.b)}</td><td class="n">${x.n}</td><td class="n">~${Math.round(x.espera)} min</td></tr>`).join('');
  }

  function desenharMeses() {
    $('#corMeses').innerHTML = '<tr><th>Mês</th><th class="n">Dias</th><th class="n">Corridas</th><th class="n">Canceladas</th><th class="n">Faturamento</th><th class="n">Por corrida</th><th class="n">R$/km</th></tr>' +
      A.meses.map(m => `<tr><td>${nomeMes(m.m)}</td><td class="n">${m.dias}</td><td class="n">${m.n}</td><td class="n">${m.canc}</td><td class="n">${R(m.rec)}</td><td class="n">${R(m.media)}</td><td class="n">${isFinite(m.rkm) ? N(m.rkm, 2) : '—'}</td></tr>`).join('');
  }

  window.redesenharMapaCorridas = function () {
    if (!mapas.corridas || !A) return;
    const fd = $('#corFiltroDia').value, fh = $('#corFiltroHora').value;
    let pts = A.feitas.filter(c => c.a);
    if (fd === 'util') pts = pts.filter(c => c.dia >= 1 && c.dia <= 5);
    if (fd === 'fds') pts = pts.filter(c => c.dia === 0 || c.dia === 6);
    if (fh) { const [de, ate] = fh.split('-').map(Number); pts = pts.filter(c => de < ate ? c.h >= de && c.h < ate : c.h >= de || c.h < ate); }
    if (camadaCalor) { mapas.corridas.removeLayer(camadaCalor); camadaCalor = null; }
    if (mapas.corridas.getSize().x > 0 && pts.length) {
      camadaCalor = L.heatLayer(pts.map(c => [c.a.lat, c.a.lon, 0.6]), { radius: 22, blur: 18, max: 3, minOpacity: 0.3, gradient: GRADIENTE_CALOR }).addTo(mapas.corridas);
    }
    const semLocal = A.feitas.length - A.feitas.filter(c => c.a).length;
    $('#corMapaInfo').textContent = `${pts.length} embarques no mapa` + (semLocal ? ` · ${semLocal} corridas ficaram de fora porque o endereço não foi achado no mapa` : '') + '.';
  };

  window.carregarCorridas = carregar;
})();

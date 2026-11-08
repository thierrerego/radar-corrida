# Radar Corrida

Mapa de calor do movimento em **Barreiras (BA)** pra decidir se vale sair de casa pra rodar de InDrive.

- **Agora:** trânsito ao vivo do TomTom nos 29 pontos de `pontos.json`, com mapa de calor, ranking e um veredito ("Vale sair", "Talvez", "Fraco").
- **Melhores horários:** grade dia × hora com o movimento médio, montada com o histórico que o robô guarda.
- **Agenda:** pontos e horários previsíveis (saída de faculdade, troca de turno, rodoviária, eventos). Os iniciais são palpites, edite pelo app.

## Como abrir
Dois cliques em `abrir.bat`. Ele puxa os dados novos do GitHub, liga um servidorzinho em `http://localhost:8794` e abre o Chrome.
Na primeira vez, clique em **⚙ Chave TomTom** e cole sua chave (conta grátis em developer.tomtom.com).

## O robô (GitHub Actions)
`.github/workflows/coletar.yml` roda `coletor/coletar.mjs` de 30 em 30 min. Ele mede os 29 pontos e grava uma linha por ponto em `dados/AAAA-MM.csv`:

```
quando,ponto,vel,vel_livre,confianca
2026-11-08T14:30-03:00,rodoviaria,32,45,0.97
```

"Movimento" = quanto a velocidade caiu em relação à rua livre (0% = livre, 100% = metade da velocidade ou pior).
A chave fica no secret `TOMTOM_KEY` do repo, nunca no código.

Testar o robô no PC:
```powershell
$env:TOMTOM_KEY = "sua-chave"; node coletor/coletar.mjs
```

## Limites grátis
- TomTom: 2.500 consultas por dia. O robô usa ~1.400 (29 pontos × 48 vezes) e cada "Medir agora" usa 29.
- GitHub Actions: o repo é público, então os minutos são ilimitados. A chave do TomTom fica no secret, invisível pra quem vê o repo.

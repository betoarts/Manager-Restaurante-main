# Plano: Ajustes Layout Garcom Mobile + WebSocket Rapido

## 1. Nome do Restaurante na AppBar

**Problema:** AppBar mostra "Garcom" fixo, nao o nome real do restaurante.

**Solução:** Ler `company.nome` do `useStore()` e exibir no lugar de "Garcom". Se `company` for null, fallback para "Garcom".

**Arquivo:** `frontend/src/pages/GarcomMobile.tsx` — linha ~691

## 2. Detalhes dos Produtos Melhorados

**Problema:** Card de produto mostra nome, descricao (2 linhas), preco. Sem imagem, sem setor.

**Solução:**
- Mostrar `imagem_url` do produto como thumbnail (se disponivel, fallback para icone do setor)
- Badge do setor (usando `setor_id` mapeado via nome ou icone)
- Layout: thumbnail quadrada no topo com overlay gradiente → nome → descricao → preco com badge do setor
- Card com sombra suave e borda arredondada (borderRadius: 14px)

**Arquivo:** `frontend/src/pages/GarcomMobile.tsx` — secao renderOrderView, Grid de produtos

## 3. Mesas Auto-Ajustaveis com Scroll Suave

**Problema:** Grid fixo de 3 colunas nao se adapta a quantidade de mesas. Scroll padrao do browser sem suavidade.

**Solução:**
- Usar `overflow-y: auto` com `-webkit-overflow-scrolling: touch` e `scroll-behavior: smooth`
- Ajustar numero de colunas dinamicamente baseado na quantidade:
  - <= 6 mesas ocupadas: 3 colunas (cards maiores)
  - 7-12: 4 colunas (cards medios)
  - > 12: 5 colunas (cards compactos)
- Mesmas regras para mesas livres (wrap flexivel)
- Adicionar `overscroll-behavior: contain` para evitar bounce indesejado

**Arquivo:** `frontend/src/pages/GarcomMobile.tsx` — funcao renderTableView

## 4. WebSocket Mais Rapido

**Problema:** Reconexao a cada 5 segundos, delay na propagacao de mudancas de status, notificacoes podem demorar.

**Solução:**
- Reduzir intervalo de reconexao de 5000ms para 1000ms
- Adicionar logica de retry com backoff nao-linear (1s → 1s → 2s → 3s → 5s → 10s, max 10s)
- Melhorar o handler `order_ready_dispatch` no store para processar imediatamente
- Garantir que o evento `order_ready_dispatch` atualiza `waiterReadyOrders` sem delay
- Adicionar som/vibracao para notificacoes criticas (opcional, via Web Notifications API)

**Arquivos:**
- `frontend/src/store/useStore.ts` — connectWebSocket (linha 210-270)
- `frontend/src/pages/GarcomMobile.tsx` — useEffect de reconexao

## Ordem de Implementacao

1. Nome do restaurante na AppBar
2. Detalhes dos produtos melhorados
3. Mesas auto-ajustaveis com scroll suave
4. WebSocket mais rapido

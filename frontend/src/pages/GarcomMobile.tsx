import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Button,
  IconButton,
  TextField,
  MenuItem,
  Chip,
  Divider,
  List,
  ListItem,
  Badge,
  Checkbox,
  FormControlLabel,
  useTheme,
  Tabs,
  Tab,
  Stack,
  AppBar,
  Snackbar,
  Alert as MuiAlert,
  CircularProgress,
  BottomNavigation,
  BottomNavigationAction,
  Slide,
  Fade,
  Avatar,
  keyframes,
  Dialog,
  DialogTitle,
  DialogContent,
} from '@mui/material';
import {
  LogOut,
  Wifi,
  WifiOff,
  ShoppingBag,
  ArrowRightLeft,
  ChevronLeft,
  Plus,
  Minus,
  CheckCircle2,
  Clock,
  Printer,
  Grid3X3,
  Receipt,
  UtensilsCrossed,
  Bell,
  Circle,
  ArrowRight,
  Maximize,
  Minimize,
  RefreshCw,
  DollarSign,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { api } from '../utils/api';
import type { Mesa, Produto, Categoria, Pedido } from '../types';

export const GarcomMobile: React.FC = () => {
  const theme = useTheme();
  const { user, company, logout, socketConnected, waiterReadyOrders, dismissWaiterReadyOrder, tables: storeTables } = useStore();
  const queryClient = useQueryClient();

  // Navigation states
  const [viewState, setViewState] = useState<'list' | 'detail' | 'order' | 'transfer'>('list');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => { });
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => { });
    }
  };

  // Listen for fullscreen change (e.g. user exits via gesture)
  React.useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);
  const [selectedTable, setSelectedTable] = useState<Mesa | null>(null);

  // Cart
  const [cart, setCart] = useState<Array<{ produto: Produto; quantidade: number; observacao: string }>>([]);
  const [activeCategoryTab, setActiveCategoryTab] = useState(0);

  // Transfer
  const [transferAll, setTransferAll] = useState(true);
  const [targetTableId, setTargetTableId] = useState<string>('');
  const [selectedItemIds, setSelectedItemIds] = useState<Record<number, boolean>>({});

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  // Bottom nav
  const [bottomNav, setBottomNav] = useState(0);

  // Fetch Tables (initial load + manual refresh)
  const { data: apiTables = [], refetch: refetchTables, isRefetching: tablesRefetching } = useQuery<Mesa[]>({
    queryKey: ['garcom-tables'],
    queryFn: () => api.get<Mesa[]>('/api/tables'),
    staleTime: 0,
  });

  // Merge: store (real-time WebSocket) overlays API data for instant updates
  const storeMap = new Map(storeTables.map((t) => [t.id, t]));
  const tables = apiTables.map((t) => storeMap.get(t.id) || t);

  const handleManualReload = async () => {
    useStore.getState().setTables([]);
    await refetchTables();
    if (selectedTable) {
      await refetchOrders();
    }
  };

  React.useEffect(() => {
    if (socketConnected) refetchTables();
  }, [socketConnected, refetchTables]);

  // Force refetch on any store table update (from WebSocket events)
  const prevStoreLen = React.useRef(storeTables.length);
  React.useEffect(() => {
    if (storeTables.length !== prevStoreLen.current) {
      refetchTables();
      prevStoreLen.current = storeTables.length;
    }
  }, [storeTables, refetchTables]);

  // Fetch Table Orders (for detail view)
  const { data: tableOrders = [], refetch: refetchOrders } = useQuery<Pedido[]>({
    queryKey: ['garcom-table-orders', selectedTable?.id],
    queryFn: () => api.get<Pedido[]>(`/api/tables/${selectedTable?.id}/orders`),
    enabled: !!selectedTable,
  });

  // Fetch Products & Categories
  const { data: products = [] } = useQuery<Produto[]>({
    queryKey: ['garcom-products'],
    queryFn: () => api.get<Produto[]>('/api/products'),
  });

  const { data: categories = [] } = useQuery<Categoria[]>({
    queryKey: ['garcom-categories'],
    queryFn: () => api.get<Categoria[]>('/api/categories'),
  });

  // Fetch Caixa Status
  const { data: caixaStatus } = useQuery<{ status: string }>({
    queryKey: ['caixa-status'],
    queryFn: () => api.get<any>('/api/caixa/status'),
    refetchInterval: 15000,
  });

  const [caixaClosedModalOpen, setCaixaClosedModalOpen] = useState(false);

  const checkCaixaAndProceed = (action: () => void) => {
    if (caixaStatus && caixaStatus.status !== 'aberto') {
      setCaixaClosedModalOpen(true);
    } else {
      action();
    }
  };

  const filteredProducts = products.filter((p) => {
    if (p.tipo === 'insumo') return false;
    if (categories.length === 0) return true;
    const cat = categories[activeCategoryTab];
    return cat ? p.categoria_id === cat.id : true;
  });

  // Mutations
  const openTableMutation = useMutation({
    mutationFn: (tableId: number) => api.put<Mesa>(`/api/tables/${tableId}`, { status: 'ocupada' }),
    onSuccess: () => refetchTables(),
  });

  const orderMutation = useMutation({
    mutationFn: (data: any) => api.post<any>('/api/orders', data),
    onSuccess: () => {
      setSnackbar({ msg: 'Pedido lancado com sucesso!', sev: 'success' });
      setCart([]);
      refetchOrders();
      refetchTables();
      setViewState('detail');
    },
    onError: (err: any) => {
      setSnackbar({ msg: err.message || 'Erro ao lancar pedido', sev: 'error' });
    },
  });

  const transferMutation = useMutation({
    mutationFn: (payload: any) => api.post('/api/tables/transfer', payload),
    onSuccess: () => {
      setSnackbar({ msg: 'Transferencia realizada!', sev: 'success' });
      refetchOrders();
      refetchTables();
      setViewState('detail');
    },
    onError: (err: any) => {
      setSnackbar({ msg: err.message || 'Erro na transferencia', sev: 'error' });
    },
  });

  const closeTableMutation = useMutation({
    mutationFn: (tableId: number) => api.post(`/api/tables/close/${tableId}`, {}),
    onSuccess: () => {
      setSnackbar({ msg: 'Fechamento solicitado ao caixa!', sev: 'success' });
      refetchTables();
    },
  });

  // Cart helpers
  const addToCart = (produto: Produto) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.produto.id === produto.id);
      if (existing) {
        return prev.map((i) =>
          i.produto.id === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i
        );
      }
      return [...prev, { produto, quantidade: 1, observacao: '' }];
    });
  };

  const removeFromCart = (produtoId: number) =>
    setCart((prev) => prev.filter((i) => i.produto.id !== produtoId));

  const updateQty = (produtoId: number, qty: number) => {
    if (qty <= 0) { removeFromCart(produtoId); return; }
    setCart((prev) => prev.map((i) => i.produto.id === produtoId ? { ...i, quantidade: qty } : i));
  };

  const cartTotal = cart.reduce((s, i) => s + i.produto.preco * i.quantidade, 0);

  const handleSubmitOrder = () => {
    if (!selectedTable || cart.length === 0) return;
    if (selectedTable.status === 'livre') {
      openTableMutation.mutate(selectedTable.id);
    }
    orderMutation.mutate({
      mesa_id: selectedTable.id,
      origem: 'mesa',
      itens: cart.map((i) => ({
        produto_id: i.produto.id,
        quantidade: i.quantidade,
        observacao: i.observacao,
      })),
    });
  };

  const handleTransferSubmit = () => {
    if (!selectedTable || !targetTableId) return;
    const payload: any = { from_mesa_id: selectedTable.id, to_mesa_id: Number(targetTableId), transfer_all: transferAll };
    if (!transferAll) {
      const ids = Object.keys(selectedItemIds).filter((k) => selectedItemIds[Number(k)]).map(Number);
      if (ids.length === 0) return;
      payload.item_ids = ids;
    }
    transferMutation.mutate(payload);
  };

  // Flatten items
  const allItems = tableOrders.flatMap((o) => o.itens);
  const tableTotal = tableOrders.reduce((s, o) => s + o.total, 0);

  // Status colors
  const statusColors: Record<string, { bg: string; color: string; label: string }> = {
    livre: { bg: '#1b4332', color: '#52b788', label: 'Livre' },
    ocupada: { bg: '#3d0000', color: '#e63946', label: 'Ocupada' },
    reservada: { bg: '#432e00', color: '#ffb703', label: 'Reservada' },
    em_fechamento: { bg: '#2d0050', color: '#c77dff', label: 'Fechando' },
  };

  const itemStatusMap: Record<string, { color: string; icon: React.ReactNode }> = {
    recebido: { color: '#4895ef', icon: <Clock size={10} /> },
    produzindo: { color: '#ffb703', icon: <Clock size={10} /> },
    pronto: { color: '#52b788', icon: <CheckCircle2 size={10} /> },
    despachado: { color: '#c77dff', icon: <CheckCircle2 size={10} /> },
    entregue: { color: '#8d99ae', icon: <CheckCircle2 size={10} /> },
  };

  // ====== Aesthetic constants ======
  const spin = keyframes`
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  `;
  const bgColor = '#0f111a'; // Softer dark background
  const surfaceColor = 'rgba(20, 22, 33, 0.85)'; // Glassmorphism effect
  const cardColor = 'rgba(30, 32, 48, 0.6)';
  const accentColor = '#ff6b35';
  const accentColor2 = '#ffb703';
  const textPrimary = '#f8fafc';
  const textSecondary = '#cbd5e1';
  const borderColor = 'rgba(255, 255, 255, 0.08)';

  // Simulação de notificação
  const handleTestNotification = () => {
    const mockOrder = {
      id: Date.now(),
      mesa_id: tables[0]?.id || 1,
      origem: 'mesa',
      status: 'pronto',
      total: 0,
      itens: []
    } as any;
    useStore.setState((state: any) => ({
      waiterReadyOrders: [...state.waiterReadyOrders, mockOrder]
    }));
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }
  };

  React.useEffect(() => {
    if (waiterReadyOrders.length > 0) {
      setSnackbar({ msg: 'Notificação: Pedido pronto no balcão!', sev: 'info' as any });
    }
  }, [waiterReadyOrders.length]);

  // Tables grid view
  const renderTableView = () => {
    const occupiedTables = tables.filter((t) => t.status === 'ocupada' || t.status === 'em_fechamento');
    const freeTables = tables.filter((t) => t.status === 'livre' || t.status === 'reservada');

    return (
      <Box sx={{ pb: 2 }}>
        {/* Notifications banner */}
        {waiterReadyOrders.length > 0 && (() => {
          // Build per-table summary
          const tableMap = new Map<number, number>(); // mesa_numero -> count
          waiterReadyOrders.forEach((o) => {
            if (o.mesa_id) {
              const mesaNum = tables.find((t) => t.id === o.mesa_id)?.numero || o.mesa_id;
              tableMap.set(mesaNum, (tableMap.get(mesaNum) || 0) + 1);
            }
          });

          const summary = Array.from(tableMap.entries())
            .map(([num, count]) => `Mesa ${num}${count > 1 ? ` (${count}x)` : ''}`)
            .join(', ');

          return (
            <Paper
              elevation={0}
              sx={{
                mx: 2, mt: 2, mb: 1, p: 2, borderRadius: 4,
                background: `linear-gradient(135deg, ${accentColor}20, ${accentColor2}15)`,
                border: `1px solid ${accentColor}40`,
                display: 'flex', alignItems: 'center', gap: 1.5,
              }}
            >
              <Bell size={18} color={accentColor2} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ color: accentColor2, fontWeight: 600, fontSize: 12 }}>
                  Pedido pronto para retirada!
                </Typography>
                <Typography variant="caption" sx={{ color: accentColor2, fontWeight: 800, opacity: 0.85, fontSize: 11 }}>
                  {summary}
                </Typography>
              </Box>
              <Button
                size="small"
                sx={{ color: accentColor, fontWeight: 700, fontSize: '11px', minWidth: 'auto' }}
                onClick={() => waiterReadyOrders.forEach((o) => dismissWaiterReadyOrder(o.id))}
              >
                OK
              </Button>
            </Paper>
          );
        })()}

        {/* Occupied tables section */}
        {occupiedTables.length > 0 && (
          <Box sx={{ px: 2, mb: 2 }}>
            <Typography variant="overline" sx={{ color: accentColor, fontWeight: 800, letterSpacing: 1.5, fontSize: '10px' }}>
              Mesas Ativas
            </Typography>
            <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
              {occupiedTables.map((table) => (
                <Grid size={{ xs: occupiedTables.length <= 6 ? 4 : occupiedTables.length <= 12 ? 3 : 2 }} key={table.id}>
                  <Card
                    onClick={() => { setSelectedTable(table); setViewState('detail'); }}
                    sx={{
                      bgcolor: cardColor,
                      borderRadius: 3,
                      border: `1px solid ${statusColors[table.status]?.color || '#333'}40`,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      '&:active': { transform: 'scale(0.96)', opacity: 0.8 },
                    }}
                  >
                    <CardContent sx={{ p: 1.5, textAlign: 'center', '&:last-child': { pb: 1.5 } }}>
                      <Avatar sx={{ width: 40, height: 40, bgcolor: statusColors[table.status]?.bg, color: statusColors[table.status]?.color, mx: 'auto', mb: 1, fontSize: 16, fontWeight: 800 }}>
                        {table.numero}
                      </Avatar>
                      <Typography variant="caption" sx={{ color: statusColors[table.status]?.color, fontWeight: 700, fontSize: '10px' }}>
                        {statusColors[table.status]?.label}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}

        {/* Free tables section */}
        <Box sx={{ px: 2 }}>
          <Typography variant="overline" sx={{ color: textSecondary, fontWeight: 800, letterSpacing: 1.5, fontSize: '10px' }}>
            Mesas Disponiveis
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
            {freeTables.map((table) => (
              <Card
                key={table.id}
                onClick={() => checkCaixaAndProceed(() => { setSelectedTable(table); setViewState('detail'); })}
                sx={{
                  bgcolor: cardColor,
                  borderRadius: 2.5,
                  border: `1px solid ${borderColor}`,
                  cursor: 'pointer',
                  minWidth: 64,
                  textAlign: 'center',
                  p: 1.2,
                  transition: 'all 0.2s',
                  '&:active': { transform: 'scale(0.95)', opacity: 0.7 },
                }}
              >
                <Typography sx={{ color: textPrimary, fontWeight: 800, fontSize: 18 }}>{table.numero}</Typography>
                <Typography variant="caption" sx={{ color: textSecondary, fontSize: '9px' }}>{table.capacidade} lugares</Typography>
              </Card>
            ))}
          </Box>
        </Box>
      </Box>
    );
  };

  // Table detail view
  const renderDetailView = () => (
    <Box sx={{ pb: 2 }}>
      {/* Header */}
      <Box sx={{ px: 2, pt: 1, pb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <IconButton onClick={() => setViewState('list')} size="small" sx={{ color: textSecondary }}>
          <ChevronLeft size={22} />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ color: textPrimary, fontWeight: 800, fontSize: 20 }}>
            Mesa {selectedTable?.numero}
          </Typography>
        </Box>
        <Chip
          label={statusColors[selectedTable?.status || 'livre']?.label}
          size="small"
          sx={{
            bgcolor: statusColors[selectedTable?.status || 'livre']?.bg,
            color: statusColors[selectedTable?.status || 'livre']?.color,
            fontWeight: 800,
            fontSize: '10px',
            height: 24,
          }}
        />
      </Box>

      {/* Items consumed */}
      <Box sx={{ px: 2 }}>
        {allItems.length === 0 ? (
          <Paper sx={{ bgcolor: cardColor, borderRadius: 4, p: 4, textAlign: 'center', border: `1px solid ${borderColor}` }}>
            <UtensilsCrossed size={36} color={textSecondary} style={{ opacity: 0.4, marginBottom: 12 }} />
            <Typography sx={{ color: textSecondary, fontWeight: 600, fontSize: 14 }}>Nenhum pedido ainda</Typography>
            <Typography variant="caption" sx={{ color: textSecondary, opacity: 0.7 }}>Lance itens para esta mesa</Typography>
          </Paper>
        ) : (
          <Paper sx={{ bgcolor: cardColor, borderRadius: 4, overflow: 'hidden', border: `1px solid ${borderColor}` }}>
            <Box sx={{ p: 2, borderBottom: `1px solid ${borderColor}` }}>
              <Typography sx={{ color: textSecondary, fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: 1 }}>
                Consumo Atual
              </Typography>
            </Box>
            {allItems.map((item, idx) => (
              <Box key={idx} sx={{ px: 2, py: 1.5, borderBottom: idx < allItems.length - 1 ? `1px solid ${borderColor}` : 'none' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.3 }}>
                  <Typography sx={{ color: textPrimary, fontWeight: 700, fontSize: 14 }}>
                    {item.quantidade}x {item.produto_nome}
                  </Typography>
                  <Typography sx={{ color: accentColor, fontWeight: 700, fontSize: 14 }}>
                    R$ {(item.preco_unitario * item.quantidade).toFixed(2)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: itemStatusMap[item.status]?.color || '#666' }} />
                  <Typography variant="caption" sx={{ color: textSecondary, textTransform: 'capitalize', fontSize: '11px' }}>
                    {item.status}
                  </Typography>
                  {item.observacao && (
                    <Typography variant="caption" sx={{ color: accentColor2, fontSize: '10px' }}>
                      * {item.observacao}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
            <Box sx={{ px: 2, py: 2, bgcolor: '#0d0d16', display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ color: textPrimary, fontWeight: 800, fontSize: 16 }}>Total</Typography>
              <Typography sx={{ color: accentColor2, fontWeight: 800, fontSize: 18 }}>R$ {tableTotal.toFixed(2)}</Typography>
            </Box>
          </Paper>
        )}
      </Box>

      {/* Action buttons */}
      <Box sx={{ px: 2, mt: 2, display: 'flex', gap: 1 }}>
        <Button
          variant="contained"
          fullWidth
          onClick={() => checkCaixaAndProceed(() => { setCart([]); setViewState('order'); })}
          sx={{
            bgcolor: accentColor, borderRadius: 3, py: 1.5, fontWeight: 800, fontSize: 14,
            '&:hover': { bgcolor: '#ff7b50' },
          }}
          startIcon={<ShoppingBag size={18} />}
        >
          Lancar Itens
        </Button>
        <Button
          variant="outlined"
          fullWidth
          onClick={() => checkCaixaAndProceed(() => { setTransferAll(true); setTargetTableId(''); setSelectedItemIds({}); setViewState('transfer'); })}
          disabled={allItems.length === 0}
          sx={{
            borderRadius: 3, py: 1.5, fontWeight: 700, fontSize: 13,
            color: accentColor2, borderColor: `${accentColor2}50`,
            '&:hover': { borderColor: accentColor2, bgcolor: `${accentColor2}10` },
          }}
          startIcon={<ArrowRightLeft size={18} />}
        >
          Transferir
        </Button>
      </Box>

      {/* Close table button */}
      <Box sx={{ px: 2, mt: 1 }}>
        <Button
          fullWidth
          variant="text"
          disabled={selectedTable?.status === 'livre'}
          onClick={() => selectedTable && closeTableMutation.mutate(selectedTable.id)}
          sx={{
            borderRadius: 3, py: 1.2, fontWeight: 600, fontSize: 12,
            color: '#e63946',
            '&:hover': { bgcolor: '#e6394620' },
          }}
        >
          Solicitar Fechamento da Mesa
        </Button>
      </Box>
    </Box>
  );

  // Order catalog + cart view
  const renderOrderView = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top bar */}
      <Box sx={{ px: 2, pt: 1, pb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <IconButton onClick={() => setViewState('detail')} size="small" sx={{ color: textSecondary }}>
          <ChevronLeft size={22} />
        </IconButton>
        <Typography sx={{ color: textPrimary, fontWeight: 800, fontSize: 16 }}>
          Mesa {selectedTable?.numero}
        </Typography>
        <Badge badgeContent={cart.length} sx={{ ml: 'auto', '& .MuiBadge-badge': { bgcolor: accentColor, color: '#fff', fontWeight: 800 } }} />
      </Box>

      {/* Categories */}
      <Box sx={{ px: 1 }}>
        <Tabs
          value={activeCategoryTab}
          onChange={(_, v) => setActiveCategoryTab(v)}
          variant="scrollable"
          scrollButtons={false}
          sx={{ minHeight: 38, '& .MuiTab-root': { minHeight: 38, py: 0.5, fontSize: '11px', fontWeight: 700, color: textSecondary, textTransform: 'none' }, '& .Mui-selected': { color: `${accentColor} !important` }, '& .MuiTabs-indicator': { bgcolor: accentColor } }}
        >
          {categories.map((cat) => <Tab key={cat.id} label={cat.nome} />)}
        </Tabs>
      </Box>

      {/* Products grid */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, pt: 1 }}>
        <Grid container spacing={1.5}>
          {filteredProducts.map((prod) => (
            <Grid size={{ xs: 6 }} key={prod.id}>
              <Card
                onClick={() => addToCart(prod)}
                sx={{
                  bgcolor: cardColor,
                  borderRadius: '14px',
                  border: `1px solid ${borderColor}`,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  transition: 'all 0.15s',
                  '&:active': { transform: 'scale(0.97)', bgcolor: '#1a1a2e' },
                }}
              >
                {/* Thumbnail with gradient overlay */}
                <Box sx={{ position: 'relative', height: 90, bgcolor: '#1a1a28' }}>
                  {prod.imagem_url ? (
                    <Box
                      component="img"
                      src={prod.imagem_url}
                      alt={prod.nome}
                      sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                      <UtensilsCrossed size={28} color={textSecondary} opacity={0.3} />
                    </Box>
                  )}
                  {/* Gradient overlay */}
                  <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }} />
                  {/* Sector badge */}
                  {prod.setor_id && (
                    <Chip
                      label={categories.find(c => c.id === prod.setor_id)?.nome || 'Setor ' + prod.setor_id}
                      size="small"
                      sx={{
                        position: 'absolute', top: 6, right: 6,
                        bgcolor: 'rgba(0,0,0,0.5)', color: accentColor2,
                        fontWeight: 700, fontSize: '8px', height: 18,
                        backdropFilter: 'blur(4px)',
                      }}
                    />
                  )}
                </Box>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography sx={{ color: textPrimary, fontWeight: 700, fontSize: 13, mb: 0.2, lineClamp: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {prod.nome}
                  </Typography>
                  <Typography variant="caption" sx={{ color: textSecondary, fontSize: '10px', lineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', mb: 1, height: 24 }}>
                    {prod.descricao || 'Sem descricao'}
                  </Typography>
                  <Typography sx={{ color: accentColor, fontWeight: 800, fontSize: 15 }}>
                    R$ {prod.preco.toFixed(2)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* Cart preview */}
      {cart.length > 0 && (
        <Paper sx={{ bgcolor: surfaceColor, borderRadius: '20px 20px 0 0', border: `1px solid ${borderColor}`, borderBottom: 'none', p: 2, maxHeight: '45%', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5, alignItems: 'center' }}>
            <Typography sx={{ color: textPrimary, fontWeight: 800, fontSize: 14 }}>
              Carrinho ({cart.length})
            </Typography>
            <Typography sx={{ color: accentColor2, fontWeight: 800, fontSize: 16 }}>
              R$ {cartTotal.toFixed(2)}
            </Typography>
          </Box>

          <Box sx={{ flex: 1, overflowY: 'auto', mb: 1.5 }}>
            {cart.map((item, idx) => (
              <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.7, borderBottom: idx < cart.length - 1 ? `1px solid ${borderColor}` : 'none' }}>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ color: textPrimary, fontWeight: 600, fontSize: 12 }}>{item.produto.nome}</Typography>
                  <TextField
                    placeholder="Obs. (ex: sem cebola)"
                    variant="standard"
                    fullWidth
                    size="small"
                    value={item.observacao}
                    onChange={(e) => {
                      setCart((prev) => prev.map((i) => i.produto.id === item.produto.id ? { ...i, observacao: e.target.value } : i));
                    }}
                    sx={{ mt: 0.3, '& .MuiInput-input': { color: textSecondary, fontSize: 10 }, '& .MuiInput-underline:before': { borderColor: borderColor } }}
                  />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: cardColor, borderRadius: 2, p: 0.2 }}>
                  <IconButton size="small" onClick={() => updateQty(item.produto.id, item.quantidade - 1)} sx={{ color: textSecondary, p: 0.3 }}>
                    <Minus size={12} />
                  </IconButton>
                  <Typography sx={{ color: textPrimary, fontWeight: 700, fontSize: 13, minWidth: 16, textAlign: 'center' }}>{item.quantidade}</Typography>
                  <IconButton size="small" onClick={() => updateQty(item.produto.id, item.quantidade + 1)} sx={{ color: accentColor, p: 0.3 }}>
                    <Plus size={12} />
                  </IconButton>
                </Box>
                <Typography sx={{ color: accentColor, fontWeight: 700, fontSize: 12, minWidth: 50, textAlign: 'right' }}>
                  R$ {(item.produto.preco * item.quantidade).toFixed(2)}
                </Typography>
              </Box>
            ))}
          </Box>

          <Button
            variant="contained"
            fullWidth
            disabled={orderMutation.isPending}
            onClick={handleSubmitOrder}
            sx={{
              bgcolor: accentColor, borderRadius: 3, py: 1.5, fontWeight: 800, fontSize: 14,
              '&:hover': { bgcolor: '#ff7b50' },
            }}
            startIcon={orderMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <Printer size={16} />}
          >
            {orderMutation.isPending ? 'Enviando...' : 'Confirmar Pedido'}
          </Button>
        </Paper>
      )}
    </Box>
  );

  // Transfer view
  const renderTransferView = () => (
    <Box sx={{ px: 2 }}>
      <Box sx={{ pt: 1, pb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <IconButton onClick={() => setViewState('detail')} size="small" sx={{ color: textSecondary }}>
          <ChevronLeft size={22} />
        </IconButton>
        <Typography sx={{ color: textPrimary, fontWeight: 800, fontSize: 16 }}>Transferir Mesa {selectedTable?.numero}</Typography>
      </Box>

      {/* Type selector */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6 }}>
          <Button
            variant={transferAll ? 'contained' : 'outlined'}
            fullWidth
            onClick={() => setTransferAll(true)}
            sx={{
              borderRadius: 3, py: 1.2, fontWeight: 700, fontSize: 13,
              ...(transferAll ? { bgcolor: accentColor, '&:hover': { bgcolor: '#ff7b50' } } : { color: textSecondary, borderColor: borderColor }),
            }}
          >
            Mesa Inteira
          </Button>
        </Grid>
        <Grid size={{ xs: 6 }}>
          <Button
            variant={!transferAll ? 'contained' : 'outlined'}
            fullWidth
            onClick={() => setTransferAll(false)}
            sx={{
              borderRadius: 3, py: 1.2, fontWeight: 700, fontSize: 13,
              ...(!transferAll ? { bgcolor: accentColor, '&:hover': { bgcolor: '#ff7b50' } } : { color: textSecondary, borderColor: borderColor }),
            }}
          >
            Itens Parciais
          </Button>
        </Grid>
      </Grid>

      {!transferAll && (
        <Paper sx={{ bgcolor: cardColor, borderRadius: 3, p: 2, mb: 2, border: `1px solid ${borderColor}` }}>
          <Typography sx={{ color: textSecondary, fontWeight: 600, fontSize: 11, mb: 1 }}>Selecione os itens:</Typography>
          {allItems.map((item) => (
            <FormControlLabel
              key={item.id}
              control={
                <Checkbox
                  size="small"
                  checked={item.id ? !!selectedItemIds[item.id] : false}
                  onChange={(e) => item.id && setSelectedItemIds((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                  sx={{ color: accentColor, '&.Mui-checked': { color: accentColor } }}
                />
              }
              label={<Typography sx={{ color: textPrimary, fontSize: 13 }}>{item.quantidade}x {item.produto_nome}</Typography>}
            />
          ))}
        </Paper>
      )}

      <TextField
        select
        label="Mesa de Destino"
        value={targetTableId}
        onChange={(e) => setTargetTableId(e.target.value)}
        fullWidth
        sx={{
          '& .MuiOutlinedInput-root': { color: textPrimary, borderRadius: 3, '& fieldset': { borderColor: borderColor }, '&:hover fieldset': { borderColor: accentColor }, '&.Mui-focused fieldset': { borderColor: accentColor } },
          '& .MuiInputLabel-root': { color: textSecondary },
        }}
      >
        {tables.filter((t) => t.id !== selectedTable?.id && t.status !== 'ocupada' && t.status !== 'em_fechamento').map((t) => (
          <MenuItem key={t.id} value={t.id}>Mesa {t.numero} ({t.status})</MenuItem>
        ))}
      </TextField>

      <Button
        variant="contained"
        fullWidth
        disabled={!targetTableId || (!transferAll && Object.values(selectedItemIds).filter(Boolean).length === 0) || transferMutation.isPending}
        onClick={handleTransferSubmit}
        sx={{ bgcolor: accentColor2, borderRadius: 3, py: 1.5, mt: 2, fontWeight: 800, fontSize: 14, color: '#000', '&:hover': { bgcolor: '#ffc233' } }}
        startIcon={transferMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <ArrowRightLeft size={16} />}
      >
        Confirmar Transferencia
      </Button>
    </Box>
  );

  return (
    <Box sx={{ bgcolor: bgColor, minHeight: '100dvh', display: 'flex', flexDirection: 'column', maxWidth: 480, mx: 'auto', width: '100%' }}>
      {/* Top AppBar */}
      <AppBar position="static" elevation={0} sx={{ bgcolor: 'transparent', pt: 1 }}>
        <Box sx={{ px: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Logo / Title */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Grid3X3 size={22} color={accentColor} />
            <Typography sx={{ color: textPrimary, fontWeight: 800, fontSize: 18, letterSpacing: -0.5 }}>
              {company?.nome || 'Garcom'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton
              onClick={handleManualReload}
              size="small"
              sx={{ color: textSecondary, p: 0.5 }}
            >
              <RefreshCw size={14} style={{ animation: tablesRefetching ? `${spin} 1s linear infinite` : 'none' }} />
            </IconButton>
            <IconButton onClick={handleTestNotification} size="small" sx={{ color: accentColor2, p: 0.5 }}>
              <Bell size={14} />
            </IconButton>
            <IconButton onClick={toggleFullscreen} size="small" sx={{ color: textSecondary, p: 0.5 }}>
              {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
            </IconButton>
            {socketConnected ? <Wifi size={14} color="#52b788" /> : <WifiOff size={14} color="#e63946" />}
            <Avatar sx={{ width: 30, height: 30, bgcolor: cardColor, ml: 1 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 800, color: accentColor }}>{user?.nome?.charAt(0) || 'G'}</Typography>
            </Avatar>
          </Box>
        </Box>
      </AppBar>

      {/* Main content with fluid transitions */}
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Fade in={viewState === 'list'} unmountOnExit timeout={300}>
          <Box sx={{
            flex: 1,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollBehavior: 'smooth',
            overscrollBehavior: 'contain',
          }}>
            {renderTableView()}
          </Box>
        </Fade>
        <Fade in={viewState === 'detail'} unmountOnExit timeout={300}>
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {renderDetailView()}
          </Box>
        </Fade>
        <Slide in={viewState === 'order'} direction="up" unmountOnExit timeout={400}>
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            {renderOrderView()}
          </Box>
        </Slide>
        <Fade in={viewState === 'transfer'} unmountOnExit timeout={300}>
          <Box sx={{ flex: 1, overflowY: 'auto', pt: 1 }}>
            {renderTransferView()}
          </Box>
        </Fade>
      </Box>

      {/* Bottom Navigation Bar */}
      <Paper elevation={0} sx={{ bgcolor: surfaceColor, backdropFilter: 'blur(12px)', borderRadius: '24px 24px 0 0', border: `1px solid ${borderColor}`, borderBottom: 'none', position: 'sticky', bottom: 0, overflow: 'hidden' }}>
        <BottomNavigation
          value={bottomNav}
          onChange={(_, val) => {
            setBottomNav(val);
            if (val === 0) setViewState('list');
            if (val === 1 && selectedTable) setViewState('detail');
          }}
          sx={{ bgcolor: 'transparent', '& .MuiBottomNavigationAction-root': { color: textSecondary, minWidth: 60, py: 0.5 }, '& .Mui-selected': { color: `${accentColor} !important` } }}
        >
          <BottomNavigationAction
            label="Mesas"
            icon={<Grid3X3 size={20} />}
            sx={{ fontSize: '10px !important', fontWeight: 700, '& .MuiBottomNavigationAction-label': { fontSize: '9px !important', fontWeight: 700, mt: 0.3 } }}
          />
          <BottomNavigationAction
            label="Detalhes"
            icon={<Receipt size={20} />}
            disabled={!selectedTable}
            sx={{ fontSize: '10px !important', fontWeight: 700, '& .MuiBottomNavigationAction-label': { fontSize: '9px !important', fontWeight: 700, mt: 0.3 } }}
          />
          <BottomNavigationAction
            label="Sair"
            icon={<LogOut size={20} />}
            onClick={() => logout()}
            sx={{ fontSize: '10px !important', fontWeight: 700, '& .MuiBottomNavigationAction-label': { fontSize: '9px !important', fontWeight: 700, mt: 0.3 } }}
          />
        </BottomNavigation>
      </Paper>

      {/* Snackbar Notificações */}
      <Snackbar open={!!snackbar} autoHideDuration={3000} onClose={() => setSnackbar(null)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} TransitionComponent={Slide}>
        <MuiAlert severity={snackbar?.sev || 'success'} variant="filled" sx={{ borderRadius: 3, fontWeight: 700, boxShadow: '0 8px 16px rgba(0,0,0,0.3)' }}>{snackbar?.msg}</MuiAlert>
      </Snackbar>

      {/* Caixa Closed Modal */}
      <Dialog
        open={caixaClosedModalOpen}
        onClose={() => setCaixaClosedModalOpen(false)}
        PaperProps={{
          sx: {
            bgcolor: '#1e2030', // Solid dark color to prevent white bleeding
            borderRadius: 3,
            border: `1px solid ${borderColor}`,
            boxShadow: '0 24px 48px rgba(0,0,0,0.5)'
          }
        }}
      >
        <DialogTitle sx={{ color: '#830606ff', fontWeight: 800, textAlign: 'center', fontSize: 22, pt: 3 }}>
          Caixa Fechado
        </DialogTitle>
        <DialogContent sx={{ textAlign: 'center', py: 2 }}>
          <Box sx={{ width: 80, height: 80, borderRadius: '50%', bgcolor: '#e6394620', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 3 }}>
            <DollarSign size={40} color="#e63946" />
          </Box>
          <Typography sx={{ color: '#131414ff', mb: 1, fontSize: 15, lineHeight: 1.5, px: 1 }}>
            Não é possível abrir mesas ou lançar pedidos no momento.
          </Typography>
          <Typography sx={{ color: '#0a0a0aff', fontSize: 13, px: 2 }}>
            Solicite ao administrador para abrir o caixa no PDV principal.
          </Typography>
        </DialogContent>
        <Box sx={{ p: 3, pt: 1 }}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => setCaixaClosedModalOpen(false)}
            sx={{
              bgcolor: accentColor,
              color: '#fff',
              fontWeight: 800,
              borderRadius: 2,
              py: 1.5,
              fontSize: 16,
              textTransform: 'none',
              '&:hover': { bgcolor: '#ff7b50' }
            }}
          >
            Entendi
          </Button>
        </Box>
      </Dialog>
    </Box>
  );
};

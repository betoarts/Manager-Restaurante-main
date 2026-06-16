import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Grid,
  Card,
  CardContent,
  CardMedia,
  Typography,
  Box,
  Tabs,
  Tab,
  Button,
  IconButton,
  TextField,
  Divider,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  List,
  ListItem,
  Badge,
  MenuItem,
  useTheme,
  Alert,
  Chip,
  Tooltip,
  Snackbar,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import {
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  CreditCard,
  WifiOff,
  CheckCircle2,
  RefreshCw,
  Bell,
  DollarSign,
  ArrowRightLeft,
  Clock,
  Grid3X3,
  LayoutGrid,
  PlusCircle,
  FileText,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { api } from '../utils/api';
import type { Produto, Categoria, Mesa, Pedido } from '../types';
import RelatorioCaixaModal from '../components/RelatorioCaixaModal';

export const PDV: React.FC = () => {
  const theme = useTheme();
  const {
    cart,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    selectedTableId,
    setSelectedTableId,
    selectedComandaId,
    setSelectedComandaId,
    closingTables,
    dismissClosingTable,
  } = useStore();

  // PDV Closing-Table Dialog state
  const [closingDialogTable, setClosingDialogTable] = useState<Mesa | null>(null);
  const [closingTableOrders, setClosingTableOrders] = useState<Pedido[]>([]);
  const [checkoutSnackbar, setCheckoutSnackbar] = useState<string | null>(null);
  const [closingPaymentMethod, setClosingPaymentMethod] = useState<'pix' | 'cartao_credito' | 'dinheiro'>('dinheiro');
  const [closingCashAmount, setClosingCashAmount] = useState<string>('');
  const [isClosingTableTef, setIsClosingTableTef] = useState(false);

  const [viewMode, setViewMode] = useState<'products' | 'map'>('products');
  const [draggedTableId, setDraggedTableId] = useState<number | null>(null);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [newTableDialogOpen, setNewTableDialogOpen] = useState(false);
  const [newTableNumero, setNewTableNumero] = useState<number>(1);
  const [newTableCapacidade, setNewTableCapacidade] = useState(4);
  const [newTableFormato, setNewTableFormato] = useState<'redondo' | 'quadrado'>('redondo');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<Mesa | null>(null);
  const [editCapacidade, setEditCapacidade] = useState(4);
  const [editFormato, setEditFormato] = useState<'redondo' | 'quadrado'>('redondo');

  // Local table positions for drag & drop (synced from query)
  const [mapTables, setMapTables] = useState<Mesa[]>([]);

  const [relatorioOpen, setRelatorioOpen] = useState(false);
  const [relatorioTurnoId, setRelatorioTurnoId] = useState<string | number>('current');

  const user = useStore((s) => s.user);
  const canEditMap = user && (user.role === 'admin' || user.role === 'gerente');

  // Drag & Drop handlers for table map
  const handleMapDragStart = (e: React.MouseEvent, table: Mesa) => {
    if (!canEditMap) return;
    e.preventDefault();
    setDraggedTableId(table.id);
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setDragOffset({ x: table.pos_x, y: table.pos_y });
  };
  const handleMapDragMove = (e: React.MouseEvent) => {
    if (draggedTableId === null) return;
    const newX = Math.max(0, dragOffset.x + (e.clientX - dragStartPos.x));
    const newY = Math.max(0, dragOffset.y + (e.clientY - dragStartPos.y));
    setMapTables(mapTables.map((t) => t.id === draggedTableId ? { ...t, pos_x: newX, pos_y: newY } : t));
  };
  const handleMapDragEnd = () => {
    if (draggedTableId === null) return;
    const t = mapTables.find((x) => x.id === draggedTableId);
    if (t) api.put(`/api/tables/${draggedTableId}`, { pos_x: t.pos_x, pos_y: t.pos_y }).catch(() => {});
    setDraggedTableId(null);
  };

  // Create table mutation
  const createTableMutation = useMutation({
    mutationFn: (payload: any) => api.post('/api/tables', payload),
    onSuccess: () => { refetchTables(); setNewTableDialogOpen(false); },
  });
  const handleCreateTable = () => {
    const maxPos = Math.max(...mapTables.map((t) => t.pos_y + 140), 0);
    createTableMutation.mutate({
      numero: newTableNumero,
      capacidade: newTableCapacidade,
      formato: newTableFormato,
      pos_x: 100 + (mapTables.length % 5) * 140,
      pos_y: maxPos + 50,
    });
  };

  // Delete table mutation
  const deleteTableMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/tables/${id}`),
    onSuccess: () => refetchTables(),
  });

  // Edit table mutation
  const editTableMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => api.put(`/api/tables/${id}`, payload),
    onSuccess: () => { refetchTables(); setEditDialogOpen(false); },
  });

  const [activeCategoryTab, setActiveCategoryTab] = useState<number>(0);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'pix' | 'cartao_credito' | 'dinheiro'>('pix');
  const [cashAmountPaid, setCashAmountPaid] = useState<string>('');
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Transfer dialog state
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferAll, setTransferAll] = useState(true);
  const [targetTableId, setTargetTableId] = useState<string>('');
  const [selectedItemIds, setSelectedItemIds] = useState<Record<number, boolean>>({});

  // TEF (Pinpad) Localhost & Simulation States
  const [tefDialogOpen, setTefDialogOpen] = useState(false);
  const [tefStatus, setTefStatus] = useState<'idle' | 'calling_agent' | 'waiting_card' | 'processing' | 'approved' | 'failed' | 'no_agent'>('idle');
  const [tefMessage, setTefMessage] = useState('');
  const [tefTxID, setTefTxID] = useState('');

  // Caixa States
  const [caixaDialogOpen, setCaixaDialogOpen] = useState<'abrir' | 'fechar' | 'sangria' | 'suprimento' | null>(null);
  const [caixaInputValue, setCaixaInputValue] = useState('');
  const [caixaInputMotivo, setCaixaInputMotivo] = useState('');

  // Fiscal States
  const [emitirFiscal, setEmitirFiscal] = useState(false);
  const [cpfFiscal, setCpfFiscal] = useState('');

  // 1. Fetch Categories
  const { data: categories = [] } = useQuery<Categoria[]>({
    queryKey: ['categories'],
    queryFn: () => api.get<Categoria[]>('/api/categories'),
  });

  // 1b. Fetch Caixa Status
  const { data: caixaStatus, refetch: refetchCaixa } = useQuery<{ status: string; valor_inicial?: number; valor_final?: number; id?: number }>({
    queryKey: ['caixa-status'],
    queryFn: () => api.get<any>('/api/caixa/status'),
  });

  // 2. Fetch Active Products
  const { data: products = [] } = useQuery<Produto[]>({
    queryKey: ['products'],
    queryFn: () => api.get<Produto[]>('/api/products'),
  });

  // 2b. Fetch All Orders for History
  const { data: allOrders = [], refetch: refetchAllOrders } = useQuery<Pedido[]>({
    queryKey: ['all-orders'],
    queryFn: () => api.get<Pedido[]>('/api/orders'),
  });

  // 3. Fetch Tables (for associating table numbers)
  const { data: tables = [], refetch: refetchTables } = useQuery<Mesa[]>({
    queryKey: ['tables-pdv'],
    queryFn: () => api.get<Mesa[]>('/api/tables'),
  });

  // Sync tables into mapTables for drag & drop
  React.useEffect(() => {
    if (tables.length > 0) setMapTables(tables);
  }, [tables]);

  // 4. Fetch active orders for the selected table
  const { data: tableOrders = [], refetch: refetchTableOrders } = useQuery<Pedido[]>({
    queryKey: ['table-orders-pdv', selectedTableId],
    queryFn: () => api.get<Pedido[]>(`/api/tables/${selectedTableId}/orders`),
    enabled: !!selectedTableId,
  });

  const allTableItems = tableOrders.flatMap((o) => o.itens);
  const tableConsumptionTotal = tableOrders.reduce((sum, o) => sum + o.total, 0);

  // 5. Fetch orders for a closing table when the cashier opens the dialog
  const fetchClosingTableOrders = async (mesa: Mesa) => {
    const orders = await api.get<Pedido[]>(`/api/tables/${mesa.id}/orders`);
    setClosingTableOrders(orders);
    setClosingDialogTable(mesa);
    setClosingPaymentMethod('dinheiro');
    setClosingCashAmount('');
  };

  // Initiate table closing directly from PDV (when viewing occupied table)
  const handlePDVCloseTable = async (tableId: number) => {
    const table = tables.find((t) => t.id === tableId);
    if (!table) return;
    // Set table to "em_fechamento" and fetch orders
    await api.put(`/api/tables/${tableId}`, { status: 'em_fechamento' });
    refetchTables();
    // Fetch orders and open closing dialog
    fetchClosingTableOrders({ id: tableId, ...table });
  };

  // Closing table total
  const closingTableTotal = closingTableOrders.reduce((sum, o) => sum + o.total, 0);
  const closingCashChange = parseFloat(closingCashAmount)
    ? parseFloat(closingCashAmount) - closingTableTotal
    : 0;

  // Mutation: open/occupy table
  const openTableMutation = useMutation({
    mutationFn: (tableId: number) => api.put<Mesa>(`/api/tables/${tableId}`, { status: 'ocupada' }),
    onSuccess: () => {
      refetchTables();
    },
  });

  // Caixa Mutations
  const abrirCaixaMutation = useMutation({
    mutationFn: (valor: number) => api.post('/api/caixa/abrir', { valor_inicial: valor }),
    onSuccess: () => { refetchCaixa(); setCaixaDialogOpen(null); setCheckoutSnackbar('Caixa aberto com sucesso!'); },
    onError: (err: any) => setErrorMsg(err.message),
  });

  const fecharCaixaMutation = useMutation({
    mutationFn: (valor: number) => api.post('/api/caixa/fechar', { valor_final: valor }),
    onSuccess: () => { refetchCaixa(); setCaixaDialogOpen(null); setCheckoutSnackbar('Caixa fechado com sucesso!'); },
    onError: (err: any) => setErrorMsg(err.message),
  });

  const movimentacaoCaixaMutation = useMutation({
    mutationFn: (payload: { tipo: string; valor: number; motivo: string }) => api.post('/api/caixa/movimentacao', payload),
    onSuccess: () => { setCaixaDialogOpen(null); setCheckoutSnackbar('Movimentação registrada com sucesso!'); },
    onError: (err: any) => setErrorMsg(err.message),
  });

  const cancelOrderMutation = useMutation({
    mutationFn: (orderId: number) => api.post(`/api/orders/${orderId}/cancel`, {}),
    onSuccess: () => { refetchAllOrders(); setCheckoutSnackbar('Pedido cancelado e estornado com sucesso!'); },
    onError: (err: any) => setErrorMsg(err.message),
  });

  // Checkout mutation: PDV finalizes the table (only after payment)
  const checkoutMutation = useMutation({
    mutationFn: (mesaId: number) => api.post(`/api/tables/checkout/${mesaId}`, {}),
    onSuccess: (_, mesaId) => {
      dismissClosingTable(mesaId);
      setClosingDialogTable(null);
      refetchTables();
      setCheckoutSnackbar('Mesa finalizada e liberada com sucesso!');
    },
  });

  // Process payment then close table
  const handleCloseTablePayment = () => {
    if (!closingDialogTable) return;

    const total = closingTableTotal;

    if (closingPaymentMethod === 'pix' || closingPaymentMethod === 'cartao_credito') {
      // Open TEF dialog for closing table payment
      setTefDialogOpen(true);
      setTefStatus('calling_agent');
      setTefMessage('Conectando ao terminal TEF...');
      setIsClosingTableTef(true);

      api.post<import('../types').TEFPaymentResult>('/api/tef/payment', {
        amount: total,
        method: closingPaymentMethod === 'pix' ? 'pix' : 'card'
      })
      .then((data) => {
        if (data.simulated) {
          // TEF agent not available, offer simulation
          setTefStatus('no_agent');
          setTefMessage('Agente TEF nao detectado. Voce pode simular a transacao.');
        } else {
          setTefStatus('approved');
          setTefMessage(`Transacao Aprovada! Autorizacao: ${data.authorization_code || 'N/A'}`);
          setTefTxID(data.transaction_id || '');
          setTimeout(() => {
            setTefDialogOpen(false);
            setIsClosingTableTef(false);
            finalizeClosingPayment(total);
          }, 1500);
        }
      })
      .catch((err) => {
        console.warn('TEF call failed:', err);
        setTefStatus('no_agent');
        setTefMessage('Agente TEF nao detectado. Voce pode simular a transacao.');
      });
    } else {
      // Cash: process directly
      finalizeClosingPayment(total);
    }
  };

  // Register payment and checkout
  const finalizeClosingPayment = async (total: number) => {
    if (!closingDialogTable) return;

    try {
      // Register payment for the closing table
      await api.post('/api/payments', {
        pedido_id: closingTableOrders.length > 0 ? closingTableOrders[0].id : undefined,
        metodo: closingPaymentMethod,
        valor: total,
      });

      // Now checkout (free the table)
      checkoutMutation.mutate(closingDialogTable.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao processar pagamento de fechamento.');
    }
  };

  // Simulate TEF for closing table
  const handleSimulateClosingTef = () => {
    setTefStatus('waiting_card');
    setTefMessage(closingPaymentMethod === 'pix' ? 'INSIRA OU LEIA O QR CODE DO PIX NO TERMINAL' : 'INSIRA, APROXIME OU PASSE O CARTAO NO PINPAD');

    setTimeout(() => {
      setTefStatus('processing');
      setTefMessage('PROCESSANDO TRANSACAO... NAO REMOVA O CARTAO');

      setTimeout(() => {
        const mockAuth = Math.floor(100000 + Math.random() * 900000).toString();
        setTefStatus('approved');
        setTefMessage(`TRANSACAO APROVADA! AUTORIZACAO: ${mockAuth}`);
        const mockTx = 'TX-' + Date.now();
        setTefTxID(mockTx);

        setTimeout(() => {
          setTefDialogOpen(false);
          setIsClosingTableTef(false);
          finalizeClosingPayment(closingTableTotal);
        }, 1500);
      }, 1500);
    }, 1500);
  };

  // Transfer mutation
  const transferMutation = useMutation({
    mutationFn: (payload: any) => api.post('/api/tables/transfer', payload),
    onSuccess: () => {
      refetchTables();
      refetchTableOrders();
      setTransferDialogOpen(false);
    },
  });

  // Filter products by currently selected category
  const filteredProducts = products.filter((p) => {
    if (p.tipo === 'insumo') return false;
    if (categories.length === 0) return true;
    const activeCat = categories[activeCategoryTab];
    return activeCat ? p.categoria_id === activeCat.id : true;
  });

  // Calculate cart total
  const cartTotal = cart.reduce((sum, item) => sum + item.produto.preco * item.quantidade, 0);

  // Mutation to submit the order to the backend
  const orderMutation = useMutation({
    mutationFn: (orderData: any) => api.post<any>('/api/orders', orderData),
    onSuccess: (data) => {
      // If payment is completed (e.g. PIX/Credit), simulate immediate transaction log
      if (selectedPaymentMethod !== 'dinheiro' || cashAmountPaid) {
        api.post('/api/payments', {
          pedido_id: data.id,
          metodo: selectedPaymentMethod,
          valor: cartTotal,
        }).catch(err => console.error('Failed to log payment:', err));
      }

      if (emitirFiscal) {
        api.post('/api/fiscal/emitir', {
          pedido_id: data.id,
          cpf_cnpj: cpfFiscal
        }).then(res => {
          setCheckoutSnackbar(`Cupom fiscal emitido! Chave: ${res.data.chave_acesso_nfe}`);
        }).catch(err => console.error('Failed to emit fiscal:', err));
      }

      setCheckoutSuccess(true);
      setPaymentDialogOpen(false);
      clearCart();
      refetchTableOrders();
      refetchTables();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Erro ao processar o pedido. Tente novamente.');
    },
  });

  // Mutation: launch items to table without payment
  const launchToTableMutation = useMutation({
    mutationFn: (orderData: any) => api.post<any>('/api/orders', orderData),
    onSuccess: () => {
      clearCart();
      refetchTableOrders();
      refetchTables();
      setCheckoutSnackbar('Itens lancados na mesa com sucesso!');
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Erro ao lancar itens na mesa.');
    },
  });

  const handleLaunchToTable = () => {
    if (!selectedTableId || cart.length === 0) return;
    setErrorMsg(null);

    // Auto-open table if it was livre
    const table = tables.find((t) => t.id === selectedTableId);
    if (table && table.status === 'livre') {
      openTableMutation.mutate(selectedTableId);
    }

    const orderItemsPayload = cart.map((item) => ({
      produto_id: item.produto.id,
      quantidade: item.quantidade,
      observacao: item.observacao,
    }));

    launchToTableMutation.mutate({
      mesa_id: selectedTableId,
      origem: 'mesa',
      itens: orderItemsPayload,
    });
  };

  const submitOrderAfterTef = (_transactionId?: string) => {
    setErrorMsg(null);

    // Auto-open table if it was livre
    if (selectedTableId) {
      const table = tables.find((t) => t.id === selectedTableId);
      if (table && table.status === 'livre') {
        openTableMutation.mutate(selectedTableId);
      }
    }

    const orderItemsPayload = cart.map((item) => ({
      produto_id: item.produto.id,
      quantidade: item.quantidade,
      observacao: item.observacao,
    }));

    orderMutation.mutate({
      mesa_id: selectedTableId || undefined,
      comanda_id: selectedComandaId || undefined,
      origem: selectedTableId ? 'mesa' : 'balcao',
      itens: orderItemsPayload,
    });
  };

  const handleCheckoutSubmit = () => {
    if (selectedPaymentMethod === 'pix' || selectedPaymentMethod === 'cartao_credito') {
      setPaymentDialogOpen(false);
      setTefDialogOpen(true);
      setTefStatus('calling_agent');
      setTefMessage('Conectando ao terminal TEF...');

      api.post<import('../types').TEFPaymentResult>('/api/tef/payment', {
        amount: cartTotal,
        method: selectedPaymentMethod === 'pix' ? 'pix' : 'card'
      })
      .then((data) => {
        if (data.simulated) {
          setTefStatus('no_agent');
          setTefMessage('Agente TEF nao detectado. Voce pode simular a transacao.');
        } else {
          setTefStatus('approved');
          setTefMessage(`Transacao Aprovada! Autorizacao: ${data.authorization_code || 'N/A'}`);
          setTefTxID(data.transaction_id || '');
          setTimeout(() => {
            setTefDialogOpen(false);
            submitOrderAfterTef(data.transaction_id || '');
          }, 1500);
        }
      })
      .catch((err) => {
        console.warn('TEF call failed:', err);
        setTefStatus('no_agent');
        setTefMessage('Agente TEF nao detectado. Voce pode simular a transacao.');
      });
    } else {
      submitOrderAfterTef();
    }
  };

  const handleSimulateTef = () => {
    setTefStatus('waiting_card');
    setTefMessage(selectedPaymentMethod === 'pix' ? 'INSIRA OU LEIA O QR CODE DO PIX NO TERMINAL' : 'INSIRA, APROXIME OU PASSE O CARTÃO NO PINPAD');

    setTimeout(() => {
      setTefStatus('processing');
      setTefMessage('PROCESSANDO TRANSAÇÃO... NÃO REMOVA O CARTÃO');

      setTimeout(() => {
        const mockAuth = Math.floor(100000 + Math.random() * 900000).toString();
        setTefStatus('approved');
        setTefMessage(`TRANSAÇÃO APROVADA! AUTORIZAÇÃO: ${mockAuth}`);
        const mockTx = 'TX-' + Date.now();
        setTefTxID(mockTx);

        setTimeout(() => {
          setTefDialogOpen(false);
          submitOrderAfterTef(mockTx);
        }, 1500);
      }, 1500);
    }, 1500);
  };

  // Transfer: open dialog with current table data
  const handleOpenTransfer = () => {
    setTransferAll(true);
    setTargetTableId('');
    setSelectedItemIds({});
    setTransferDialogOpen(true);
  };

  const handleTransferSubmit = () => {
    if (!selectedTableId || !targetTableId) return;

    const payload: any = {
      from_mesa_id: selectedTableId,
      to_mesa_id: Number(targetTableId),
      transfer_all: transferAll,
    };

    if (!transferAll) {
      const itemIds = Object.keys(selectedItemIds)
        .filter((k) => selectedItemIds[Number(k)])
        .map(Number);
      if (itemIds.length === 0) return;
      payload.item_ids = itemIds;
    }

    transferMutation.mutate(payload);
  };

  const cashChange = parseFloat(cashAmountPaid)
    ? parseFloat(cashAmountPaid) - cartTotal
    : 0;

  const getItemStatusColor = (status: string) => {
    switch (status) {
      case 'produzindo': return 'warning';
      case 'pronto': return 'success';
      case 'entregue': return 'default';
      default: return 'info';
    }
  };

  return (
    <Box>
      {/* === PAINEL DE MESAS EM FECHAMENTO === */}
      {closingTables.length > 0 && (
        <Box sx={{ mb: 2 }}>
          {closingTables.map((mesa) => (
            <Alert
              key={mesa.id}
              severity="warning"
              sx={{
                mb: 1,
                borderRadius: 3,
                border: `1px solid ${theme.palette.warning.main}`,
                fontWeight: 600,
                alignItems: 'center',
              }}
              icon={<Bell size={20} />}
              action={
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    variant="contained"
                    color="warning"
                    startIcon={<DollarSign size={14} />}
                    onClick={() => fetchClosingTableOrders(mesa)}
                    sx={{ fontWeight: 700, borderRadius: 2 }}
                  >
                    Ver Conta e Fechar
                  </Button>
                  <Button
                    size="small"
                    color="inherit"
                    onClick={() => dismissClosingTable(mesa.id)}
                    sx={{ fontWeight: 600 }}
                  >
                    Ignorar
                  </Button>
                </Box>
              }
            >
              <strong>Mesa {mesa.numero}</strong> solicitou fechamento pelo garcom. Aguardando cobranca no caixa.
            </Alert>
          ))}
        </Box>
      )}

      {/* === DIALOG DE FECHAMENTO: COBRANCA DA MESA === */}
      <Dialog open={!!closingDialogTable} onClose={() => setClosingDialogTable(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          Fechar Mesa {closingDialogTable?.numero}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Revise o consumo e realize a cobranca antes de liberar a mesa.
          </Typography>
          <List disablePadding>
            {closingTableOrders.flatMap((o) => o.itens).map((item, idx) => (
              <ListItem key={idx} disableGutters sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {item.quantidade}x {item.produto_nome}
                  </Typography>
                  {item.observacao && (
                    <Typography variant="caption" color="error.main">* {item.observacao}</Typography>
                  )}
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  R$ {(item.preco_unitario * item.quantidade).toFixed(2)}
                </Typography>
              </ListItem>
            ))}
          </List>
          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>Total a Cobrar</Typography>
            <Typography variant="h6" color="primary.main" sx={{ fontWeight: 800 }}>
              R$ {closingTableTotal.toFixed(2)}
            </Typography>
          </Box>

          {/* Payment Method Selection */}
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Forma de Pagamento
          </Typography>
          <TextField
            select
            label="Metodo"
            value={closingPaymentMethod}
            onChange={(e) => setClosingPaymentMethod(e.target.value as any)}
            fullWidth
            sx={{ mb: 1.5 }}
          >
            <MenuItem value="pix">PIX (TEF Integrado)</MenuItem>
            <MenuItem value="cartao_credito">Cartao de Credito / Debito</MenuItem>
            <MenuItem value="dinheiro">Dinheiro (Em Especie)</MenuItem>
          </TextField>

          {closingPaymentMethod === 'dinheiro' && (
            <>
              <TextField
                label="Valor Recebido (R$)"
                type="number"
                placeholder="Ex: 100.00"
                value={closingCashAmount}
                onChange={(e) => setClosingCashAmount(e.target.value)}
                fullWidth
                sx={{ mb: 1.5 }}
              />
              {parseFloat(closingCashAmount) > 0 && (
                <Alert severity={closingCashChange >= 0 ? 'info' : 'warning'} sx={{ py: 0.5 }}>
                  <Typography variant="body2">
                    Troco: <strong>R$ {closingCashChange >= 0 ? closingCashChange.toFixed(2) : '0.00'}</strong>
                    {closingCashChange < 0 && ' (valor insuficiente)'}
                  </Typography>
                </Alert>
              )}
            </>
          )}

          {checkoutMutation.isPending && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={32} />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button onClick={() => setClosingDialogTable(null)} color="inherit">Cancelar</Button>
          <Button
            variant="contained"
            color="success"
            startIcon={checkoutMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <DollarSign size={16} />}
            onClick={handleCloseTablePayment}
            disabled={
              checkoutMutation.isPending ||
              (closingPaymentMethod === 'dinheiro' && (!closingCashAmount || closingCashChange < 0))
            }
            sx={{ fontWeight: 700, borderRadius: 2 }}
          >
            Cobrar e Fechar Mesa
          </Button>
        </DialogActions>
      </Dialog>

      {/* === DIALOG DE TRANSFERENCIA === */}
      <Dialog open={transferDialogOpen} onClose={() => setTransferDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          Transferencia da Mesa {tables.find((t) => t.id === selectedTableId)?.numero}
        </DialogTitle>
        <DialogContent>
          {/* Type selector */}
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.5, mt: 1 }}>
            Tipo de Transferencia
          </Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6 }}>
              <Button
                variant={transferAll ? 'contained' : 'outlined'}
                fullWidth
                onClick={() => setTransferAll(true)}
                sx={{ fontWeight: 700 }}
              >
                Mesa Inteira
              </Button>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Button
                variant={!transferAll ? 'contained' : 'outlined'}
                fullWidth
                onClick={() => setTransferAll(false)}
                sx={{ fontWeight: 700 }}
              >
                Itens Individuais
              </Button>
            </Grid>
          </Grid>

          {/* Items select list (only if partial) */}
          {!transferAll && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
                Selecione os Itens para Transferir
              </Typography>
              <List disablePadding>
                {allTableItems.map((item) => (
                  <ListItem key={item.id} disableGutters>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={item.id ? !!selectedItemIds[item.id] : false}
                          onChange={(e) => {
                            if (item.id) {
                              setSelectedItemIds((prev) => ({
                                ...prev,
                                [item.id!]: e.target.checked,
                              }));
                            }
                          }}
                        />
                      }
                      label={`${item.quantidade}x ${item.produto_nome}`}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}

          {/* Target Table selector */}
          <TextField
            select
            label="Mesa de Destino"
            value={targetTableId}
            onChange={(e) => setTargetTableId(e.target.value)}
            fullWidth
          >
            {tables
              .filter((t) => t.id !== selectedTableId && t.status !== 'ocupada' && t.status !== 'em_fechamento')
              .map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  Mesa {t.numero} ({t.status})
                </MenuItem>
              ))}
          </TextField>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button onClick={() => setTransferDialogOpen(false)} color="inherit">Cancelar</Button>
          <Button
            variant="contained"
            disabled={transferMutation.isPending || !targetTableId || (!transferAll && Object.values(selectedItemIds).filter(Boolean).length === 0)}
            onClick={handleTransferSubmit}
            sx={{ fontWeight: 700 }}
          >
            Confirmar Transferencia
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar de sucesso */}
      <Snackbar
        open={!!checkoutSnackbar}
        autoHideDuration={4000}
        onClose={() => setCheckoutSnackbar(null)}
        message={checkoutSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />

      <Grid container spacing={3} sx={{ height: 'calc(100vh - 120px)' }}>
      {/* Products Catalog - Left Side (8 cols) */}
      <Grid size={{ xs: 12, lg: 8 }} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        
        {/* Caixa Menu */}
        <Paper elevation={0} sx={{ mb: 2, p: 1.5, borderRadius: 3, border: `1px solid ${theme.palette.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Chip
              icon={<DollarSign size={16} />}
              label={caixaStatus && caixaStatus.status === 'aberto' ? 'Caixa Aberto' : 'Caixa Fechado'}
              color={caixaStatus && caixaStatus.status === 'aberto' ? 'success' : 'error'}
              variant="outlined"
              sx={{ fontWeight: 800 }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {caixaStatus?.status === 'aberto' ? (
              <>
                <Button variant="outlined" size="small" onClick={() => { setRelatorioTurnoId('current'); setRelatorioOpen(true); }} startIcon={<FileText size={14} />}>Relatório</Button>
                <Button variant="outlined" size="small" onClick={() => setCaixaDialogOpen('suprimento')}>Suprimento</Button>
                <Button variant="outlined" size="small" onClick={() => setCaixaDialogOpen('sangria')}>Sangria</Button>
                <Button variant="contained" color="error" size="small" onClick={() => setCaixaDialogOpen('fechar')}>Fechar Caixa</Button>
              </>
            ) : (
              <Button variant="contained" color="success" size="small" onClick={() => setCaixaDialogOpen('abrir')}>Abrir Caixa</Button>
            )}
          </Box>
        </Paper>

        {/* View Mode Toggle: Cardápio vs Mapa de Mesas */}
        <Paper elevation={0} sx={{ mb: 2, borderRadius: 3, border: `1px solid ${theme.palette.divider}`, overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : theme.palette.primary.main + '08' }}>
            <Tabs
              value={viewMode === 'map' || viewMode === 'history' ? -1 : activeCategoryTab}
              onChange={(_, val) => { if (val !== -1) { setActiveCategoryTab(val); setViewMode('products'); } }}
              variant="scrollable"
              scrollButtons="auto"
              sx={{ flex: 1, opacity: viewMode !== 'products' ? 0.3 : 1 }}
            >
              {categories.map((cat) => (
                <Tab
                  key={cat.id}
                  label={cat.nome}
                  sx={{ fontWeight: 600, py: 2 }}
                />
              ))}
            </Tabs>
            <Button
              variant={viewMode === 'history' ? 'contained' : 'outlined'}
              color={viewMode === 'history' ? 'primary' : 'info'}
              startIcon={<Clock size={18} />}
              onClick={() => { setViewMode('history'); refetchAllOrders(); }}
              sx={{ ml: 2, whiteSpace: 'nowrap', fontWeight: 700, borderRadius: 2, px: 2.5, py: 1 }}
            >
              Histórico
            </Button>
            <Button
              variant={viewMode === 'map' ? 'contained' : 'outlined'}
              color={viewMode === 'map' ? 'primary' : 'info'}
              startIcon={viewMode === 'map' ? <Grid3X3 size={18} /> : <LayoutGrid size={18} />}
              onClick={() => setViewMode(viewMode === 'map' ? 'products' : 'map')}
              sx={{ ml: 2, whiteSpace: 'nowrap', fontWeight: 700, borderRadius: 2, px: 2.5, py: 1 }}
            >
              {viewMode === 'map' ? 'Cardápio' : 'Mapa de Mesas'}
            </Button>
          </Box>
        </Paper>

        {viewMode === 'history' ? (
          <Box sx={{ flexGrow: 1, overflow: 'auto', bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', borderRadius: 3, border: `1px solid ${theme.palette.divider}`, p: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>Histórico de Vendas</Typography>
            <List>
              {allOrders.slice().reverse().map((order) => (
                <Paper key={order.id} sx={{ mb: 2, p: 2, borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        Pedido #{order.id} - {new Date(order.created_at).toLocaleString()}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Total: R$ {order.total.toFixed(2)} | Status: <Chip size="small" label={order.status.toUpperCase()} color={order.status === 'cancelado' ? 'error' : 'default'} />
                      </Typography>
                      {order.chave_acesso_nfe && (
                        <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 0.5 }}>
                          Fiscal Emitido: {order.chave_acesso_nfe}
                        </Typography>
                      )}
                    </Box>
                    <Box>
                      <Button 
                        variant="outlined" 
                        color="error" 
                        size="small" 
                        disabled={order.status === 'cancelado' || cancelOrderMutation.isPending}
                        onClick={() => {
                          if (confirm(`Deseja realmente cancelar e estornar o pedido #${order.id}?`)) {
                            cancelOrderMutation.mutate(order.id);
                          }
                        }}
                      >
                        Estornar / Cancelar
                      </Button>
                    </Box>
                  </Box>
                </Paper>
              ))}
              {allOrders.length === 0 && <Typography color="text.secondary">Nenhuma venda encontrada.</Typography>}
            </List>
          </Box>
        ) : viewMode === 'map' ? (
          /* === TABLE MAP VIEW === */
          <Box
            sx={{
              flexGrow: 1,
              overflow: 'auto',
              position: 'relative',
              bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
              borderRadius: 3,
              border: `1px solid ${theme.palette.divider}`,
              minHeight: 400,
            }}
            onMouseMove={handleMapDragMove}
            onMouseUp={handleMapDragEnd}
            onMouseLeave={handleMapDragEnd}
          >
            {/* Admin edit toolbar */}
            {canEditMap && (
              <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 100, display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  startIcon={<PlusCircle size={14} />}
                  onClick={() => { setNewTableNumero(Math.max(...tables.map(t => t.numero), 0) + 1); setNewTableDialogOpen(true); }}
                  sx={{ borderRadius: 2, fontWeight: 700, fontSize: '0.7rem' }}
                >
                  Nova Mesa
                </Button>
                <Typography variant="caption" sx={{ alignSelf: 'center', opacity: 0.5 }}>
                  {canEditMap ? 'Arraste para mover' : ''}
                </Typography>
              </Box>
            )}

            {/* Tables placed with absolute positions */}
            {mapTables.map((table) => {
              const statusColors: Record<string, string> = {
                livre: theme.palette.success.main,
                ocupada: theme.palette.warning.main,
                reservada: theme.palette.info.main,
                em_fechamento: theme.palette.error.main,
              };
              const size = table.formato === 'redondo' ? 80 : table.formato === 'quadrado' ? 70 : 90;
              const isDragging = draggedTableId === table.id;
              const isSelected = selectedTableId === table.id;

              return (
                <Box
                  key={table.id}
                  onMouseDown={(e) => handleMapDragStart(e, table)}
                  onDoubleClick={(e) => { e.stopPropagation(); if (table.status === 'livre' && !canEditMap) setSelectedTableId(table.id); }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (draggedTableId !== null) return;
                    if (canEditMap) {
                      setEditingTable(table);
                      setEditCapacidade(table.capacidade);
                      setEditFormato((table.formato as 'redondo' | 'quadrado') || 'redondo');
                      setEditDialogOpen(true);
                    } else if (table.status === 'livre') {
                      setSelectedTableId(table.id);
                    }
                  }}
                  sx={{
                    position: 'absolute',
                    left: table.pos_x,
                    top: table.pos_y,
                    width: size,
                    height: size,
                    borderRadius: table.formato === 'redondo' ? '50%' : 2,
                    bgcolor: isDragging ? statusColors[table.status] : `${statusColors[table.status]}30`,
                    border: `3px solid ${isDragging ? theme.palette.primary.main : statusColors[table.status]}`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: canEditMap ? 'grab' : 'pointer',
                    userSelect: 'none',
                    zIndex: isDragging ? 1000 : 10,
                    transition: isDragging ? 'none' : 'all 0.15s',
                    '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.2)', transform: 'scale(1.05)' },
                  }}
                >
                  <Typography variant="h6" sx={{ fontWeight: 900, fontSize: '1rem', color: isDragging ? '#fff' : statusColors[table.status], lineHeight: 1 }}>
                    {table.numero}
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: '0.6rem', color: isDragging ? 'rgba(255,255,255,0.9)' : 'text.secondary', lineHeight: 1 }}>
                    {table.capacidade} p.
                  </Typography>
                  {/* Delete button on hover for admin */}
                  {canEditMap && !isDragging && (
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); deleteTableMutation.mutate(table.id); }}
                      sx={{
                        position: 'absolute', top: -8, right: -8, bgcolor: 'error.main',
                        color: '#fff', width: 20, height: 20, minWidth: 20, opacity: 0,
                        '&:hover': { opacity: 1, bgcolor: 'error.dark' },
                      }}
                      className="delete-table-btn"
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  )}
                </Box>
              );
            })}

            {mapTables.length === 0 && (
              <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <Grid3X3 size={48} style={{ opacity: 0.2 }} />
                <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Nenhuma mesa cadastrada
                </Typography>
                {canEditMap && (
                  <Button
                    variant="contained"
                    startIcon={<PlusCircle size={16} />}
                    onClick={() => { setNewTableNumero(1); setNewTableDialogOpen(true); }}
                    sx={{ fontWeight: 600, borderRadius: 2 }}
                  >
                    Criar Primeira Mesa
                  </Button>
                )}
              </Box>
            )}
          </Box>
        ) : (
          /* === PRODUCTS GRID (Scrollable) === */
          <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: 1 }}>
            <Grid container spacing={2}>
              {filteredProducts.map((prod) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={prod.id}>
                <Card
                  onClick={() => addToCart(prod, 1)}
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.2s',
                    '&:hover': {
                      transform: 'scale(1.02)',
                      boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
                      borderColor: 'primary.main',
                    },
                  }}
                >
                  <CardMedia
                    component="img"
                    height="120"
                    image={prod.imagem_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300'}
                    alt={prod.nome}
                    sx={{ objectFit: 'cover' }}
                  />
                  <CardContent sx={{ p: 2, flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="body1" sx={{ fontWeight: 700, lineClamp: 1, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 1, overflow: 'hidden' }}>
                        {prod.nome}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ lineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', mb: 1, height: 32 }}>
                        {prod.descricao || 'Sem descricao cadastrada'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                      <Typography variant="subtitle1" color="primary.main" sx={{ fontWeight: 800 }}>
                        R$ {prod.preco.toFixed(2)}
                      </Typography>
                      <IconButton color="primary" size="small" sx={{ bgcolor: 'action.hover' }}>
                        <Plus size={16} />
                      </IconButton>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
        )}
      </Grid>

      {/* Cart Drawer - Right Side (4 cols) */}
      <Grid size={{ xs: 12, lg: 4 }} sx={{ height: '100%' }}>
        <Paper
          elevation={0}
          sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 4,
            border: `1px solid ${theme.palette.divider}`,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <Box sx={{ p: 2.5, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <ShoppingCart size={20} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Carrinho de Compras
            </Typography>
            <Badge badgeContent={cart.length} color="primary" sx={{ ml: 'auto' }} />
          </Box>

          <Divider />

          {/* Table / Client Setup */}
          <Box sx={{ p: 2, display: 'flex', gap: 1.5 }}>
            <TextField
              select
              label="Mesa"
              variant="outlined"
              size="small"
              fullWidth
              value={selectedTableId || ''}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedTableId(val ? Number(val) : null);
              }}
            >
              <MenuItem value="">Nenhuma</MenuItem>
              {tables.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  Mesa {t.numero} ({t.status})
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Comanda"
              variant="outlined"
              size="small"
              fullWidth
              placeholder="Numero"
              value={selectedComandaId || ''}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedComandaId(val ? Number(val) : null);
              }}
            />
          </Box>

          <Divider />

          {/* Table Consumption (existing orders) */}
          {selectedTableId && allTableItems.length > 0 && (
            <>
              <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                    Consumo da Mesa {tables.find((t) => t.id === selectedTableId)?.numero}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Button
                      size="small"
                      variant="contained"
                      color="primary"
                      startIcon={<DollarSign size={14} />}
                      onClick={() => handlePDVCloseTable(selectedTableId)}
                      sx={{ fontWeight: 700, fontSize: '11px', py: 0.4, borderRadius: 2 }}
                    >
                      Fechar Mesa
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<ArrowRightLeft size={14} />}
                      onClick={handleOpenTransfer}
                      sx={{ fontWeight: 600, fontSize: '11px', py: 0.4, borderRadius: 2 }}
                    >
                      Transferir
                    </Button>
                  </Box>
                </Box>
              </Box>
              <Box sx={{ px: 2, pb: 1.5, maxHeight: 180, overflowY: 'auto' }}>
                {allTableItems.map((item, idx) => (
                  <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5, borderBottom: idx < allTableItems.length - 1 ? `1px solid ${theme.palette.divider}` : 'none' }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '13px' }}>
                        {item.quantidade}x {item.produto_nome}
                      </Typography>
                      {item.observacao && (
                        <Typography variant="caption" color="error.main" sx={{ fontSize: '10px' }}>
                          * {item.observacao}
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip
                        label={item.status}
                        size="small"
                        color={getItemStatusColor(item.status) as any}
                        icon={item.status === 'pronto' ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                        sx={{ fontWeight: 700, fontSize: '9px', textTransform: 'capitalize', height: 20 }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '12px' }}>
                        R$ {(item.preco_unitario * item.quantidade).toFixed(2)}
                      </Typography>
                    </Box>
                  </Box>
                ))}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, pt: 1, borderTop: `1px solid ${theme.palette.divider}` }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>Total Consumo</Typography>
                  <Typography variant="body2" color="primary.main" sx={{ fontWeight: 700 }}>
                    R$ {tableConsumptionTotal.toFixed(2)}
                  </Typography>
                </Box>
              </Box>
              <Divider />
            </>
          )}

          {/* Cart Item List (Scrollable) */}
          <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}>
            {cart.length === 0 ? (
              <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', py: 4 }}>
                {selectedTableId && allTableItems.length > 0 ? (
                  <>
                    <ShoppingCart size={48} strokeWidth={1} style={{ marginBottom: 12 }} />
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      Adicionar mais itens
                    </Typography>
                    <Typography variant="caption">
                      Selecione produtos ao lado para incluir na mesa
                    </Typography>
                  </>
                ) : (
                  <>
                    <ShoppingCart size={48} strokeWidth={1} style={{ marginBottom: 12 }} />
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      Seu carrinho esta vazio
                    </Typography>
                    <Typography variant="caption">
                      Selecione os produtos ao lado para incluir
                    </Typography>
                  </>
                )}
              </Box>
            ) : (
              <List disablePadding>
                {cart.map((item, idx) => (
                  <ListItem
                    key={idx}
                    disablePadding
                    sx={{
                      mb: 2,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 1.5,
                      '&:hover .delete-btn': { opacity: 1 },
                    }}
                  >
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {item.produto.nome}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        R$ {item.produto.preco.toFixed(2)} cada
                      </Typography>
                      <TextField
                        placeholder="Observacao (Ex: sem cebola)"
                        variant="standard"
                        fullWidth
                        size="small"
                        value={item.observacao}
                        onChange={(e) => {
                          item.observacao = e.target.value;
                        }}
                        sx={{ mt: 0.5, '& .MuiInput-input': { fontSize: 11 } }}
                      />
                    </Box>

                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                      <Typography variant="body2" color="primary.main" sx={{ fontWeight: 700 }}>
                        R$ {(item.produto.preco * item.quantidade).toFixed(2)}
                      </Typography>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: 'action.hover', borderRadius: 1.5, p: 0.2 }}>
                        <IconButton
                          size="small"
                          onClick={() => updateCartQuantity(item.produto.id, item.quantidade - 1)}
                        >
                          <Minus size={12} />
                        </IconButton>
                        <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 18, textAlign: 'center' }}>
                          {item.quantidade}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={() => updateCartQuantity(item.produto.id, item.quantidade + 1)}
                        >
                          <Plus size={12} />
                        </IconButton>
                      </Box>
                    </Box>

                    <IconButton
                      className="delete-btn"
                      color="error"
                      size="small"
                      onClick={() => removeFromCart(item.produto.id)}
                      sx={{ alignSelf: 'center', opacity: { xs: 1, lg: 0.6 }, transition: 'opacity 0.2s' }}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>

          <Divider />

          {/* Pricing Totals & Action Buttons */}
          <Box sx={{ p: 3, bgcolor: 'action.hover' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">Subtotal</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>R$ {cartTotal.toFixed(2)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>Total</Typography>
              <Typography variant="h6" color="primary.main" sx={{ fontWeight: 800 }}>R$ {cartTotal.toFixed(2)}</Typography>
            </Box>

            {/* Mesa selecionada: lancar na mesa + cobrar */}
            {selectedTableId ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Button
                  variant="contained"
                  color="primary"
                  fullWidth
                  size="large"
                  disabled={cart.length === 0 || launchToTableMutation.isPending}
                  startIcon={launchToTableMutation.isPending ? <CircularProgress size={18} color="inherit" /> : <ShoppingCart size={18} />}
                  onClick={handleLaunchToTable}
                  sx={{ py: 1.3, fontWeight: 700, fontSize: '15px' }}
                >
                  Lancar na Mesa
                </Button>
                <Button
                  variant="outlined"
                  color="primary"
                  fullWidth
                  size="medium"
                  disabled={cart.length === 0}
                  onClick={() => setPaymentDialogOpen(true)}
                  sx={{ py: 1, fontWeight: 600, fontSize: '14px' }}
                >
                  Cobrar
                </Button>
              </Box>
            ) : (
              <Button
                variant="contained"
                fullWidth
                size="large"
                disabled={cart.length === 0}
                onClick={() => setPaymentDialogOpen(true)}
                sx={{ py: 1.5, fontWeight: 700, fontSize: '16px' }}
              >
                Venda Balcao
              </Button>
            )}
          </Box>
        </Paper>
      </Grid>

      {/* New Table Dialog (admin/gerente only) */}
      <Dialog open={newTableDialogOpen} onClose={() => setNewTableDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Nova Mesa</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
            <TextField
              label="Número da Mesa"
              type="number"
              fullWidth
              value={newTableNumero}
              onChange={(e) => setNewTableNumero(Number(e.target.value))}
            />
            <TextField
              label="Capacidade (lugares)"
              type="number"
              fullWidth
              value={newTableCapacidade}
              onChange={(e) => setNewTableCapacidade(Number(e.target.value))}
            />
            <TextField
              select
              label="Formato"
              fullWidth
              value={newTableFormato}
              onChange={(e) => setNewTableFormato(e.target.value as 'redondo' | 'quadrado')}
            >
              <MenuItem value="redondo">Redondo</MenuItem>
              <MenuItem value="quadrado">Quadrado</MenuItem>
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setNewTableDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleCreateTable} disabled={createTableMutation.isPending || !newTableNumero}>
            Criar Mesa
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Table Dialog (admin/gerente only) */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Editar Mesa {editingTable?.numero}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
            <TextField
              label="Capacidade (lugares)"
              type="number"
              fullWidth
              value={editCapacidade}
              onChange={(e) => setEditCapacidade(Number(e.target.value))}
            />
            <TextField
              select
              label="Formato"
              fullWidth
              value={editFormato}
              onChange={(e) => setEditFormato(e.target.value as 'redondo' | 'quadrado')}
            >
              <MenuItem value="redondo">Redondo</MenuItem>
              <MenuItem value="quadrado">Quadrado</MenuItem>
            </TextField>
            {editingTable && editingTable.status === 'livre' && (
              <Button
                color="error"
                variant="outlined"
                startIcon={<Trash2 size={16} />}
                onClick={() => { deleteTableMutation.mutate(editingTable.id); setEditDialogOpen(false); }}
                sx={{ borderRadius: 2, fontWeight: 600 }}
              >
                Excluir Mesa {editingTable.numero}
              </Button>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={() => editTableMutation.mutate({ id: editingTable!.id, payload: { capacidade: editCapacidade, formato: editFormato } })}
            disabled={editTableMutation.isPending}
          >
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Payment Selection Dialog */}
      <Dialog open={paymentDialogOpen} onClose={() => setPaymentDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Forma de Pagamento</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
            <TextField
              select
              label="Metodo"
              value={selectedPaymentMethod}
              onChange={(e) => setSelectedPaymentMethod(e.target.value as any)}
              fullWidth
            >
              <MenuItem value="pix">PIX (TEF Integrado)</MenuItem>
              <MenuItem value="cartao_credito">Cartao de Credito / Debito</MenuItem>
              <MenuItem value="dinheiro">Dinheiro (Em Especie)</MenuItem>
            </TextField>

            {selectedPaymentMethod === 'dinheiro' && (
              <>
                <TextField
                  label="Valor Recebido (R$)"
                  type="number"
                  placeholder="Ex: 50.00"
                  value={cashAmountPaid}
                  onChange={(e) => setCashAmountPaid(e.target.value)}
                  fullWidth
                />
                {parseFloat(cashAmountPaid) > 0 && (
                  <Alert severity="info" sx={{ py: 0.5 }}>
                    <Typography variant="body2">
                      Troco: <strong>R$ {cashChange >= 0 ? cashChange.toFixed(2) : '0.00'}</strong>
                    </Typography>
                  </Alert>
                )}
              </>
            )}

            <Box sx={{ mt: 1, p: 1.5, border: `1px solid ${theme.palette.divider}`, borderRadius: 2, bgcolor: theme.palette.action.hover }}>
              <FormControlLabel
                control={<Checkbox checked={emitirFiscal} onChange={(e) => setEmitirFiscal(e.target.checked)} />}
                label={<Typography variant="body2" sx={{ fontWeight: 600 }}>Emitir Cupom Fiscal (NFC-e)</Typography>}
              />
              {emitirFiscal && (
                <TextField
                  label="CPF/CNPJ na Nota (Opcional)"
                  size="small"
                  fullWidth
                  value={cpfFiscal}
                  onChange={(e) => setCpfFiscal(e.target.value)}
                  sx={{ mt: 1 }}
                />
              )}
            </Box>

            {orderMutation.isPending && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={32} />
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setPaymentDialogOpen(false)} disabled={orderMutation.isPending}>Cancelar</Button>
          <Button
            onClick={handleCheckoutSubmit}
            variant="contained"
            disabled={
              orderMutation.isPending ||
              (selectedPaymentMethod === 'dinheiro' && (!cashAmountPaid || cashChange < 0))
            }
          >
            Lancar Venda
          </Button>
        </DialogActions>
      </Dialog>

      {/* TEF (Pinpad) Modal */}
      <Dialog
        open={tefDialogOpen}
        onClose={() => (tefStatus === 'no_agent') && setTefDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        sx={{
          '& .MuiDialog-paper': {
            borderRadius: 4,
            border: `1px solid ${theme.palette.divider}`,
            backdropFilter: 'blur(16px)',
            background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)',
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, textAlign: 'center', pt: 3 }}>
          {isClosingTableTef ? 'Cobranca de Mesa via TEF' : (selectedPaymentMethod === 'pix' ? 'Pagamento via PIX TEF' : 'Pagamento em Cartao TEF')}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 3, gap: 2.5 }}>
          {tefStatus === 'calling_agent' && (
            <>
              <CircularProgress size={48} />
              <Typography variant="body1" align="center" sx={{ fontWeight: 600 }}>
                {tefMessage}
              </Typography>
            </>
          )}

          {tefStatus === 'waiting_card' && (
            <>
              <CreditCard size={56} style={{ color: theme.palette.primary.main }} className="pulse" />
              <Typography variant="h6" align="center" sx={{ fontWeight: 700, color: 'primary.main' }}>
                R$ {isClosingTableTef ? closingTableTotal.toFixed(2) : cartTotal.toFixed(2)}
              </Typography>
              <Typography variant="body2" align="center" sx={{ fontWeight: 600, letterSpacing: '0.5px' }}>
                {tefMessage}
              </Typography>
            </>
          )}

          {tefStatus === 'processing' && (
            <>
              <CircularProgress color="secondary" size={48} />
              <Typography variant="body1" align="center" sx={{ fontWeight: 600 }}>
                {tefMessage}
              </Typography>
            </>
          )}

          {tefStatus === 'approved' && (
            <>
              <CheckCircle2 size={56} style={{ color: theme.palette.success.main }} />
              <Typography variant="h6" align="center" sx={{ fontWeight: 700, color: 'success.main' }}>
                {tefMessage}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                ID da Transacao: {tefTxID}
              </Typography>
            </>
          )}

          {tefStatus === 'no_agent' && (
            <>
              <WifiOff size={56} style={{ color: theme.palette.warning.main }} />
              <Typography variant="body1" align="center" sx={{ fontWeight: 600 }}>
                {tefMessage}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, width: '100%', mt: 2 }}>
                <Button
                  variant="contained"
                  onClick={isClosingTableTef ? handleSimulateClosingTef : handleSimulateTef}
                  fullWidth
                  sx={{ py: 1.2, fontWeight: 700 }}
                >
                  Simular Transacao (Demo)
                </Button>
                <Button
                  variant="outlined"
                  onClick={isClosingTableTef ? () => { setTefDialogOpen(false); setIsClosingTableTef(false); } : () => handleCheckoutSubmit()}
                  fullWidth
                  startIcon={<RefreshCw size={16} />}
                  sx={{ py: 1, fontWeight: 600 }}
                >
                  Tentar Novamente
                </Button>
              </Box>
            </>
          )}
        </DialogContent>
        {tefStatus === 'no_agent' && (
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => { setTefDialogOpen(false); setIsClosingTableTef(false); }}>Fechar</Button>
          </DialogActions>
        )}
      </Dialog>

      {/* Success Modal */}
      <Dialog open={checkoutSuccess} onClose={() => setCheckoutSuccess(false)}>
        <DialogTitle sx={{ fontWeight: 700, color: 'success.main', pb: 1 }}>Venda Realizada!</DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            O pedido foi processado com sucesso.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            As vias de preparo foram enviadas e roteadas automaticamente para as impressoras (Cozinha/Bar) via rede local.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setCheckoutSuccess(false)} variant="contained" autoFocus>
            Ok, Fechar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Error Alert */}
      {errorMsg && (
        <Dialog open={!!errorMsg} onClose={() => setErrorMsg(null)}>
          <DialogTitle sx={{ fontWeight: 700, color: 'error.main' }}>Erro no Pedido</DialogTitle>
          <DialogContent>
            <Typography variant="body1">{errorMsg}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setErrorMsg(null)}>Fechar</Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Caixa Management Dialog */}
      <Dialog open={caixaDialogOpen !== null} onClose={() => setCaixaDialogOpen(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, textTransform: 'capitalize' }}>
          {caixaDialogOpen === 'abrir' ? 'Abrir Caixa' : 
           caixaDialogOpen === 'fechar' ? 'Fechar Caixa' : 
           caixaDialogOpen === 'sangria' ? 'Sangria (Retirada)' : 'Suprimento (Entrada)'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {caixaDialogOpen === 'abrir' ? 'Informe o valor inicial em gaveta (Fundo de Troco).' :
               caixaDialogOpen === 'fechar' ? 'Informe o valor total de dinheiro atualmente em gaveta.' :
               caixaDialogOpen === 'sangria' ? 'Informe o valor sendo retirado da gaveta.' :
               'Informe o valor sendo adicionado à gaveta.'}
            </Typography>
            <TextField
              label="Valor (R$)"
              type="number"
              fullWidth
              value={caixaInputValue}
              onChange={(e) => setCaixaInputValue(e.target.value)}
            />
            {(caixaDialogOpen === 'sangria' || caixaDialogOpen === 'suprimento') && (
              <TextField
                label="Motivo / Observação"
                fullWidth
                value={caixaInputMotivo}
                onChange={(e) => setCaixaInputMotivo(e.target.value)}
              />
            )}
            {caixaDialogOpen === 'fechar' && (
              <Button 
                variant="outlined" 
                color="info" 
                startIcon={<FileText size={18} />} 
                onClick={() => { setRelatorioTurnoId('current'); setRelatorioOpen(true); }}
              >
                Ver Prévia do Relatório
              </Button>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setCaixaDialogOpen(null)}>Cancelar</Button>
          <Button
            variant="contained"
            color={caixaDialogOpen === 'fechar' || caixaDialogOpen === 'sangria' ? 'error' : 'success'}
            disabled={!caixaInputValue || Number(caixaInputValue) < 0 || ((caixaDialogOpen === 'sangria' || caixaDialogOpen === 'suprimento') && !caixaInputMotivo)}
            onClick={() => {
              const val = Number(caixaInputValue);
              if (caixaDialogOpen === 'abrir') abrirCaixaMutation.mutate(val);
              else if (caixaDialogOpen === 'fechar') fecharCaixaMutation.mutate(val);
              else if (caixaDialogOpen === 'sangria' || caixaDialogOpen === 'suprimento') {
                movimentacaoCaixaMutation.mutate({ tipo: caixaDialogOpen, valor: val, motivo: caixaInputMotivo });
              }
            }}
          >
            Confirmar
          </Button>
        </DialogActions>
      </Dialog>
    </Grid>

    {/* OVERLAY DE CAIXA FECHADO */}
    {caixaStatus && caixaStatus.status !== 'aberto' && (
      <Box sx={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        bgcolor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        zIndex: 1200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }}>
        <Paper elevation={24} sx={{ p: 4, borderRadius: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 400, textAlign: 'center' }}>
          <DollarSign size={64} style={{ color: theme.palette.error.main, marginBottom: 16 }} />
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>Caixa Fechado</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Você precisa abrir o caixa para iniciar as vendas, registrar pedidos e cobrar mesas.
          </Typography>
          <Button variant="contained" color="success" size="large" fullWidth sx={{ fontWeight: 700 }} onClick={() => setCaixaDialogOpen('abrir')}>
            Abrir Caixa Agora
          </Button>
        </Paper>
      </Box>
    )}

    {/* Relatorio de Caixa Modal */}
    <RelatorioCaixaModal
      isOpen={relatorioOpen}
      onClose={() => setRelatorioOpen(false)}
      turnoId={relatorioTurnoId}
      userRole={user?.role || ''}
      isClosed={relatorioTurnoId !== 'current'}
    />

    </Box>
  );
};

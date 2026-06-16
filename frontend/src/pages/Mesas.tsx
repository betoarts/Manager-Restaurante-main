import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Box,
  Paper,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  TextField,
  Chip,
  Divider,
  List,
  ListItem,
  CircularProgress,
  useTheme,
  Tab,
  Tabs,
} from '@mui/material';
import { RefreshCw, ShoppingCart, Clock, CheckCircle2 } from 'lucide-react';
import { api } from '../utils/api';
import { useStore } from '../store/useStore';
import type { Mesa, Pedido } from '../types';

export const Mesas: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { tables, setTables, updateTableState, setSelectedTableId, socketConnected } = useStore();
  const [selectedTable, setSelectedTable] = useState<Mesa | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState(0);
  const [statusInput, setStatusInput] = useState<'livre' | 'ocupada' | 'reservada' | 'em_fechamento'>('livre');

  // 1. Fetch tables
  const { data: tablesData, refetch } = useQuery<Mesa[]>({
    queryKey: ['tables-map'],
    queryFn: () => api.get<Mesa[]>('/api/tables'),
  });

  React.useEffect(() => {
    if (tablesData) {
      setTables(tablesData);
    }
  }, [tablesData, setTables]);

  // Re-fetch if websocket connects
  React.useEffect(() => {
    if (socketConnected) {
      refetch();
    }
  }, [socketConnected, refetch]);

  // 2. Fetch orders for selected table
  const { data: tableOrders = [], isLoading: ordersLoading } = useQuery<Pedido[]>({
    queryKey: ['table-orders-map', selectedTable?.id],
    queryFn: () => api.get<Pedido[]>(`/api/tables/${selectedTable?.id}/orders`),
    enabled: !!selectedTable && dialogOpen,
  });

  // Mutation to update table properties
  const updateTableMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Mesa> }) =>
      api.put<Mesa>(`/api/tables/${id}`, payload),
    onSuccess: (updatedMesa) => {
      updateTableState(updatedMesa);
      if (selectedTable && updatedMesa.id === selectedTable.id) {
        setSelectedTable(updatedMesa);
        setStatusInput(updatedMesa.status);
      }
    },
  });

  const handleTableClick = (table: Mesa) => {
    setSelectedTable(table);
    setStatusInput(table.status);
    setDialogTab(0);
    setDialogOpen(true);
  };

  const handleStatusSave = () => {
    if (selectedTable) {
      updateTableMutation.mutate({
        id: selectedTable.id,
        payload: { status: statusInput },
      });
    }
  };

  const handleOpenInPDV = (table: Mesa) => {
    setSelectedTableId(table.id);
    setDialogOpen(false);
    navigate('/pdv');
  };

  // Drag & Drop tracking variables
  const [draggedTableId, setDraggedTableId] = useState<number | null>(null);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent, table: Mesa) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    setDraggedTableId(table.id);
    setDragStartPos({ x: clientX, y: clientY });
    setDragOffset({ x: table.pos_x, y: table.pos_y });
  };

  const handleDragOver = (e: React.MouseEvent | React.TouchEvent) => {
    if (draggedTableId === null) return;
    e.preventDefault();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const deltaX = clientX - dragStartPos.x;
    const deltaY = clientY - dragStartPos.y;

    const newX = dragOffset.x + deltaX;
    const newY = dragOffset.y + deltaY;

    const tableToUpdate = tables.find((t) => t.id === draggedTableId);
    if (tableToUpdate) {
      updateTableState({ ...tableToUpdate, pos_x: newX, pos_y: newY });
    }
  };

  const handleDragEnd = () => {
    if (draggedTableId === null) return;

    const tableToSave = tables.find((t) => t.id === draggedTableId);
    if (tableToSave) {
      updateTableMutation.mutate({
        id: tableToSave.id,
        payload: { pos_x: tableToSave.pos_x, pos_y: tableToSave.pos_y },
      });
    }

    setDraggedTableId(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ocupada':
        return theme.palette.error.main;
      case 'reservada':
        return theme.palette.warning.main;
      case 'em_fechamento':
        return theme.palette.secondary.main;
      default:
        return theme.palette.success.main;
    }
  };

  const getItemStatusColor = (status: string) => {
    switch (status) {
      case 'produzindo':
        return 'warning';
      case 'pronto':
        return 'success';
      case 'entregue':
        return 'default';
      default:
        return 'info';
    }
  };

  // Flatten items from all table orders
  const allTableItems = tableOrders.flatMap((o) => o.itens);
  const tableTotal = tableOrders.reduce((sum, o) => sum + o.total, 0);

  return (
    <Box sx={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Clique nas mesas para ver detalhes e pedidos, ou <strong>arraste e solte</strong> para reordenar o mapa do salão.
        </Typography>
        <IconButton onClick={() => refetch()} size="small">
          <RefreshCw size={18} />
        </IconButton>
      </Box>

      {/* Grid Canvas */}
      <Paper
        elevation={0}
        onMouseMove={handleDragOver}
        onTouchMove={handleDragOver}
        onMouseUp={handleDragEnd}
        onTouchEnd={handleDragEnd}
        sx={{
          flexGrow: 1,
          position: 'relative',
          borderRadius: 4,
          border: `1px dashed ${theme.palette.divider}`,
          overflow: 'hidden',
          background: theme.palette.mode === 'dark'
            ? 'radial-gradient(#1e293b 1px, transparent 1px)'
            : 'radial-gradient(#e2e8f0 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          minHeight: 400,
        }}
      >
        {tables.map((table) => {
          const statusColor = getStatusColor(table.status);

          return (
            <Box
              key={table.id}
              onMouseDown={(e) => handleDragStart(e, table)}
              onTouchStart={(e) => handleDragStart(e, table)}
              onClick={() => {
                if (draggedTableId === null) handleTableClick(table);
              }}
              sx={{
                position: 'absolute',
                left: table.pos_x,
                top: table.pos_y,
                width: 100,
                height: 100,
                borderRadius: '50%',
                bgcolor: theme.palette.background.paper,
                border: `3px solid ${statusColor}`,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: draggedTableId === table.id ? 'grabbing' : 'pointer',
                userSelect: 'none',
                touchAction: 'none',
                transition: draggedTableId === table.id ? 'none' : 'box-shadow 0.2s',
                zIndex: draggedTableId === table.id ? 1000 : 10,
                '&:hover': {
                  boxShadow: '0 8px 16px rgba(0,0,0,0.15)',
                },
              }}
            >
              <Typography variant="h6" color="text.primary" sx={{ fontWeight: 800 }}>
                {table.numero}
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, color: statusColor, textTransform: 'uppercase', fontSize: '9px' }}>
                {table.status.replace('_', ' ')}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '8px' }}>
                {table.capacidade} Lugares
              </Typography>
            </Box>
          );
        })}
      </Paper>

      {/* Detail Dialog with Tabs: Status + Orders */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          Mesa {selectedTable?.numero}
          <Chip
            label={selectedTable?.status.replace('_', ' ') || ''}
            size="small"
            sx={{
              ml: 1.5,
              fontWeight: 700,
              bgcolor: getStatusBg(selectedTable?.status || 'livre'),
              color: '#fff',
              textTransform: 'uppercase',
              fontSize: '10px',
              verticalAlign: 'middle',
            }}
          />
        </DialogTitle>

        {/* Tabs: Status | Consumo */}
        <Tabs value={dialogTab} onChange={(_, v) => setDialogTab(v)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Status" sx={{ fontWeight: 600 }} />
          <Tab label="Consumo" sx={{ fontWeight: 600 }} />
        </Tabs>

        <DialogContent sx={{ minHeight: 200 }}>
          {dialogTab === 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
              <TextField
                select
                label="Alterar Status"
                value={statusInput}
                onChange={(e) => setStatusInput(e.target.value as any)}
                fullWidth
              >
                <MenuItem value="livre">Livre</MenuItem>
                <MenuItem value="ocupada">Ocupada</MenuItem>
                <MenuItem value="reservada">Reservada</MenuItem>
                <MenuItem value="em_fechamento">Em Fechamento</MenuItem>
              </TextField>
            </Box>
          )}

          {dialogTab === 1 && (
            <Box sx={{ mt: 1 }}>
              {ordersLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={32} />
                </Box>
              ) : allTableItems.length === 0 ? (
                <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
                  Nenhum pedido ativo nesta mesa.
                </Typography>
              ) : (
                <>
                  <List disablePadding>
                    {allTableItems.map((item, idx) => (
                      <React.Fragment key={idx}>
                        <ListItem disableGutters sx={{ display: 'flex', justifyContent: 'space-between', py: 1.2 }}>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {item.quantidade}x {item.produto_nome}
                            </Typography>
                            {item.observacao && (
                              <Typography variant="caption" color="error.main" sx={{ display: 'block', pl: 1, fontWeight: 600 }}>
                                * {item.observacao}
                              </Typography>
                            )}
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip
                              label={item.status}
                              size="small"
                              color={getItemStatusColor(item.status)}
                              icon={item.status === 'pronto' ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                              sx={{ fontWeight: 700, fontSize: '10px', textTransform: 'capitalize' }}
                            />
                            <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 70, textAlign: 'right' }}>
                              R$ {(item.preco_unitario * item.quantidade).toFixed(2)}
                            </Typography>
                          </Box>
                        </ListItem>
                        {idx < allTableItems.length - 1 && <Divider />}
                      </React.Fragment>
                    ))}
                  </List>
                  <Divider sx={{ my: 1.5 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Total</Typography>
                    <Typography variant="subtitle1" color="primary.main" sx={{ fontWeight: 800 }}>
                      R$ {tableTotal.toFixed(2)}
                    </Typography>
                  </Box>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, justifyContent: 'space-between' }}>
          <Button onClick={() => setDialogOpen(false)} color="inherit">Fechar</Button>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {dialogTab === 0 && (
              <Button onClick={handleStatusSave} variant="contained" disabled={updateTableMutation.isPending}>
                Salvar Status
              </Button>
            )}
            {selectedTable && (selectedTable.status === 'ocupada' || selectedTable.status === 'em_fechamento') && (
              <Button
                variant="contained"
                color="primary"
                startIcon={<ShoppingCart size={16} />}
                onClick={() => handleOpenInPDV(selectedTable)}
                sx={{ fontWeight: 700 }}
              >
                Abrir no PDV
              </Button>
            )}
          </Box>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// Helper for chip background color
function getStatusBg(status: string): string {
  switch (status) {
    case 'ocupada': return '#d32f2f';
    case 'reservada': return '#ed6c02';
    case 'em_fechamento': return '#9c27b0';
    default: return '#2e7d32';
  }
}

export default Mesas;

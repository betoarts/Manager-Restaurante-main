import React, { useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  useTheme,
  Skeleton,
} from '@mui/material';
import { Clock, AlertTriangle, CheckCircle2, Play, ChefHat, GlassWater, Dessert } from 'lucide-react';
import { api } from '../utils/api';
import { useStore } from '../store/useStore';
import type { Pedido } from '../types';

interface Setor {
  id: number;
  tenant_id: number;
  nome: string;
  ativo: boolean;
}

interface KDSProps {
  setor: 'cozinha' | 'bar' | 'sobremesa';
}

const setorConfig: Record<string, {
  icon: React.ReactNode;
  label: string;
  color: string;
  borderColor: string;
  defaultSetorId: number;
}> = {
  cozinha: {
    icon: <ChefHat size={28} />,
    label: 'Cozinha',
    color: '#ef4444',
    borderColor: '#ef4444',
    defaultSetorId: 1,
  },
  bar: {
    icon: <GlassWater size={28} />,
    label: 'Bar',
    color: '#3b82f6',
    borderColor: '#3b82f6',
    defaultSetorId: 2,
  },
  sobremesa: {
    icon: <Dessert size={28} />,
    label: 'Sobremesa',
    color: '#f59e0b',
    borderColor: '#f59e0b',
    defaultSetorId: 3,
  },
};

export const KDS: React.FC<KDSProps> = ({ setor }) => {
  const theme = useTheme();
  const config = setorConfig[setor];
  const { kdsOrders, setKDSOrders, addOrUpdateKDSOrder, socketConnected } = useStore();

  // Fetch the setor ID from API, fallback to defaults
  const { data: setores = [] } = useQuery<Setor[]>({
    queryKey: ['setores-kds'],
    queryFn: () => api.get<Setor[]>('/api/setores'),
    staleTime: 60000,
  });

  const activeSetorId = setores.find((s) => s.nome.toLowerCase() === setor)?.id || config.defaultSetorId;

  // Fetch KDS orders ONLY for this sector
  const { data: ordersData, refetch, isLoading } = useQuery<Pedido[]>({
    queryKey: ['kds-orders', setor, activeSetorId],
    queryFn: () => api.get<Pedido[]>(`/api/kds?setor_id=${activeSetorId}`),
  });

  useEffect(() => {
    if (ordersData) {
      setKDSOrders(ordersData);
    }
  }, [ordersData, setKDSOrders]);

  useEffect(() => {
    if (socketConnected) refetch();
  }, [socketConnected, refetch]);

  // Advance order status
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.put<Pedido>(`/api/orders/${id}`, { status }),
    onSuccess: (updatedOrder) => {
      addOrUpdateKDSOrder(updatedOrder);
    },
  });

  const getWaitTimeText = (createdAtStr: string) => {
    const diffMs = Date.now() - new Date(createdAtStr).getTime();
    return Math.floor(diffMs / 60000);
  };

  const getCardBorderColor = (order: Pedido) => {
    const mins = getWaitTimeText(order.created_at);
    if (order.status === 'pronto') return theme.palette.success.main;
    if (mins >= 20) return theme.palette.error.main;
    if (mins >= 10) return theme.palette.warning.main;
    return config.borderColor;
  };

  const activeOrders = kdsOrders.filter((o) =>
    o.status !== 'entregue' && o.status !== 'despachado'
  );

  if (isLoading) {
    return (
      <Grid container spacing={3}>
        {[1, 2, 3, 4].map((i) => (
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={i}>
            <Skeleton variant="rectangular" height={240} sx={{ borderRadius: 3 }} />
          </Grid>
        ))}
      </Grid>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          mb: 3,
          p: 3,
          borderRadius: 3,
          border: `2px solid ${config.color}`,
          bgcolor: theme.palette.mode === 'dark'
            ? `${config.color}10`
            : `${config.color}08`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ color: config.color }}>{config.icon}</Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.5px' }}>
                KDS — {config.label}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {activeOrders.length > 0
                  ? `${activeOrders.length} pedido(s) em andamento`
                  : 'Nenhum pedido pendente'}
              </Typography>
            </Box>
          </Box>
          {activeOrders.length > 0 && (
            <Chip
              label={activeOrders.length}
              color="error"
              sx={{
                fontWeight: 900,
                fontSize: '1.2rem',
                height: 48,
                width: 48,
                borderRadius: '50%',
                '& .MuiChip-label': { px: 0 },
              }}
            />
          )}
        </Box>
      </Paper>

      {/* Empty state */}
      {activeOrders.length === 0 && (
        <Paper
          elevation={0}
          sx={{
            py: 10,
            textAlign: 'center',
            borderRadius: 4,
            border: `1px dashed ${theme.palette.divider}`,
          }}
        >
          <CheckCircle2 size={56} strokeWidth={1} style={{ marginBottom: 16, color: theme.palette.success.main }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {config.label} está em ordem!
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Todos os pedidos foram preparados. Aguardando novos pedidos...
          </Typography>
        </Paper>
      )}

      {/* Orders Grid */}
      <Grid container spacing={3}>
        {activeOrders.map((order) => {
          const waitTime = getWaitTimeText(order.created_at);
          const borderColor = getCardBorderColor(order);

          // Filter only items for THIS sector (double safety)
          // setor_id = 0 means unclassified — show in all sectors
          const sectorItems = order.itens?.filter(
            (i) => i.setor_id === activeSetorId || i.setor_id === 0
          ) || [];

          // Skip if no items belong to this sector
          if (sectorItems.length === 0) return null;

          return (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={order.id}>
              <Card
                sx={{
                  borderLeft: `6px solid ${borderColor}`,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <CardContent sx={{ p: 2.5, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                  {/* Header */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: '-0.5px' }}>
                        Pedido #{order.id}
                      </Typography>
                      {order.mesa_id && (
                        <Chip
                          label={`Mesa ${order.mesa_id}`}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ mt: 0.5, fontWeight: 700 }}
                        />
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: waitTime >= 15 ? 'error.main' : 'text.secondary' }}>
                      {waitTime >= 15 ? <AlertTriangle size={16} /> : <Clock size={16} />}
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        {waitTime} min
                      </Typography>
                    </Box>
                  </Box>

                  <Divider sx={{ my: 1 }} />

                  {/* Items */}
                  <Box sx={{ flexGrow: 1, my: 1.5 }}>
                    {sectorItems.map((item, idx) => (
                      <Box key={idx} sx={{ mb: 1.2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip
                            label={item.quantidade}
                            size="small"
                            color="primary"
                            sx={{ fontWeight: 800, minWidth: 32, height: 24 }}
                          />
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {item.produto_nome}
                          </Typography>
                        </Box>
                        {item.observacao && (
                          <Typography
                            variant="caption"
                            color="error.main"
                            sx={{ display: 'block', pl: 5, mt: 0.3, fontWeight: 600 }}
                          >
                            * {item.observacao}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Box>

                  <Divider sx={{ my: 1 }} />

                  {/* Actions */}
                  <Box sx={{ mt: 1 }}>
                    {order.status === 'recebido' && (
                      <Button
                        variant="contained"
                        fullWidth
                        startIcon={<Play size={16} />}
                        onClick={() => updateStatusMutation.mutate({ id: order.id, status: 'produzindo' })}
                        disabled={updateStatusMutation.isPending}
                        sx={{ bgcolor: config.color, '&:hover': { bgcolor: config.color }, fontWeight: 700 }}
                      >
                        Iniciar Preparo
                      </Button>
                    )}
                    {order.status === 'produzindo' && (
                      <Button
                        variant="contained"
                        fullWidth
                        startIcon={<CheckCircle2 size={16} />}
                        onClick={() => updateStatusMutation.mutate({ id: order.id, status: 'pronto' })}
                        disabled={updateStatusMutation.isPending}
                        sx={{ bgcolor: config.color, '&:hover': { bgcolor: config.color }, fontWeight: 700 }}
                      >
                        Concluir Preparo
                      </Button>
                    )}
                    {order.status === 'pronto' && (
                      <Button
                        variant="contained"
                        fullWidth
                        startIcon={<CheckCircle2 size={16} />}
                        onClick={() => updateStatusMutation.mutate({ id: order.id, status: 'despachado' })}
                        disabled={updateStatusMutation.isPending}
                        sx={{ bgcolor: theme.palette.success.main, '&:hover': { bgcolor: theme.palette.success.dark }, fontWeight: 800, py: 1.5 }}
                      >
                        Liberar Pedido
                      </Button>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
};

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  useTheme,
  Button,
} from '@mui/material';
import {
  DollarSign,
  TrendingUp,
  Clock,
  Utensils,
  ChevronUp,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { api } from '../utils/api';
import { useStore } from '../store/useStore';
import RelatorioCaixaModal from '../components/RelatorioCaixaModal';
import { FileText } from 'lucide-react';

interface DashboardStats {
  sales_today: number;
  active_orders: number;
  occupied_tables: number;
  ticket_medio: number;
  top_products: Array<{
    produto_nome: string;
    total_vendido: number;
    quantidade: number;
  }>;
  hourly_sales: Array<{
    hour: number;
    total: number;
  }>;
}

export const Dashboard: React.FC = () => {
  const theme = useTheme();
  const socketConnected = useStore((state) => state.socketConnected);
  const user = useStore((state) => state.user);

  const [relatorioOpen, setRelatorioOpen] = React.useState(false);
  const [relatorioTurnoId, setRelatorioTurnoId] = React.useState<string | number>('');

  // Load stats from server
  const { data: stats, refetch } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get<DashboardStats>('/api/dashboard/stats'),
    refetchInterval: 15000, // Refresh stats every 15s or on demand
  });

  // Re-fetch statistics when socket notifies order changes
  React.useEffect(() => {
    if (socketConnected) {
      refetch();
    }
  }, [socketConnected, refetch]);

  // Load Caixa Turnos history
  const { data: turnos } = useQuery<any[]>({
    queryKey: ['caixa-turnos'],
    queryFn: () => api.get<any[]>('/api/caixa/turnos').then(res => res),
    enabled: user?.role === 'admin' || user?.role === 'gerente',
  });

  const cards = [
    {
      title: 'Vendas do Dia',
      value: stats ? `R$ ${stats.sales_today.toFixed(2)}` : 'R$ 0,00',
      icon: <DollarSign size={24} />,
      color: theme.palette.primary.main,
      trend: '+12.5% em relação a ontem',
    },
    {
      title: 'Pedidos Ativos',
      value: stats ? stats.active_orders.toString() : '0',
      icon: <Clock size={24} />,
      color: theme.palette.warning.main,
      trend: 'Média de preparo: 18 min',
    },
    {
      title: 'Mesas Ocupadas',
      value: stats ? `${stats.occupied_tables}/15` : '0/15',
      icon: <Utensils size={24} />,
      color: theme.palette.success.main,
      trend: 'Taxa de ocupação: 45%',
    },
    {
      title: 'Ticket Médio',
      value: stats ? `R$ ${stats.ticket_medio.toFixed(2)}` : 'R$ 0,00',
      icon: <TrendingUp size={24} />,
      color: theme.palette.secondary.main,
      trend: 'Aumento de 2.1% esta semana',
    },
  ];

  // Chart colors
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF'];

  if (!stats) {
    return (
      <Box>
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {[1, 2, 3, 4].map((i) => (
            <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
              <Card>
                <CardContent>
                  <Skeleton variant="text" width="60%" height={24} />
                  <Skeleton variant="text" width="40%" height={36} />
                  <Skeleton variant="text" width="80%" height={16} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 8 }}>
            <Skeleton variant="rectangular" height={350} sx={{ borderRadius: 4 }} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Skeleton variant="rectangular" height={350} sx={{ borderRadius: 4 }} />
          </Grid>
        </Grid>
      </Box>
    );
  }

  return (
    <Box>
      {/* Metric Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {cards.map((card, idx) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={idx}>
            <Card sx={{ position: 'relative', overflow: 'hidden' }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    {card.title}
                  </Typography>
                  <Box
                    sx={{
                      p: 1,
                      borderRadius: '8px',
                      color: '#ffffff',
                      bgcolor: card.color,
                      display: 'flex',
                    }}
                  >
                    {card.icon}
                  </Box>
                </Box>
                <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, letterSpacing: '-1px' }}>
                  {card.value}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <ChevronUp size={14} style={{ color: theme.palette.success.main }} />
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                    {card.trend}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Graphs Section */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Hourly Sales Area Chart */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>
                Vendas por Hora (Fluxo do Caixa)
              </Typography>
              <Box sx={{ height: 300, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={stats?.hourly_sales || []}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={theme.palette.primary.main} stopOpacity={0.4}/>
                        <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.mode === 'dark' ? '#334155' : '#e2e8f0'} />
                    <XAxis 
                      dataKey="hour" 
                      tickFormatter={(hour) => `${hour}h`} 
                      tickLine={false} 
                      axisLine={false}
                      stroke={theme.palette.text.secondary}
                      style={{ fontSize: 12 }}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false}
                      stroke={theme.palette.text.secondary}
                      style={{ fontSize: 12 }}
                    />
                    <Tooltip 
                      formatter={(val) => [`R$ ${Number(val).toFixed(2)}`, 'Vendas']}
                      labelFormatter={(h) => `Horário: ${h}h`}
                      contentStyle={{ 
                        backgroundColor: theme.palette.background.paper, 
                        borderColor: theme.palette.divider,
                        borderRadius: 8,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke={theme.palette.primary.main}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorTotal)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Top Products Pie/Bar */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>
                Produtos mais Vendidos
              </Typography>
              <Box sx={{ height: 300, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {stats?.top_products && stats.top_products.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={stats.top_products}
                      layout="vertical"
                      margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme.palette.mode === 'dark' ? '#334155' : '#e2e8f0'} />
                      <XAxis type="number" hide />
                      <YAxis 
                        dataKey="produto_nome" 
                        type="category" 
                        axisLine={false} 
                        tickLine={false}
                        stroke={theme.palette.text.primary}
                        style={{ fontSize: 11, fontWeight: 600 }}
                        width={120}
                      />
                      <Tooltip
                        formatter={(val) => [val, 'Quantidade']}
                        contentStyle={{ 
                          backgroundColor: theme.palette.background.paper, 
                          borderColor: theme.palette.divider,
                          borderRadius: 8,
                        }}
                      />
                      <Bar dataKey="quantidade" radius={[0, 4, 4, 0]}>
                        {(stats.top_products || []).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Nenhum pedido efetuado hoje.
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Top Products Details Table */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ px: 3, py: 2.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Desempenho de Itens do Cardápio
            </Typography>
          </Box>
          <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 0 }}>
            <Table sx={{ minWidth: 600 }}>
              <TableHead sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
                <TableRow>
                  <TableCell><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Nome do Produto</Typography></TableCell>
                  <TableCell align="center"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Quant. Vendida</Typography></TableCell>
                  <TableCell align="right"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Receita Gerada</Typography></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stats?.top_products && stats.top_products.length > 0 ? (
                  stats.top_products.map((row) => (
                    <TableRow key={row.produto_nome} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                      <TableCell component="th" scope="row">
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.produto_nome}</Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{row.quantidade}x</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="primary.main" sx={{ fontWeight: 600 }}>
                          R$ {row.total_vendido.toFixed(2)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} align="center" sx={{ py: 6 }}>
                      <Typography variant="body2" color="text.secondary">
                        Nenhum registro encontrado para a data de hoje.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Relatório de Turnos (Admin/Gerente) */}
      {(user?.role === 'admin' || user?.role === 'gerente') && (
        <Card sx={{ mt: 4 }}>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ px: 3, py: 2.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Últimos Turnos de Caixa
              </Typography>
            </Box>
            <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 0 }}>
              <Table sx={{ minWidth: 600 }}>
                <TableHead sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
                  <TableRow>
                    <TableCell><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Turno ID</Typography></TableCell>
                    <TableCell><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Status</Typography></TableCell>
                    <TableCell><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Aberto Em</Typography></TableCell>
                    <TableCell><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Fechado Em</Typography></TableCell>
                    <TableCell align="right"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Ações</Typography></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {turnos && turnos.length > 0 ? (
                    turnos.map((turno) => (
                      <TableRow key={turno.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                        <TableCell component="th" scope="row">
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>#{turno.id}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color={turno.status === 'aberto' ? 'success.main' : 'error.main'} sx={{ fontWeight: 600 }}>
                            {turno.status.toUpperCase()}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{new Date(turno.aberto_em).toLocaleString()}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{turno.fechado_em ? new Date(turno.fechado_em).toLocaleString() : '-'}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Button 
                            variant="outlined" 
                            size="small" 
                            startIcon={<FileText size={16} />}
                            onClick={() => { setRelatorioTurnoId(turno.id); setRelatorioOpen(true); }}
                          >
                            Ver Relatório
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                        <Typography variant="body2" color="text.secondary">
                          Nenhum turno registrado.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Relatorio de Caixa Modal */}
      <RelatorioCaixaModal
        isOpen={relatorioOpen}
        onClose={() => setRelatorioOpen(false)}
        turnoId={relatorioTurnoId}
        userRole={user?.role || ''}
        isClosed={true}
      />
    </Box>
  );
};

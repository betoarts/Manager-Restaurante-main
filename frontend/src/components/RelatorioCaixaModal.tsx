import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, DollarSign, ArrowUpRight, ArrowDownRight, CreditCard, Wallet, ReceiptText, Lock } from 'lucide-react';
import { api } from '../utils/api';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  Box, 
  Typography, 
  IconButton, 
  Grid, 
  Paper,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
  alpha
} from '@mui/material';

interface RelatorioCaixaModalProps {
  isOpen: boolean;
  onClose: () => void;
  turnoId: string | number;
  userRole: string;
  isClosed?: boolean;
}

interface MetodoTotal {
  metodo: string;
  total: number;
}

interface Movimentacao {
  id: number;
  tipo: string;
  valor: number;
  motivo: string;
  created_at: string;
}

interface RelatorioData {
  turno: {
    id: number;
    status: string;
    valor_inicial: number;
    valor_final: number;
    aberto_em: string;
    fechado_em: string | null;
  };
  total_vendas: number;
  total_sangrias: number;
  total_suprimentos: number;
  saldo_calculado: number;
  vendas_por_metodo: MetodoTotal[];
  movimentacoes: Movimentacao[];
}

export default function RelatorioCaixaModal({ isOpen, onClose, turnoId, userRole, isClosed }: RelatorioCaixaModalProps) {
  const theme = useTheme();
  const { data, isLoading, error } = useQuery<RelatorioData>({
    queryKey: ['relatorioCaixa', turnoId],
    queryFn: async () => {
      const response = await api.get<RelatorioData>(`/api/caixa/relatorio/${turnoId}`);
      return response;
    },
    enabled: isOpen,
  });

  const canViewSaldo = userRole === 'admin' || userRole === 'gerente';
  const shouldHideSaldo = !canViewSaldo && turnoId === 'current';

  return (
    <Dialog open={isOpen} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 3, pb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ 
            width: 48, height: 48, borderRadius: '50%', 
            bgcolor: alpha(theme.palette.primary.main, 0.1), 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: theme.palette.primary.main 
          }}>
            <ReceiptText size={28} />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>Relatório de Caixa</Typography>
            <Typography variant="body2" color="text.secondary">
              Turno #{data?.turno?.id || turnoId} {data?.turno?.status === 'fechado' ? '(Fechado)' : '(Aberto)'}
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose}><X size={24} /></IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 3, pt: 1 }} dividers>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Box sx={{ p: 3, bgcolor: alpha(theme.palette.error.main, 0.1), color: theme.palette.error.main, borderRadius: 2 }}>
            <Typography>Erro ao carregar o relatório.</Typography>
          </Box>
        ) : data ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            
            {/* Grid de Resumo */}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: alpha(theme.palette.grey[500], 0.05) }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: 'text.secondary' }}>
                    <Wallet size={18} />
                    <Typography variant="body2" fontWeight={600}>Fundo de Troco</Typography>
                  </Box>
                  <Typography variant="h6" fontWeight={800}>R$ {data.turno.valor_inicial.toFixed(2)}</Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: alpha(theme.palette.success.main, 0.05), borderColor: alpha(theme.palette.success.main, 0.2) }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: theme.palette.success.main }}>
                    <DollarSign size={18} />
                    <Typography variant="body2" fontWeight={600}>Vendas</Typography>
                  </Box>
                  <Typography variant="h6" fontWeight={800} color="success.main">+ R$ {data.total_vendas.toFixed(2)}</Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: alpha(theme.palette.error.main, 0.05), borderColor: alpha(theme.palette.error.main, 0.2) }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: theme.palette.error.main }}>
                    <ArrowDownRight size={18} />
                    <Typography variant="body2" fontWeight={600}>Sangrias</Typography>
                  </Box>
                  <Typography variant="h6" fontWeight={800} color="error.main">- R$ {data.total_sangrias.toFixed(2)}</Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: alpha(theme.palette.info.main, 0.05), borderColor: alpha(theme.palette.info.main, 0.2) }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: theme.palette.info.main }}>
                    <ArrowUpRight size={18} />
                    <Typography variant="body2" fontWeight={600}>Suprimentos</Typography>
                  </Box>
                  <Typography variant="h6" fontWeight={800} color="info.main">+ R$ {data.total_suprimentos.toFixed(2)}</Typography>
                </Paper>
              </Grid>
            </Grid>

            {/* Saldo Calculado */}
            <Paper 
              elevation={0} 
              sx={{ 
                p: 3, 
                borderRadius: 3, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                bgcolor: shouldHideSaldo ? alpha(theme.palette.grey[500], 0.1) : alpha(theme.palette.primary.main, 0.1),
                border: 1,
                borderColor: shouldHideSaldo ? alpha(theme.palette.grey[500], 0.2) : alpha(theme.palette.primary.main, 0.3)
              }}
            >
              <Box>
                <Typography variant="h6" fontWeight={800} gutterBottom>Saldo Calculado em Caixa</Typography>
                <Typography variant="body2" color="text.secondary">Valor esperado na gaveta (Troco + Vendas + Suprimentos - Sangrias)</Typography>
              </Box>
              {shouldHideSaldo ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: alpha(theme.palette.grey[500], 0.2), px: 2, py: 1, borderRadius: 2, color: 'text.secondary' }}>
                  <Lock size={20} />
                  <Typography fontWeight={700}>Valor Oculto</Typography>
                </Box>
              ) : (
                <Typography variant="h4" fontWeight={800} color="primary.main">
                  R$ {data.saldo_calculado.toFixed(2)}
                </Typography>
              )}
            </Paper>

            {data.turno.status === 'fechado' && canViewSaldo && (
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Typography variant="body2" color="text.secondary" mb={1}>Valor Informado no Fechamento</Typography>
                    <Typography variant="h6" fontWeight={800}>R$ {data.turno.valor_final.toFixed(2)}</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6}>
                  <Paper variant="outlined" sx={{ 
                    p: 2, borderRadius: 2,
                    bgcolor: data.turno.valor_final >= data.saldo_calculado ? (data.turno.valor_final === data.saldo_calculado ? alpha(theme.palette.success.main, 0.1) : alpha(theme.palette.warning.main, 0.1)) : alpha(theme.palette.error.main, 0.1) 
                  }}>
                    <Typography variant="body2" color="text.secondary" mb={1}>Diferença (Quebra)</Typography>
                    <Typography variant="h6" fontWeight={800} color={data.turno.valor_final >= data.saldo_calculado ? (data.turno.valor_final === data.saldo_calculado ? 'success.main' : 'warning.main') : 'error.main'}>
                      R$ {(data.turno.valor_final - data.saldo_calculado).toFixed(2)}
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
            )}

            <Grid container spacing={3}>
              {/* Vendas por Pagamento */}
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', height: '100%' }}>
                  <Box sx={{ px: 2, py: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.05), borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CreditCard size={18} color={theme.palette.primary.main} />
                    <Typography variant="subtitle2" fontWeight={700}>Vendas por Pagamento</Typography>
                  </Box>
                  <Box sx={{ p: 2 }}>
                    {data.vendas_por_metodo && data.vendas_por_metodo.length > 0 ? (
                      data.vendas_por_metodo.map((v, i) => (
                        <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: i < data.vendas_por_metodo.length - 1 ? 1 : 0, borderColor: 'divider' }}>
                          <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>{v.metodo.replace('_', ' ')}</Typography>
                          <Typography variant="body2" fontWeight={700}>R$ {v.total.toFixed(2)}</Typography>
                        </Box>
                      ))
                    ) : (
                      <Typography variant="body2" color="text.secondary" align="center" py={2}>Nenhuma venda registrada.</Typography>
                    )}
                  </Box>
                </Paper>
              </Grid>

              {/* Movimentações Extras */}
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <Box sx={{ px: 2, py: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.05), borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ReceiptText size={18} color={theme.palette.primary.main} />
                    <Typography variant="subtitle2" fontWeight={700}>Movimentações Extras</Typography>
                  </Box>
                  <TableContainer sx={{ flex: 1, maxHeight: 200 }}>
                    <Table stickyHeader size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Tipo</TableCell>
                          <TableCell>Valor</TableCell>
                          <TableCell>Motivo</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.movimentacoes && data.movimentacoes.length > 0 ? (
                          data.movimentacoes.map((mov) => (
                            <TableRow key={mov.id}>
                              <TableCell sx={{ textTransform: 'capitalize', color: mov.tipo === 'sangria' ? 'error.main' : 'info.main', fontWeight: 600 }}>
                                {mov.tipo}
                              </TableCell>
                              <TableCell fontWeight={700}>R$ {mov.valor.toFixed(2)}</TableCell>
                              <TableCell>{mov.motivo}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} align="center" sx={{ py: 3, color: 'text.secondary' }}>Nenhuma movimentação</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              </Grid>
            </Grid>

          </Box>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

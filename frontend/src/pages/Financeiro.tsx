import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  useTheme,
  Tabs,
  Tab,
  Grid,
} from '@mui/material';
import { DollarSign, CheckCircle2, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { api } from '../utils/api';
import type { ContaPagar, LancamentoFinanceiro } from '../types';

export const Financeiro: React.FC = () => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);

  const { data: contas = [], refetch: refetchContas } = useQuery<ContaPagar[]>({
    queryKey: ['contas-pagar'],
    queryFn: () => api.get<ContaPagar[]>('/api/contas-pagar'),
  });

  const { data: extrato = [], refetch: refetchExtrato } = useQuery<LancamentoFinanceiro[]>({
    queryKey: ['financeiro-extrato'],
    queryFn: () => api.get<LancamentoFinanceiro[]>('/api/financeiro/extrato'),
  });

  const payConta = useMutation({
    mutationFn: (id: number) => api.put(`/api/contas-pagar/${id}/pay`),
    onSuccess: () => {
      refetchContas();
      refetchExtrato(); // Refresh the extrato since a despesa was added
    },
  });

  const pendentes = contas.filter((c) => c.status === 'pendente');
  const pagas = contas.filter((c) => c.status === 'paga');

  const totalReceitas = extrato.filter(e => e.tipo === 'receita').reduce((acc, curr) => acc + curr.valor, 0);
  const totalDespesas = extrato.filter(e => e.tipo === 'despesa').reduce((acc, curr) => acc + curr.valor, 0);
  const saldo = totalReceitas - totalDespesas;

  const getStatusColor = (vencimento: string, status: string) => {
    if (status === 'paga') return 'success';
    const isLate = new Date(vencimento) < new Date(new Date().setHours(0, 0, 0, 0));
    return isLate ? 'error' : 'warning';
  };

  const getStatusLabel = (vencimento: string, status: string) => {
    if (status === 'paga') return 'Paga';
    const isLate = new Date(vencimento) < new Date(new Date().setHours(0, 0, 0, 0));
    return isLate ? 'Atrasada' : 'Pendente';
  };

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', gap: 2, alignItems: 'center' }}>
        <Box sx={{ p: 2, borderRadius: 2, bgcolor: theme.palette.primary.main, color: '#fff' }}>
          <DollarSign size={24} />
        </Box>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>Financeiro</Typography>
          <Typography variant="body2" color="text.secondary">Gestão de Fluxo de Caixa e Contas</Typography>
        </Box>
      </Box>

      {/* DASHBOARD */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 4, border: `1px solid ${theme.palette.divider}`, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(76, 175, 80, 0.1)', color: '#4caf50' }}>
              <TrendingUp size={28} />
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>Total Receitas</Typography>
              <Typography variant="h5" fontWeight={800} color="#4caf50">R$ {totalReceitas.toFixed(2)}</Typography>
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 4, border: `1px solid ${theme.palette.divider}`, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(244, 67, 54, 0.1)', color: '#f44336' }}>
              <TrendingDown size={28} />
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>Total Despesas</Typography>
              <Typography variant="h5" fontWeight={800} color="#f44336">R$ {totalDespesas.toFixed(2)}</Typography>
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 4, border: `1px solid ${theme.palette.divider}`, display: 'flex', alignItems: 'center', gap: 2, bgcolor: theme.palette.primary.main, color: '#fff' }}>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(255, 255, 255, 0.2)' }}>
              <Wallet size={28} />
            </Box>
            <Box>
              <Typography variant="body2" sx={{ opacity: 0.8 }} fontWeight={600}>Saldo Atual</Typography>
              <Typography variant="h5" fontWeight={800}>R$ {saldo.toFixed(2)}</Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <Paper elevation={0} sx={{ mb: 3, borderRadius: 3, border: `1px solid ${theme.palette.divider}` }}>
        <Tabs value={activeTab} onChange={(_, val) => setActiveTab(val)} sx={{ px: 1 }}>
          <Tab label={`Extrato Geral (${extrato.length})`} sx={{ fontWeight: 600, py: 2 }} />
          <Tab label={`Contas a Pagar (${pendentes.length})`} sx={{ fontWeight: 600, py: 2 }} />
          <Tab label={`Histórico de Pagas (${pagas.length})`} sx={{ fontWeight: 600, py: 2 }} />
        </Tabs>
      </Paper>

      {/* Tab 0: Extrato Geral */}
      {activeTab === 0 && (
        <TableContainer component={Paper} sx={{ borderRadius: 4, border: `1px solid ${theme.palette.divider}` }}>
          <Table>
            <TableHead sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
              <TableRow>
                <TableCell><strong>Data</strong></TableCell>
                <TableCell><strong>Tipo</strong></TableCell>
                <TableCell><strong>Categoria</strong></TableCell>
                <TableCell><strong>Descrição</strong></TableCell>
                <TableCell align="right"><strong>Valor (R$)</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {extrato.map((lanc) => (
                <TableRow key={lanc.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{new Date(lanc.data).toLocaleString()}</TableCell>
                  <TableCell>
                    <Chip 
                      label={lanc.tipo === 'receita' ? 'Entrada' : 'Saída'} 
                      color={lanc.tipo === 'receita' ? 'success' : 'error'} 
                      size="small" 
                      sx={{ fontWeight: 700 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip label={lanc.categoria} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{lanc.descricao}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: lanc.tipo === 'receita' ? 'success.main' : 'error.main' }}>
                    {lanc.tipo === 'receita' ? '+' : '-'} R$ {lanc.valor.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
              {extrato.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 6, opacity: 0.5 }}>
                    <Typography>Nenhum lançamento no extrato.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Tab 1: Pendentes */}
      {activeTab === 1 && (
        <TableContainer component={Paper} sx={{ borderRadius: 4, border: `1px solid ${theme.palette.divider}` }}>
          <Table>
            <TableHead sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
              <TableRow>
                <TableCell><strong>Vencimento</strong></TableCell>
                <TableCell><strong>Descrição</strong></TableCell>
                <TableCell><strong>Fornecedor</strong></TableCell>
                <TableCell align="center"><strong>Status</strong></TableCell>
                <TableCell align="right"><strong>Valor (R$)</strong></TableCell>
                <TableCell align="right"><strong>Ações</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pendentes.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{new Date(c.data_vencimento).toLocaleDateString()}</TableCell>
                  <TableCell>{c.descricao}</TableCell>
                  <TableCell>{c.fornecedor?.nome || '-'}</TableCell>
                  <TableCell align="center">
                    <Chip
                      label={getStatusLabel(c.data_vencimento, c.status)}
                      color={getStatusColor(c.data_vencimento, c.status) as any}
                      size="small"
                      sx={{ fontWeight: 600 }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>R$ {c.valor.toFixed(2)}</TableCell>
                  <TableCell align="right">
                    <Button
                      variant="contained"
                      color="success"
                      size="small"
                      startIcon={<CheckCircle2 size={16} />}
                      onClick={() => payConta.mutate(c.id)}
                      disabled={payConta.isPending}
                    >
                      Dar Baixa
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {pendentes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6, opacity: 0.5 }}>
                    <Typography>Não há contas pendentes no momento.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Tab 2: Pagas */}
      {activeTab === 2 && (
        <TableContainer component={Paper} sx={{ borderRadius: 4, border: `1px solid ${theme.palette.divider}` }}>
          <Table>
            <TableHead sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
              <TableRow>
                <TableCell><strong>Data Pagamento</strong></TableCell>
                <TableCell><strong>Vencimento Original</strong></TableCell>
                <TableCell><strong>Descrição</strong></TableCell>
                <TableCell><strong>Fornecedor</strong></TableCell>
                <TableCell align="right"><strong>Valor (R$)</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pagas.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{new Date(c.updated_at).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(c.data_vencimento).toLocaleDateString()}</TableCell>
                  <TableCell>{c.descricao}</TableCell>
                  <TableCell>{c.fornecedor?.nome || '-'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>R$ {c.valor.toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {pagas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 6, opacity: 0.5 }}>
                    <Typography>Nenhuma conta paga encontrada.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

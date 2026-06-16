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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Chip,
  useTheme,
  Tabs,
  Tab,
  Grid,
  Card,
  CardContent,
  IconButton,
  Divider,
  Switch,
  FormControlLabel,
} from '@mui/material';
import { Truck, Receipt, FileText, Plus, Trash2, Edit3, CheckCircle2 } from 'lucide-react';
import { api } from '../utils/api';
import type { Fornecedor, Compra, Produto, CompraItem } from '../types';

export const Compras: React.FC = () => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);

  // Tab 0: Fornecedores State
  const [fornecedorDialogOpen, setFornecedorDialogOpen] = useState(false);
  const [selectedFornecedor, setSelectedFornecedor] = useState<Fornecedor | null>(null);
  const [fNome, setFNome] = useState('');
  const [fCNPJ, setFCNPJ] = useState('');
  const [fTelefone, setFTelefone] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fAtivo, setFAtivo] = useState(true);

  // Tab 1: Nova NF State
  const [nfFornecedorID, setNfFornecedorID] = useState<number | ''>('');
  const [nfNumero, setNfNumero] = useState('');
  const [nfData, setNfData] = useState(new Date().toISOString().split('T')[0]);
  const [nfDataVencimento, setNfDataVencimento] = useState(new Date().toISOString().split('T')[0]);
  const [nfGerarConta, setNfGerarConta] = useState(true);
  const [nfItens, setNfItens] = useState<CompraItem[]>([]);
  
  // Item Form
  const [itemProdutoID, setItemProdutoID] = useState<number | ''>('');
  const [itemQtd, setItemQtd] = useState('');
  const [itemCusto, setItemCusto] = useState('');

  // Queries
  const { data: fornecedores = [], refetch: refetchFornecedores } = useQuery<Fornecedor[]>({
    queryKey: ['fornecedores'],
    queryFn: () => api.get<Fornecedor[]>('/api/fornecedores'),
  });

  const { data: compras = [], refetch: refetchCompras } = useQuery<Compra[]>({
    queryKey: ['compras'],
    queryFn: () => api.get<Compra[]>('/api/compras'),
  });

  const { data: products = [] } = useQuery<Produto[]>({
    queryKey: ['products-all'],
    queryFn: () => api.get<Produto[]>('/api/products?all=1'),
  });

  // Mutations
  const saveFornecedor = useMutation({
    mutationFn: (payload: any) =>
      selectedFornecedor
        ? api.put(`/api/fornecedores/${selectedFornecedor.id}`, payload)
        : api.post('/api/fornecedores', payload),
    onSuccess: () => {
      refetchFornecedores();
      setFornecedorDialogOpen(false);
    },
  });

  const deleteFornecedor = useMutation({
    mutationFn: (id: number) => api.delete(`/api/fornecedores/${id}`),
    onSuccess: () => refetchFornecedores(),
  });

  const saveCompra = useMutation({
    mutationFn: (payload: any) => api.post('/api/compras', payload),
    onSuccess: () => {
      refetchCompras();
      setActiveTab(2); // Vai para o histórico
      // Reset NF form
      setNfNumero('');
      setNfItens([]);
    },
  });

  // Fornecedor Handlers
  const openNewFornecedor = () => {
    setSelectedFornecedor(null);
    setFNome(''); setFCNPJ(''); setFTelefone(''); setFEmail(''); setFAtivo(true);
    setFornecedorDialogOpen(true);
  };

  const openEditFornecedor = (f: Fornecedor) => {
    setSelectedFornecedor(f);
    setFNome(f.nome); setFCNPJ(f.cnpj); setFTelefone(f.telefone); setFEmail(f.email); setFAtivo(f.ativo);
    setFornecedorDialogOpen(true);
  };

  const handleSaveFornecedor = () => {
    saveFornecedor.mutate({ nome: fNome, cnpj: fCNPJ, telefone: fTelefone, email: fEmail, ativo: fAtivo });
  };

  // NF Handlers
  const handleAddItemNF = () => {
    if (itemProdutoID !== '' && itemQtd !== '' && itemCusto !== '') {
      const p = products.find((x) => x.id === itemProdutoID);
      const q = parseFloat(itemQtd);
      const c = parseFloat(itemCusto);
      setNfItens([
        ...nfItens,
        { produto_id: itemProdutoID, quantidade: q, custo_unitario: c, subtotal: q * c, produto: p },
      ]);
      setItemProdutoID('');
      setItemQtd('');
      setItemCusto('');
    }
  };

  const handleRemoveItemNF = (index: number) => {
    setNfItens(nfItens.filter((_, i) => i !== index));
  };

  const handleSaveNF = () => {
    if (nfFornecedorID === '' || nfItens.length === 0) return;
    const total = nfItens.reduce((acc, it) => acc + it.subtotal, 0);
    saveCompra.mutate({
      fornecedor_id: nfFornecedorID,
      numero_nf: nfNumero,
      data_compra: new Date(nfData).toISOString(),
      valor_total: total,
      gerar_conta: nfGerarConta,
      data_vencimento: new Date(nfDataVencimento).toISOString(),
      itens: nfItens,
    });
  };

  const insumos = products.filter(p => p.ativo); // Pode comprar produto ou insumo

  return (
    <Box>
      <Paper elevation={0} sx={{ mb: 3, borderRadius: 3, border: `1px solid ${theme.palette.divider}` }}>
        <Tabs value={activeTab} onChange={(_, val) => setActiveTab(val)} sx={{ px: 1 }}>
          <Tab icon={<Truck size={16} />} iconPosition="start" label="Fornecedores" sx={{ fontWeight: 600, py: 2 }} />
          <Tab icon={<Plus size={16} />} iconPosition="start" label="Lançar Nota (Entrada)" sx={{ fontWeight: 600, py: 2 }} />
          <Tab icon={<Receipt size={16} />} iconPosition="start" label="Histórico de Compras" sx={{ fontWeight: 600, py: 2 }} />
        </Tabs>
      </Paper>

      {/* Tab 0: Fornecedores */}
      {activeTab === 0 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="body2" color="text.secondary">
              Gerencie seus fornecedores e distribuidores.
            </Typography>
            <Button variant="contained" startIcon={<Plus size={16} />} onClick={openNewFornecedor}>
              Novo Fornecedor
            </Button>
          </Box>

          <TableContainer component={Paper} sx={{ borderRadius: 4, border: `1px solid ${theme.palette.divider}` }}>
            <Table>
              <TableHead sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
                <TableRow>
                  <TableCell><strong>Nome</strong></TableCell>
                  <TableCell><strong>CNPJ</strong></TableCell>
                  <TableCell><strong>Contato</strong></TableCell>
                  <TableCell align="center"><strong>Status</strong></TableCell>
                  <TableCell align="right"><strong>Ações</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {fornecedores.map((f) => (
                  <TableRow key={f.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{f.nome}</TableCell>
                    <TableCell>{f.cnpj || '-'}</TableCell>
                    <TableCell>
                      <Box>
                        {f.telefone && <Typography variant="caption" display="block">{f.telefone}</Typography>}
                        {f.email && <Typography variant="caption" display="block">{f.email}</Typography>}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={f.ativo ? 'Ativo' : 'Inativo'} color={f.ativo ? 'success' : 'default'} size="small" />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" color="primary" onClick={() => openEditFornecedor(f)}>
                        <Edit3 size={16} />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => deleteFornecedor.mutate(f.id)}>
                        <Trash2 size={16} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Dialog open={fornecedorDialogOpen} onClose={() => setFornecedorDialogOpen(false)} maxWidth="xs" fullWidth>
            <DialogTitle>{selectedFornecedor ? 'Editar Fornecedor' : 'Novo Fornecedor'}</DialogTitle>
            <DialogContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                <TextField label="Nome/Razão Social" fullWidth value={fNome} onChange={(e) => setFNome(e.target.value)} />
                <TextField label="CNPJ" fullWidth value={fCNPJ} onChange={(e) => setFCNPJ(e.target.value)} />
                <TextField label="Telefone" fullWidth value={fTelefone} onChange={(e) => setFTelefone(e.target.value)} />
                <TextField label="E-mail" fullWidth value={fEmail} onChange={(e) => setFEmail(e.target.value)} />
                {selectedFornecedor && (
                  <FormControlLabel control={<Switch checked={fAtivo} onChange={(e) => setFAtivo(e.target.checked)} />} label="Ativo" />
                )}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setFornecedorDialogOpen(false)}>Cancelar</Button>
              <Button variant="contained" onClick={handleSaveFornecedor} disabled={!fNome || saveFornecedor.isPending}>Salvar</Button>
            </DialogActions>
          </Dialog>
        </Box>
      )}

      {/* Tab 1: Nova Nota Fiscal */}
      {activeTab === 1 && (
        <Grid container spacing={3}>
          {/* Cabeçalho da Nota */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ borderRadius: 4, border: `1px solid ${theme.palette.divider}`, height: '100%' }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>Cabeçalho da Nota</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField select label="Fornecedor" fullWidth value={nfFornecedorID} onChange={(e) => setNfFornecedorID(Number(e.target.value))}>
                    {fornecedores.filter(f => f.ativo).map((f) => (
                      <MenuItem key={f.id} value={f.id}>{f.nome}</MenuItem>
                    ))}
                  </TextField>
                  <TextField label="Número da NF (Opcional)" fullWidth value={nfNumero} onChange={(e) => setNfNumero(e.target.value)} />
                  <TextField label="Data da Compra" type="date" fullWidth value={nfData} onChange={(e) => setNfData(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                  
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Financeiro</Typography>
                  <FormControlLabel control={<Switch checked={nfGerarConta} onChange={(e) => setNfGerarConta(e.target.checked)} />} label="Gerar Conta a Pagar" />
                  {nfGerarConta && (
                    <TextField label="Data de Vencimento" type="date" fullWidth value={nfDataVencimento} onChange={(e) => setNfDataVencimento(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Itens da Nota */}
          <Grid size={{ xs: 12, md: 8 }}>
            <Card sx={{ borderRadius: 4, border: `1px solid ${theme.palette.divider}` }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>Itens (Insumos / Produtos)</Typography>
                
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid size={{ xs: 12, md: 5 }}>
                    <TextField select label="Selecione o Insumo" fullWidth value={itemProdutoID} onChange={(e) => setItemProdutoID(Number(e.target.value))}>
                      {insumos.map((i) => (
                        <MenuItem key={i.id} value={i.id}>{i.nome} ({i.unidade_medida || 'un'})</MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 6, md: 2 }}>
                    <TextField label="Qtd" type="number" fullWidth value={itemQtd} onChange={(e) => setItemQtd(e.target.value)} />
                  </Grid>
                  <Grid size={{ xs: 6, md: 3 }}>
                    <TextField label="Custo Unit. (R$)" type="number" fullWidth value={itemCusto} onChange={(e) => setItemCusto(e.target.value)} />
                  </Grid>
                  <Grid size={{ xs: 12, md: 2 }} sx={{ display: 'flex', alignItems: 'center' }}>
                    <Button variant="contained" fullWidth startIcon={<Plus size={16} />} onClick={handleAddItemNF} disabled={itemProdutoID === '' || itemQtd === '' || itemCusto === ''}>
                      Adicionar
                    </Button>
                  </Grid>
                </Grid>

                <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
                      <TableRow>
                        <TableCell><strong>Insumo</strong></TableCell>
                        <TableCell align="right"><strong>Qtd</strong></TableCell>
                        <TableCell align="right"><strong>Custo (R$)</strong></TableCell>
                        <TableCell align="right"><strong>Subtotal</strong></TableCell>
                        <TableCell align="center"><strong>Ação</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {nfItens.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{item.produto?.nome}</TableCell>
                          <TableCell align="right">{item.quantidade.toFixed(2)} {item.produto?.unidade_medida || 'un'}</TableCell>
                          <TableCell align="right">{(item.custo_unitario).toFixed(2)}</TableCell>
                          <TableCell align="right"><strong>{(item.subtotal).toFixed(2)}</strong></TableCell>
                          <TableCell align="center">
                            <IconButton size="small" color="error" onClick={() => handleRemoveItemNF(idx)}><Trash2 size={14} /></IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                      {nfItens.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} align="center" sx={{ py: 3, opacity: 0.5 }}>Nenhum item adicionado à nota.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 4 }}>
                  <Typography variant="h5" sx={{ fontWeight: 800 }}>
                    Total: R$ {nfItens.reduce((acc, it) => acc + it.subtotal, 0).toFixed(2)}
                  </Typography>
                  <Button variant="contained" color="success" size="large" startIcon={<CheckCircle2 />} onClick={handleSaveNF} disabled={nfItens.length === 0 || nfFornecedorID === '' || saveCompra.isPending}>
                    Finalizar Entrada
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Tab 2: Histórico */}
      {activeTab === 2 && (
        <Box>
          <TableContainer component={Paper} sx={{ borderRadius: 4, border: `1px solid ${theme.palette.divider}` }}>
            <Table>
              <TableHead sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
                <TableRow>
                  <TableCell><strong>Data</strong></TableCell>
                  <TableCell><strong>Fornecedor</strong></TableCell>
                  <TableCell><strong>NF</strong></TableCell>
                  <TableCell align="right"><strong>Itens</strong></TableCell>
                  <TableCell align="right"><strong>Total (R$)</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {compras.map((c) => (
                  <TableRow key={c.id} hover>
                    <TableCell>{new Date(c.data_compra).toLocaleDateString()}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{c.fornecedor?.nome}</TableCell>
                    <TableCell>{c.numero_nf || '-'}</TableCell>
                    <TableCell align="right">{c.itens.length} insumos</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>R$ {c.valor_total.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {compras.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 6, opacity: 0.5 }}>
                      <FileText size={48} />
                      <Typography sx={{ mt: 2 }}>Nenhuma nota fiscal lançada.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    </Box>
  );
};

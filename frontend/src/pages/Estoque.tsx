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
  Alert,
  Chip,
  useTheme,
  Tabs,
  Tab,
  Grid,
  Card,
  CardContent,
  IconButton,
  Divider,
} from '@mui/material';
import { Edit3, AlertOctagon, CheckCircle2, ClipboardList, Layers, Plus, Trash2 } from 'lucide-react';
import { api } from '../utils/api';
import type { Estoque as StockItem, Produto, FichaTecnicaItem } from '../types';

export const Estoque: React.FC = () => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);

  // Tab 0: Stock adjustment state
  const [selectedStock, setSelectedStock] = useState<StockItem | null>(null);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [newQuantity, setNewQuantity] = useState('');
  const [adjustReason, setAdjustReason] = useState('ajuste');

  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entryQuantity, setEntryQuantity] = useState('');
  const [entryReason, setEntryReason] = useState('compra');

  // New Insumo State
  const [novoInsumoDialogOpen, setNovoInsumoDialogOpen] = useState(false);
  const [novoInsumoNome, setNovoInsumoNome] = useState('');
  const [novoInsumoUnidade, setNovoInsumoUnidade] = useState('kg');
  const [novoInsumoQuantidade, setNovoInsumoQuantidade] = useState('0');
  const [novoInsumoCategoria, setNovoInsumoCategoria] = useState<number | ''>('');

  // Tab 1: Ficha Tecnica state
  const [selectedProdutoID, setSelectedProdutoID] = useState<number | ''>('');
  const [selectedInsumoID, setSelectedInsumoID] = useState<number | ''>('');
  const [ingredientQty, setIngredientQty] = useState('');

  // Fetch Stock list
  const { data: stock = [], isLoading: isStockLoading, refetch: refetchStock } = useQuery<StockItem[]>({
    queryKey: ['stock-list'],
    queryFn: () => api.get<StockItem[]>('/api/stock'),
  });

  // Fetch all products to populate Ficha Tecnica dropdowns
  const { data: products = [], refetch: refetchProducts } = useQuery<Produto[]>({
    queryKey: ['products-all'],
    queryFn: () => api.get<Produto[]>('/api/products?all=1'),
  });

  const { data: categorias = [] } = useQuery<any[]>({
    queryKey: ['categorias-all'],
    queryFn: () => api.get<any[]>('/api/categories'),
  });

  // Fetch Ficha Tecnica for the selected product
  const { data: recipe = [], refetch: refetchRecipe } = useQuery<FichaTecnicaItem[]>({
    queryKey: ['ficha-tecnica', selectedProdutoID],
    queryFn: () => api.get<FichaTecnicaItem[]>(`/api/fichas-tecnicas/produto/${selectedProdutoID}`),
    enabled: selectedProdutoID !== '',
  });

  // Mutation to create a new insumo directly from Estoque
  const createInsumoMutation = useMutation({
    mutationFn: (payload: any) => api.post('/api/products', payload),
    onSuccess: () => {
      refetchProducts();
      refetchStock();
      setNovoInsumoDialogOpen(false);
      setNovoInsumoNome('');
      setNovoInsumoCategoria('');
      setNovoInsumoQuantidade('0');
      setNovoInsumoUnidade('kg');
    },
  });

  // Mutation to add stock entry (soma)
  const entryMutation = useMutation({
    mutationFn: ({ id, qty, reason }: { id: number; qty: number; reason: string }) =>
      api.post(`/api/stock/${id}/entry`, { quantidade: qty, motivo: reason }),
    onSuccess: () => {
      refetchStock();
      setEntryDialogOpen(false);
    },
  });

  // Mutation to update stock level
  const adjustMutation = useMutation({
    mutationFn: ({ id, qty, reason }: { id: number; qty: number; reason: string }) =>
      api.put(`/api/stock/${id}`, { quantidade: qty, motivo: reason }),
    onSuccess: () => {
      refetchStock();
      setAdjustDialogOpen(false);
    },
  });

  // Mutation to add ingredient to Ficha Tecnica
  const addIngredientMutation = useMutation({
    mutationFn: (payload: { produto_id: number; insumo_id: number; quantidade: number }) =>
      api.post('/api/fichas-tecnicas', payload),
    onSuccess: () => {
      refetchRecipe();
      setSelectedInsumoID('');
      setIngredientQty('');
    },
  });

  // Mutation to delete ingredient from Ficha Tecnica
  const deleteIngredientMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/fichas-tecnicas/${id}`),
    onSuccess: () => {
      refetchRecipe();
    },
  });

  const handleAdjustClick = (item: StockItem) => {
    setSelectedStock(item);
    setNewQuantity(item.quantidade.toString());
    setAdjustReason('ajuste');
    setAdjustDialogOpen(true);
  };

  const handleSaveAdjustment = () => {
    if (selectedStock && newQuantity !== '') {
      adjustMutation.mutate({
        id: selectedStock.id,
        qty: parseFloat(newQuantity),
        reason: adjustReason,
      });
    }
  };

  const handleEntryClick = (item: StockItem) => {
    setSelectedStock(item);
    setEntryQuantity('');
    setEntryReason('compra');
    setEntryDialogOpen(true);
  };

  const handleSaveEntry = () => {
    if (selectedStock && entryQuantity !== '') {
      entryMutation.mutate({
        id: selectedStock.id,
        qty: parseFloat(entryQuantity),
        reason: entryReason,
      });
    }
  };

  const handleSaveNovoInsumo = () => {
    if (novoInsumoNome && novoInsumoCategoria !== '') {
      createInsumoMutation.mutate({
        nome: novoInsumoNome,
        descricao: 'Insumo cadastrado pelo menu Estoque',
        preco: 0,
        categoria_id: novoInsumoCategoria,
        tipo: 'insumo',
        unidade_medida: novoInsumoUnidade,
        quantidade: parseFloat(novoInsumoQuantidade) || 0,
        ativo: true,
      });
    }
  };

  const handleAddIngredient = () => {
    if (selectedProdutoID !== '' && selectedInsumoID !== '' && ingredientQty !== '') {
      addIngredientMutation.mutate({
        produto_id: selectedProdutoID,
        insumo_id: selectedInsumoID,
        quantidade: parseFloat(ingredientQty),
      });
    }
  };

  const handleDeleteIngredient = (id: number) => {
    if (window.confirm('Deseja remover este ingrediente da ficha técnica?')) {
      deleteIngredientMutation.mutate(id);
    }
  };

  // Filter products/insumos
  const finalProducts = products.filter(p => p.tipo === 'produto' && p.ativo);
  const insumos = products.filter(p => p.tipo === 'insumo' && p.ativo);

  return (
    <Box>
      <Paper elevation={0} sx={{ mb: 3, borderRadius: 3, border: `1px solid ${theme.palette.divider}` }}>
        <Tabs value={activeTab} onChange={(_, val) => setActiveTab(val)} sx={{ px: 1 }}>
          <Tab icon={<Layers size={16} />} iconPosition="start" label="Controle de Estoque" sx={{ fontWeight: 600, py: 2 }} />
          <Tab icon={<ClipboardList size={16} />} iconPosition="start" label="Fichas Técnicas (Receitas)" sx={{ fontWeight: 600, py: 2 }} />
        </Tabs>
      </Paper>

      {/* Tab 0: Stock Control */}
      {activeTab === 0 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="body2" color="text.secondary">
              Monitore a quantidade física dos itens do cardápio e insumos. Configure alertas de ressuprimento.
            </Typography>
            <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setNovoInsumoDialogOpen(true)}>
              Novo Insumo
            </Button>
          </Box>

          {stock.some((item) => item.alerta) && (
            <Alert severity="warning" sx={{ mb: 3, borderRadius: 3 }}>
              Existem itens com estoque crítico (abaixo do limite mínimo configurado). Por favor, realize a reposição.
            </Alert>
          )}

          <TableContainer component={Paper} sx={{ borderRadius: 4, border: `1px solid ${theme.palette.divider}` }}>
            <Table sx={{ minWidth: 650 }}>
              <TableHead sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
                <TableRow>
                  <TableCell><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Item</Typography></TableCell>
                  <TableCell align="center"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Tipo</Typography></TableCell>
                  <TableCell align="center"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Qtd Atual</Typography></TableCell>
                  <TableCell align="center"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Qtd Mínima</Typography></TableCell>
                  <TableCell align="center"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Status</Typography></TableCell>
                  <TableCell align="right"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Ações</Typography></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isStockLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                      Carregando estoque...
                    </TableCell>
                  </TableRow>
                ) : stock.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                      Nenhum item em estoque encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  stock.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell component="th" scope="row">
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {row.produto_nome}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={row.produto_tipo === 'insumo' ? 'Insumo' : 'Produto'}
                          color={row.produto_tipo === 'insumo' ? 'secondary' : 'default'}
                          size="small"
                          sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {row.quantidade.toFixed(3).replace(/\.?0+$/, '')} {row.unidade_medida || 'un'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2" color="text.secondary">
                          {row.minimo.toFixed(3).replace(/\.?0+$/, '')} {row.unidade_medida || 'un'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        {row.alerta ? (
                          <Chip
                            icon={<AlertOctagon size={14} />}
                            label="Estoque Baixo"
                            color="error"
                            size="small"
                            sx={{ fontWeight: 600 }}
                          />
                        ) : (
                          <Chip
                            icon={<CheckCircle2 size={14} />}
                            label="Normal"
                            color="success"
                            size="small"
                            sx={{ fontWeight: 600 }}
                          />
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                          <Button
                            variant="contained"
                            color="success"
                            size="small"
                            startIcon={<Plus size={14} />}
                            onClick={() => handleEntryClick(row)}
                          >
                            Entrada
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<Edit3 size={14} />}
                            onClick={() => handleAdjustClick(row)}
                          >
                            Ajustar
                          </Button>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Adjust Dialog */}
          <Dialog open={adjustDialogOpen} onClose={() => setAdjustDialogOpen(false)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ fontWeight: 700 }}>Ajuste de Estoque</DialogTitle>
            <DialogContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Item: {selectedStock?.produto_nome} ({selectedStock?.unidade_medida || 'un'})
                </Typography>
                <TextField
                  label={`Nova Quantidade Física (${selectedStock?.unidade_medida || 'un'})`}
                  type="number"
                  fullWidth
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(e.target.value)}
                />
                <TextField
                  select
                  label="Motivo do Ajuste"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  fullWidth
                >
                  <MenuItem value="inventario">Contagem / Inventário</MenuItem>
                  <MenuItem value="ajuste">Ajuste Manual</MenuItem>
                  <MenuItem value="desperdicio">Desperdício / Perda</MenuItem>
                </TextField>
              </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 3 }}>
              <Button onClick={() => setAdjustDialogOpen(false)}>Cancelar</Button>
              <Button
                onClick={handleSaveAdjustment}
                variant="contained"
                disabled={adjustMutation.isPending || newQuantity === ''}
              >
                Confirmar Ajuste
              </Button>
            </DialogActions>
          </Dialog>

          {/* Entry Dialog */}
          <Dialog open={entryDialogOpen} onClose={() => setEntryDialogOpen(false)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ fontWeight: 700 }}>Nova Entrada de Estoque</DialogTitle>
            <DialogContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1.5 }}>
                <Typography variant="body2" color="text.secondary">
                  Adicione a quantidade recebida ao saldo atual do item.
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Item: {selectedStock?.produto_nome} ({selectedStock?.unidade_medida || 'un'})
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: theme.palette.success.main }}>
                  Saldo Atual: {selectedStock?.quantidade?.toFixed(3).replace(/\.?0+$/, '')} {selectedStock?.unidade_medida || 'un'}
                </Typography>
                <TextField
                  label={`Quantidade Recebida (${selectedStock?.unidade_medida || 'un'})`}
                  type="number"
                  fullWidth
                  value={entryQuantity}
                  onChange={(e) => setEntryQuantity(e.target.value)}
                />
                <TextField
                  select
                  label="Motivo da Entrada"
                  value={entryReason}
                  onChange={(e) => setEntryReason(e.target.value)}
                  fullWidth
                >
                  <MenuItem value="compra">Compra / Fornecedor</MenuItem>
                  <MenuItem value="bonificacao">Bonificação / Doação</MenuItem>
                  <MenuItem value="retorno">Retorno / Devolução</MenuItem>
                </TextField>
              </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 3 }}>
              <Button onClick={() => setEntryDialogOpen(false)}>Cancelar</Button>
              <Button
                onClick={handleSaveEntry}
                variant="contained"
                color="success"
                disabled={entryMutation.isPending || entryQuantity === ''}
              >
                Confirmar Entrada
              </Button>
            </DialogActions>
          </Dialog>

          {/* Create Insumo Dialog */}
          <Dialog open={novoInsumoDialogOpen} onClose={() => setNovoInsumoDialogOpen(false)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ fontWeight: 700 }}>Cadastrar Novo Insumo</DialogTitle>
            <DialogContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1.5 }}>
                <TextField
                  label="Nome do Insumo (Ex: Carne Bovina, Sal)"
                  fullWidth
                  value={novoInsumoNome}
                  onChange={(e) => setNovoInsumoNome(e.target.value)}
                />
                <TextField
                  select
                  label="Categoria do Insumo"
                  value={novoInsumoCategoria}
                  onChange={(e) => setNovoInsumoCategoria(Number(e.target.value))}
                  fullWidth
                >
                  {categorias.map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.nome}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Unidade de Medida"
                  value={novoInsumoUnidade}
                  onChange={(e) => setNovoInsumoUnidade(e.target.value)}
                  fullWidth
                >
                  <MenuItem value="kg">Quilograma (kg)</MenuItem>
                  <MenuItem value="g">Grama (g)</MenuItem>
                  <MenuItem value="l">Litro (l)</MenuItem>
                  <MenuItem value="ml">Mililitro (ml)</MenuItem>
                  <MenuItem value="un">Unidade (un)</MenuItem>
                </TextField>
                <TextField
                  label="Quantidade Inicial no Estoque"
                  type="number"
                  fullWidth
                  value={novoInsumoQuantidade}
                  onChange={(e) => setNovoInsumoQuantidade(e.target.value)}
                />
              </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 3 }}>
              <Button onClick={() => setNovoInsumoDialogOpen(false)}>Cancelar</Button>
              <Button
                onClick={handleSaveNovoInsumo}
                variant="contained"
                disabled={createInsumoMutation.isPending || !novoInsumoNome || novoInsumoCategoria === ''}
              >
                Cadastrar
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      )}

      {/* Tab 1: Ficha Tecnica (Recipes) */}
      {activeTab === 1 && (
        <Box>
          <Grid container spacing={3}>
            {/* Product selection and Add ingredient form */}
            <Grid size={{ xs: 12, md: 5 }}>
              <Card sx={{ borderRadius: 4, border: `1px solid ${theme.palette.divider}`, height: '100%' }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                    Vincular Receita / Ingredientes
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Selecione um produto final para configurar a ficha técnica. A baixa desses ingredientes será feita de forma proporcional e automática a cada pedido finalizado.
                  </Typography>

                  <TextField
                    select
                    label="Selecione o Produto Final"
                    fullWidth
                    value={selectedProdutoID}
                    onChange={(e) => setSelectedProdutoID(Number(e.target.value))}
                    sx={{ mb: 4 }}
                  >
                    {finalProducts.map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.nome}
                      </MenuItem>
                    ))}
                  </TextField>

                  {selectedProdutoID !== '' && (
                    <>
                      <Divider sx={{ my: 3 }} />
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
                        Adicionar Ingrediente / Insumo
                      </Typography>

                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                        <TextField
                          select
                          label="Insumo"
                          fullWidth
                          value={selectedInsumoID}
                          onChange={(e) => setSelectedInsumoID(Number(e.target.value))}
                        >
                          {insumos.map((i) => (
                            <MenuItem key={i.id} value={i.id}>
                              {i.nome} ({i.unidade_medida || 'un'})
                            </MenuItem>
                          ))}
                        </TextField>

                        <TextField
                          label={`Quantidade Necessária (${selectedInsumoID ? insumos.find(i => i.id === selectedInsumoID)?.unidade_medida || 'un' : 'un'})`}
                          type="number"
                          fullWidth
                          value={ingredientQty}
                          onChange={(e) => setIngredientQty(e.target.value)}
                        />

                        <Button
                          variant="contained"
                          startIcon={<Plus size={16} />}
                          onClick={handleAddIngredient}
                          disabled={selectedInsumoID === '' || ingredientQty === '' || addIngredientMutation.isPending}
                          sx={{ mt: 1 }}
                        >
                          Adicionar Ingrediente
                        </Button>
                      </Box>
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Current recipe table */}
            <Grid size={{ xs: 12, md: 7 }}>
              <Card sx={{ borderRadius: 4, border: `1px solid ${theme.palette.divider}`, minHeight: 350 }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                    Ingredientes da Receita
                  </Typography>

                  {selectedProdutoID === '' ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, opacity: 0.5 }}>
                      <ClipboardList size={48} />
                      <Typography variant="body2" sx={{ mt: 2, fontWeight: 500 }}>
                        Selecione um produto final à esquerda para visualizar seus ingredientes.
                      </Typography>
                    </Box>
                  ) : recipe.length === 0 ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, opacity: 0.5 }}>
                      <AlertOctagon size={48} />
                      <Typography variant="body2" sx={{ mt: 2, fontWeight: 500 }}>
                        Este produto ainda não possui ingredientes cadastrados. Use o formulário ao lado para adicionar.
                      </Typography>
                    </Box>
                  ) : (
                    <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 3 }}>
                      <Table>
                        <TableHead sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
                          <TableRow>
                            <TableCell><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Insumo</Typography></TableCell>
                            <TableCell align="center"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Proporção / Qtd</Typography></TableCell>
                            <TableCell align="right"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Remover</Typography></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {recipe.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell component="th" scope="row">
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                  {item.insumo?.nome || `Insumo #${item.insumo_id}`}
                                </Typography>
                              </TableCell>
                              <TableCell align="center">
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                  {item.quantidade.toFixed(3).replace(/\.?0+$/, '')} {item.insumo?.unidade_medida || 'un'}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => handleDeleteIngredient(item.id)}
                                  disabled={deleteIngredientMutation.isPending}
                                >
                                  <Trash2 size={16} />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}
    </Box>
  );
};

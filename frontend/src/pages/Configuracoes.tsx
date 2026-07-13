import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  TextField,
  Button,
  Divider,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  Alert,
  useTheme,
  Avatar,
  Stack,
  FormControlLabel,
  Switch,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  InputAdornment,
} from '@mui/material';
import { Save, Printer, User2, Palette, Users, UserPlus, Edit, Trash2, CreditCard, Wifi, WifiOff, RefreshCw, ShoppingCart, Package, PlusCircle, Search, ShieldCheck } from 'lucide-react';
import { useStore } from '../store/useStore';
import { api } from '../utils/api';
import type { Impressora, Pinpad, PinpadStatus, Produto, Categoria } from '../types';
import { PROTECTED_MENU_ITEMS } from '../utils/permissions';
import { PermissionEditor } from '../components/PermissionEditor';

export const Configuracoes: React.FC = () => {
  const theme = useTheme();
  const { company, themeColors, updateCompanySettings, user } = useStore();
  
  const [activeTab, setActiveTab] = useState(0);
  const [restName, setRestName] = useState(company?.nome || '');
  const [restPhone, setRestPhone] = useState(company?.telefone || '');
  const [restLogo, setRestLogo] = useState(company?.logo_url || '');

  // Users CRUD state
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState('garcom');

  // Fetch Users List
  const { data: usersList = [], refetch: refetchUsers } = useQuery<any[]>({
    queryKey: ['users-list'],
    queryFn: () => api.get<any[]>('/api/users'),
    enabled: user?.role === 'admin',
  });

  // Create User Mutation
  const createUserMutation = useMutation({
    mutationFn: (payload: any) => api.post('/api/users', payload),
    onSuccess: () => {
      refetchUsers();
      setUserDialogOpen(false);
      clearUserForm();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Erro ao criar usuário.');
    }
  });

  // Update User Mutation
  const updateUserMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => api.put(`/api/users/${id}`, payload),
    onSuccess: () => {
      refetchUsers();
      setUserDialogOpen(false);
      clearUserForm();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Erro ao atualizar usuário.');
    }
  });

  // Delete User Mutation
  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/users/${id}`),
    onSuccess: () => {
      refetchUsers();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Erro ao excluir usuário.');
    }
  });

  const clearUserForm = () => {
    setUserName('');
    setUserEmail('');
    setUserPassword('');
    setUserRole('garcom');
    setSelectedUser(null);
  };

  const handleOpenCreateUser = () => {
    clearUserForm();
    setUserDialogOpen(true);
  };

  const handleOpenEditUser = (u: any) => {
    setSelectedUser(u);
    setUserName(u.nome);
    setUserEmail(u.email || '');
    setUserPassword('');
    setUserRole(u.role);
    setUserDialogOpen(true);
  };

  const handleSaveUser = () => {
    setErrorMsg(null);
    if (!userName || (!selectedUser && !userPassword)) {
      setErrorMsg('Nome e senha são obrigatórios.');
      return;
    }

    const payload: any = {
      nome: userName,
      email: userEmail || undefined,
      role: userRole,
    };
    if (userPassword) {
      payload.senha = userPassword;
    }

    if (selectedUser) {
      updateUserMutation.mutate({ id: selectedUser.id, payload });
    } else {
      createUserMutation.mutate(payload);
    }
  };

  const handleDeleteUser = (id: number) => {
    if (window.confirm('Tem certeza que deseja remover este usuário?')) {
      deleteUserMutation.mutate(id);
    }
  };

  // Product management state
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Produto | null>(null);
  const [productNome, setProductNome] = useState('');
  const [productDescricao, setProductDescricao] = useState('');
  const [productPreco, setProductPreco] = useState<string>('0.00');
  const [productCategoriaID, setProductCategoriaID] = useState<number>(0);
  const [productCodigoBarras, setProductCodigoBarras] = useState('');
  const [productImagemURL, setProductImagemURL] = useState('');
  const [productSetorID, setProductSetorID] = useState<number>(0);
  const [productAtivo, setProductAtivo] = useState(true);
  const [productTipo, setProductTipo] = useState<'produto' | 'insumo'>('produto');
  const [productUnidadeMedida, setProductUnidadeMedida] = useState<'un' | 'kg' | 'g' | 'l' | 'ml'>('un');
  const [productSearch, setProductSearch] = useState('');
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryNome, setCategoryNome] = useState('');
  const [categoryDescricao, setCategoryDescricao] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Categoria | null>(null);

  // Fetch all products (including inactive for management)
  const { data: allProducts = [], refetch: refetchAllProducts } = useQuery<Produto[]>({
    queryKey: ['products-all'],
    queryFn: () => api.get<Produto[]>('/api/products?all=1'),
  });

  // Fetch categories
  const { data: categories = [], refetch: refetchCategories } = useQuery<Categoria[]>({
    queryKey: ['categories'],
    queryFn: () => api.get<Categoria[]>('/api/categories'),
  });

  // Fetch setores (KDS)
  const { data: setores = [], refetch: refetchSetores } = useQuery<any[]>({
    queryKey: ['setores'],
    queryFn: () => api.get<any[]>('/api/setores'),
  });

  // Update Sector Settings (KDS / Printing)
  const updateSetorMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
      api.put(`/api/setores/${id}`, payload),
    onSuccess: () => {
      refetchSetores();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Erro ao atualizar setor.');
    },
  });

  const filteredProducts = allProducts.filter((p) =>
    p.nome.toLowerCase().includes(productSearch.toLowerCase())
  );

  // Save product
  const saveProductMutation = useMutation({
    mutationFn: (payload: any) =>
      selectedProduct
        ? api.put(`/api/products/${selectedProduct.id}`, payload)
        : api.post('/api/products', payload),
    onSuccess: () => { refetchAllProducts(); setProductDialogOpen(false); },
  });

  // Delete (deactivate) product
  const deleteProductMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/products/${id}`),
    onSuccess: () => refetchAllProducts(),
  });

  const clearProductForm = () => {
    setProductNome('');
    setProductDescricao('');
    setProductPreco('0.00');
    setProductCategoriaID(0);
    setProductCodigoBarras('');
    setProductImagemURL('');
    setProductSetorID(0);
    setProductAtivo(true);
    setProductTipo('produto');
    setProductUnidadeMedida('un');
    setSelectedProduct(null);
  };

  const handleOpenCreateProduct = () => {
    clearProductForm();
    setProductCategoriaID(categories[0]?.id || 0);
    setProductSetorID(setores[0]?.id || 0);
    setProductDialogOpen(true);
  };

  const handleOpenEditProduct = (p: Produto) => {
    setSelectedProduct(p);
    setProductNome(p.nome);
    setProductDescricao(p.descricao || '');
    setProductPreco(p.preco.toString());
    setProductCategoriaID(p.categoria_id);
    setProductCodigoBarras(p.codigo_barras || '');
    setProductImagemURL(p.imagem_url || '');
    setProductSetorID(p.setor_id || 0);
    setProductAtivo(p.ativo);
    setProductTipo(p.tipo || 'produto');
    setProductUnidadeMedida(p.unidade_medida || 'un');
    setProductDialogOpen(true);
  };

  const handleCategoryChange = (catId: number) => {
    setProductCategoriaID(catId);
    // Auto-select KDS sector based on category name
    const cat = categories.find((c) => c.id === catId);
    if (cat && setores.length > 0) {
      const catName = cat.nome.toLowerCase();
      let matchedSetor = setores.find((s) => s.nome.toLowerCase() === 'cozinha'); // default
      if (catName.includes('sobremesa') || catName.includes('doce')) {
        matchedSetor = setores.find((s) => s.nome.toLowerCase() === 'sobremesa') || matchedSetor;
      } else if (catName.includes('bebida') || catName.includes('drink') || catName.includes('suco')) {
        matchedSetor = setores.find((s) => s.nome.toLowerCase() === 'bar') || matchedSetor;
      }
      if (matchedSetor) {
        setProductSetorID(matchedSetor.id);
      }
    }
  };

  const handleSaveProduct = () => {
    if (!productNome || !productPreco) return;
    saveProductMutation.mutate({
      nome: productNome,
      descricao: productDescricao,
      preco: parseFloat(productPreco),
      categoria_id: productCategoriaID,
      codigo_barras: productCodigoBarras,
      imagem_url: productImagemURL,
      setor_id: productSetorID,
      ativo: productAtivo,
      tipo: productTipo,
      unidade_medida: productUnidadeMedida,
    });
  };

  // Save category
  const saveCategoryMutation = useMutation({
    mutationFn: (payload: any) =>
      selectedCategory
        ? api.put(`/api/categories/${selectedCategory.id}`, payload)
        : api.post('/api/categories', payload),
    onSuccess: () => { refetchCategories(); setCategoryDialogOpen(false); },
  });

  // Delete category
  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/categories/${id}`),
    onSuccess: () => refetchCategories(),
  });

  // Pinpad state
  const [pinpadDialogOpen, setPinpadDialogOpen] = useState(false);
  const [selectedPinpad, setSelectedPinpad] = useState<Pinpad | null>(null);
  const [pinpadNome, setPinpadNome] = useState('');
  const [pinpadModelo, setPinpadModelo] = useState('Gertec PPC930');
  const [pinpadTipo, setPinpadTipo] = useState<'serial' | 'tcp'>('serial');
  const [pinpadIP, setPinpadIP] = useState('127.0.0.1');
  const [pinpadPorta, setPinpadPorta] = useState(2001);
  const [pinpadDispositivo, setPinpadDispositivo] = useState('/dev/ttyACM0');
  const [pinpadSerial, setPinpadSerial] = useState('');
  const [detectingId, setDetectingId] = useState<number | null>(null);
  const [detectionResult, setDetectionResult] = useState<PinpadStatus | null>(null);

  // Fetch Pinpads
  const { data: pinpads = [], refetch: refetchPinpads } = useQuery<Pinpad[]>({
    queryKey: ['pinpads'],
    queryFn: () => api.get<Pinpad[]>('/api/pinpads'),
  });

  // Create/Update Pinpad
  const savePinpadMutation = useMutation({
    mutationFn: (payload: any) =>
      selectedPinpad
        ? api.put(`/api/pinpads/${selectedPinpad.id}`, payload)
        : api.post('/api/pinpads', payload),
    onSuccess: () => {
      refetchPinpads();
      setPinpadDialogOpen(false);
      clearPinpadForm();
    },
    onError: (err: any) => {
      // Error is shown via the error alert state
      setDetectionResult({
        online: false,
        modelo: '',
        serial: '',
        last_check: new Date().toISOString(),
        error: err.message || 'Erro ao salvar terminal TEF',
      });
    },
  });

  // Delete Pinpad
  const deletePinpadMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/pinpads/${id}`),
    onSuccess: () => refetchPinpads(),
  });

  const clearPinpadForm = () => {
    setPinpadNome('');
    setPinpadModelo('Gertec PPC930');
    setPinpadTipo('serial');
    setPinpadIP('127.0.0.1');
    setPinpadPorta(2001);
    setPinpadDispositivo('/dev/ttyACM0');
    setPinpadSerial('');
    setSelectedPinpad(null);
  };

  const handleOpenCreatePinpad = () => {
    clearPinpadForm();
    setPinpadDialogOpen(true);
  };

  const handleOpenEditPinpad = (p: Pinpad) => {
    setSelectedPinpad(p);
    setPinpadNome(p.nome);
    setPinpadModelo(p.modelo);
    setPinpadTipo(p.tipo || 'tcp');
    setPinpadIP(p.ip || '127.0.0.1');
    setPinpadPorta(p.porta || 2001);
    setPinpadDispositivo(p.dispositivo || '/dev/ttyACM0');
    setPinpadSerial(p.serial || '');
    setPinpadDialogOpen(true);
  };

  const handleSavePinpad = () => {
    if (!pinpadNome) return;
    savePinpadMutation.mutate({
      nome: pinpadNome,
      modelo: pinpadModelo,
      tipo: pinpadTipo,
      ip: pinpadIP,
      porta: pinpadPorta,
      dispositivo: pinpadDispositivo,
      serial: pinpadSerial,
    });
  };

  const handleDetectPinpad = async (id: number) => {
    setDetectingId(id);
    setDetectionResult(null);
    try {
      const result = await api.get<PinpadStatus>(`/api/pinpads/${id}/detect`);
      setDetectionResult(result);
    } catch (err: any) {
      setDetectionResult({ online: false, modelo: '', serial: '', last_check: new Date().toISOString(), error: err.message });
    } finally {
      setDetectingId(null);
    }
  };

  // Theme configuration local values
  const [primaryColor, setPrimaryColor] = useState(themeColors.primary || '#1976d2');
  const [secondaryColor, setSecondaryColor] = useState(themeColors.secondary || '#dc004e');
  const [isDarkMode, setIsDarkMode] = useState(themeColors.dark || false);
  
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Printer CRUD state
  const [printerDialogOpen, setPrinterDialogOpen] = useState(false);
  const [selectedPrinter, setSelectedPrinter] = useState<Impressora | null>(null);
  const [printerNome, setPrinterNome] = useState('');
  const [printerTipo, setPrinterTipo] = useState<'tcp' | 'usb'>('tcp');
  const [printerIP, setPrinterIP] = useState('192.168.1.100');
  const [printerPorta, setPrinterPorta] = useState(9100);
  const [printerDispositivo, setPrinterDispositivo] = useState('/dev/usb/lp0');
  const [printerSetorID, setPrinterSetorID] = useState<number>(0);
  const [testingPrinterId, setTestingPrinterId] = useState<number | null>(null);
  const [printerTestResult, setPrinterTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [detectedUSBDevices, setDetectedUSBDevices] = useState<Array<{ path: string; model: string; vendor_id: string; product_id: string; accessible: boolean }>>([]);
  const [usbSetupMsg, setUsbSetupMsg] = useState('');

  // Fetch Printers List from real API
  const { data: printers = [], refetch: refetchPrinters } = useQuery<Impressora[]>({
    queryKey: ['printers'],
    queryFn: () => api.get<Impressora[]>('/api/printers'),
  });

  // Create/Update Printer
  const savePrinterMutation = useMutation({
    mutationFn: (payload: any) =>
      selectedPrinter
        ? api.put(`/api/printers/${selectedPrinter.id}`, payload)
        : api.post('/api/printers', payload),
    onSuccess: () => {
      refetchPrinters();
      setPrinterDialogOpen(false);
      clearPrinterForm();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Erro ao salvar impressora.');
    },
  });

  // Delete Printer
  const deletePrinterMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/printers/${id}`),
    onSuccess: () => refetchPrinters(),
    onError: (err: any) => setErrorMsg(err.message || 'Erro ao excluir impressora.'),
  });

  const clearPrinterForm = () => {
    setPrinterNome('');
    setPrinterTipo('tcp');
    setPrinterIP('192.168.1.100');
    setPrinterPorta(9100);
    setPrinterDispositivo('/dev/usb/lp0');
    setPrinterSetorID(setores[0]?.id || 0);
    setSelectedPrinter(null);
    setDetectedUSBDevices([]);
    setUsbSetupMsg('');
  };

  const handleOpenCreatePrinter = () => {
    clearPrinterForm();
    setPrinterDialogOpen(true);
  };

  const handleOpenEditPrinter = (p: Impressora) => {
    setSelectedPrinter(p);
    setPrinterNome(p.nome);
    setPrinterTipo(p.tipo || 'tcp');
    setPrinterIP(p.ip || '192.168.1.100');
    setPrinterPorta(p.porta || 9100);
    setPrinterDispositivo(p.dispositivo || '/dev/usb/lp0');
    setPrinterSetorID(p.setor_id);
    setPrinterDialogOpen(true);
  };

  const handleSavePrinter = () => {
    if (!printerNome) return;
    setErrorMsg(null);
    const payload: any = {
      nome: printerNome,
      tipo: printerTipo,
      setor_id: printerSetorID,
    };
    if (printerTipo === 'tcp') {
      payload.ip = printerIP;
      payload.porta = printerPorta;
    } else {
      payload.dispositivo = printerDispositivo;
    }
    savePrinterMutation.mutate(payload);
  };

  const handleTestPrinter = async (id: number) => {
    setTestingPrinterId(id);
    setPrinterTestResult(null);
    try {
      const result = await api.post<{ success: boolean; message?: string; error?: string }>(`/api/printers/${id}/test`, {});
      setPrinterTestResult(result);
    } catch (err: any) {
      setPrinterTestResult({ success: false, error: err.message || 'Falha na conexão com a impressora' });
    } finally {
      setTestingPrinterId(null);
    }
  };


  const saveSettingsMutation = useMutation({
    mutationFn: (payload: any) => api.put<any>('/api/auth/tenant', payload),
    onSuccess: (updatedCompany) => {
      updateCompanySettings(updatedCompany);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Erro ao salvar configurações.');
    },
  });

  const handleSaveProfileAndTheme = () => {
    setErrorMsg(null);
    setSaveSuccess(false);

    const themePayload = {
      primary: primaryColor,
      secondary: secondaryColor,
      dark: isDarkMode,
    };

    saveSettingsMutation.mutate({
      nome: restName,
      telefone: restPhone,
      logo_url: restLogo,
      theme: JSON.stringify(themePayload),
    });
  };

  const presetColors = [
    { name: 'Azul Stripe', primary: '#0A85EA', secondary: '#00D4B2' },
    { name: 'Toast POS Laranja', primary: '#f95738', secondary: '#ee9b00' },
    { name: 'Sleek Dark / Emerald', primary: '#10b981', secondary: '#3b82f6' },
    { name: 'Linear Roxo', primary: '#5e6ad2', secondary: '#f43f5e' },
    { name: 'Minimo Charcoal', primary: '#334155', secondary: '#64748b' },
  ];

  return (
    <Box>
      <Paper elevation={0} sx={{ mb: 3, borderRadius: 3, border: `1px solid ${theme.palette.divider}` }}>
        <Tabs value={activeTab} onChange={(_, val) => setActiveTab(val)} sx={{ px: 1 }}>
          <Tab icon={<User2 size={16} />} iconPosition="start" label="Perfil do Restaurante" sx={{ fontWeight: 600, py: 2 }} />
          <Tab icon={<Palette size={16} />} iconPosition="start" label="Identidade Visual & Temas" sx={{ fontWeight: 600, py: 2 }} />
          <Tab icon={<Printer size={16} />} iconPosition="start" label="Roteamento de Impressoras" sx={{ fontWeight: 600, py: 2 }} />
          <Tab icon={<CreditCard size={16} />} iconPosition="start" label="Terminais TEF (Pinpad)" sx={{ fontWeight: 600, py: 2 }} />
          <Tab icon={<ShoppingCart size={16} />} iconPosition="start" label="Produtos" sx={{ fontWeight: 600, py: 2 }} />
          {user?.role === 'admin' && (
            <Tab icon={<Users size={16} />} iconPosition="start" label="Gerenciar Usuários" sx={{ fontWeight: 600, py: 2 }} />
          )}
          {user?.role === 'admin' && (
            <Tab icon={<ShieldCheck size={16} />} iconPosition="start" label="Permissões" sx={{ fontWeight: 600, py: 2 }} />
          )}
        </Tabs>
      </Paper>

      {saveSuccess && (
        <Alert severity="success" sx={{ mb: 3, borderRadius: 3 }}>
          Configurações salvas com sucesso! As atualizações foram enviadas em tempo real para todos os terminais.
        </Alert>
      )}

      {errorMsg && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 3 }}>
          {errorMsg}
        </Alert>
      )}

      {/* Tab 0: Profile Settings */}
      {activeTab === 0 && (
        <Card>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>
              Informações do Estabelecimento
            </Typography>
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 3 }} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Avatar
                  src={restLogo}
                  alt="Logo Restaurante"
                  variant="rounded"
                  sx={{ width: 120, height: 120, mb: 2, border: `1px solid ${theme.palette.divider}` }}
                />
                <Typography variant="caption" color="text.secondary">
                  Visualização da Logo
                </Typography>
              </Grid>
              
              <Grid size={{ xs: 12, md: 9 }}>
                <Stack spacing={2.5}>
                  <TextField
                    label="Nome do Restaurante"
                    fullWidth
                    value={restName}
                    onChange={(e) => setRestName(e.target.value)}
                  />
                  <TextField
                    label="Telefone Comercial"
                    fullWidth
                    value={restPhone}
                    onChange={(e) => setRestPhone(e.target.value)}
                  />
                  <TextField
                    label="URL do Logotipo (Imagem)"
                    fullWidth
                    value={restLogo}
                    onChange={(e) => setRestLogo(e.target.value)}
                  />
                </Stack>
              </Grid>
            </Grid>

            <Divider sx={{ my: 4 }} />

            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                startIcon={<Save size={16} />}
                onClick={handleSaveProfileAndTheme}
                disabled={saveSettingsMutation.isPending}
              >
                Salvar Configurações
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Tab 1: Theme Identity branding settings */}
      {activeTab === 1 && (
        <Card>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>
              Sistema de Temas Dinâmicos
            </Typography>
            <Grid container spacing={4}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                  Esquemas de Cores
                </Typography>
                
                <Stack spacing={3}>
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Cor Primária (Hex)
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1.5 }}>
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        style={{ width: 48, height: 40, border: 'none', borderRadius: 4, cursor: 'pointer' }}
                      />
                      <TextField
                        size="small"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        sx={{ maxWidth: 120 }}
                      />
                    </Box>
                  </Box>

                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Cor Secundária (Hex)
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1.5 }}>
                      <input
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        style={{ width: 48, height: 40, border: 'none', borderRadius: 4, cursor: 'pointer' }}
                      />
                      <TextField
                        size="small"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        sx={{ maxWidth: 120 }}
                      />
                    </Box>
                  </Box>

                  <FormControlLabel
                    control={
                      <Switch
                        checked={isDarkMode}
                        onChange={(e) => setIsDarkMode(e.target.checked)}
                      />
                    }
                    label="Habilitar Dark Mode por Padrão"
                  />
                </Stack>
              </Grid>

              {/* Color Presets */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                  Paletas Pré-definidas
                </Typography>
                <Grid container spacing={2}>
                  {presetColors.map((preset, idx) => (
                    <Grid size={{ xs: 12, sm: 6 }} key={idx}>
                      <Paper
                        onClick={() => {
                          setPrimaryColor(preset.primary);
                          setSecondaryColor(preset.secondary);
                        }}
                        variant="outlined"
                        sx={{
                          p: 2,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          transition: 'all 0.2s',
                          '&:hover': {
                            borderColor: 'primary.main',
                            bgcolor: 'action.hover',
                          },
                        }}
                      >
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: preset.primary }} />
                          <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: preset.secondary }} />
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {preset.name}
                        </Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </Grid>
            </Grid>

            <Divider sx={{ my: 4 }} />

            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                startIcon={<Save size={16} />}
                onClick={handleSaveProfileAndTheme}
                disabled={saveSettingsMutation.isPending}
              >
                Aplicar Tema
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Printers setup - Full CRUD with USB support */}
      {activeTab === 2 && (
        <Card>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Configuração de Impressoras ESC/POS
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Suporte a impressoras via rede TCP/IP e via USB direto (/dev/usb/lp*)
                </Typography>
              </Box>
              <Button
                variant="contained"
                startIcon={<Printer size={16} />}
                onClick={handleOpenCreatePrinter}
              >
                Adicionar Impressora
              </Button>
            </Box>

            {printerTestResult && (
              <Alert
                severity={printerTestResult.success ? 'success' : 'error'}
                sx={{ mb: 3, borderRadius: 3 }}
                onClose={() => setPrinterTestResult(null)}
              >
                {printerTestResult.success
                  ? printerTestResult.message || 'Página de teste enviada com sucesso!'
                  : `Falha na impressora: ${printerTestResult.error || 'Sem resposta'}`}
              </Alert>
            )}

            {printers.length === 0 ? (
              <Paper
                variant="outlined"
                sx={{
                  p: 6,
                  textAlign: 'center',
                  borderRadius: 3,
                  borderStyle: 'dashed',
                }}
              >
                <Printer size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
                <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
                  Nenhuma impressora configurada
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Adicione impressoras de cozinha, bar e caixa. Suporte TCP e USB.
                </Typography>
              </Paper>
            ) : (
              <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 3 }}>
                <Table>
                  <TableHead sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
                    <TableRow>
                      <TableCell><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Nome da Impressora</Typography></TableCell>
                      <TableCell align="center"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Tipo</Typography></TableCell>
                      <TableCell align="center"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Conexão</Typography></TableCell>
                      <TableCell align="center"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Setor Roteado</Typography></TableCell>
                      <TableCell align="right"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Ações</Typography></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {printers.map((row) => {
                      const setorName = setores.find((s) => s.id === row.setor_id)?.nome || `Setor ${row.setor_id}`;
                      return (
                        <TableRow key={row.id} hover>
                          <TableCell component="th" scope="row">
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.nome}</Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={row.tipo === 'usb' ? 'USB Direto' : 'TCP/Rede'}
                              color={row.tipo === 'usb' ? 'info' : 'warning'}
                              size="small"
                              variant="outlined"
                              sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                              {row.tipo === 'usb' ? row.dispositivo : `${row.ip}:${row.porta}`}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={setorName}
                              color="default"
                              size="small"
                              sx={{ fontWeight: 600 }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <IconButton
                                size="small"
                                title="Enviar página de teste"
                                disabled={testingPrinterId === row.id}
                                onClick={() => handleTestPrinter(row.id)}
                                sx={{ color: 'success.main' }}
                              >
                                {testingPrinterId === row.id
                                  ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                  : <Printer size={16} />}
                              </IconButton>
                              <IconButton
                                size="small"
                                title="Editar"
                                onClick={() => handleOpenEditPrinter(row)}
                                sx={{ color: 'primary.main' }}
                              >
                                <Edit size={16} />
                              </IconButton>
                              <IconButton
                                size="small"
                                title="Remover"
                                onClick={() => {
                                  if (window.confirm(`Remover impressora "${row.nome}"?`)) {
                                    deletePrinterMutation.mutate(row.id);
                                  }
                                }}
                                sx={{ color: 'error.main' }}
                              >
                                <Trash2 size={16} />
                              </IconButton>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            <Box sx={{ mt: 5, mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Setores de Produção & Configuração KDS
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Ative o painel KDS ou controle se o cupom físico de preparo de pedido deve ser impresso para cada setor.
                Setores com a impressão desativada não enviarão cupons físicos (silenciando a impressão no setor correspondente e no caixa).
              </Typography>
            </Box>

            <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 3 }}>
              <Table>
                <TableHead sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
                  <TableRow>
                    <TableCell><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Nome do Setor</Typography></TableCell>
                    <TableCell align="center"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Painel KDS Operacional</Typography></TableCell>
                    <TableCell align="center"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Impressão de Cupom de Preparo</Typography></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {setores.map((setor) => (
                    <TableRow key={setor.id} hover>
                      <TableCell component="th" scope="row">
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{setor.nome}</Typography>
                      </TableCell>
                      <TableCell align="center">
                        <FormControlLabel
                          control={
                            <Switch
                              checked={setor.kds_ativo}
                              onChange={(e) => {
                                updateSetorMutation.mutate({
                                  id: setor.id,
                                  payload: { kds_ativo: e.target.checked }
                                });
                              }}
                              color="primary"
                            />
                          }
                          label={setor.kds_ativo ? "Ativo" : "Inativo"}
                          sx={{ m: 0 }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <FormControlLabel
                          control={
                            <Switch
                              checked={!setor.sem_impressao}
                              onChange={(e) => {
                                updateSetorMutation.mutate({
                                  id: setor.id,
                                  payload: { sem_impressao: !e.target.checked }
                                });
                              }}
                              color="primary"
                            />
                          }
                          label={!setor.sem_impressao ? "Habilitada" : "Desativada (Silencioso)"}
                          sx={{ m: 0 }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Printer Create/Edit Dialog */}
            <Dialog open={printerDialogOpen} onClose={() => setPrinterDialogOpen(false)} maxWidth="sm" fullWidth>
              <DialogTitle sx={{ fontWeight: 700 }}>
                {selectedPrinter ? 'Editar Impressora' : 'Adicionar Impressora'}
              </DialogTitle>
              <DialogContent>
                <Stack spacing={2.5} sx={{ mt: 1 }}>
                  <TextField
                    label="Nome da Impressora"
                    fullWidth
                    value={printerNome}
                    onChange={(e) => setPrinterNome(e.target.value)}
                    placeholder="Ex: Cozinha, Bar, Caixa Principal"
                  />

                  <TextField
                    select
                    label="Tipo de Conexão"
                    fullWidth
                    value={printerTipo}
                    onChange={(e) => setPrinterTipo(e.target.value as 'tcp' | 'usb')}
                    helperText={printerTipo === 'usb' ? 'Impressora conectada via USB diretamente ao servidor' : 'Impressora acessível via rede TCP/IP'}
                  >
                    <MenuItem value="tcp">🌐 TCP/IP – Rede Local</MenuItem>
                    <MenuItem value="usb">🖨️ USB – Dispositivo Direto</MenuItem>
                  </TextField>

                  {printerTipo === 'tcp' ? (
                    <>
                      <TextField
                        label="Endereço IP"
                        fullWidth
                        value={printerIP}
                        onChange={(e) => setPrinterIP(e.target.value)}
                        placeholder="192.168.1.100"
                        InputProps={{
                          startAdornment: <InputAdornment position="start">IP</InputAdornment>,
                        }}
                      />
                      <TextField
                        label="Porta TCP"
                        type="number"
                        fullWidth
                        value={printerPorta}
                        onChange={(e) => setPrinterPorta(Number(e.target.value))}
                        helperText="Padrão ESC/POS: 9100"
                        InputProps={{
                          startAdornment: <InputAdornment position="start">:</InputAdornment>,
                        }}
                      />
                    </>
                  ) : (
                    <Box>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                        <TextField
                          label="Caminho do Dispositivo USB"
                          fullWidth
                          value={printerDispositivo}
                          onChange={(e) => setPrinterDispositivo(e.target.value)}
                          placeholder="/dev/usb/lp0"
                          helperText="Ex: /dev/usb/lp0, /dev/lp0, /dev/ttyUSB0"
                          InputProps={{
                            startAdornment: <InputAdornment position="start">/dev/</InputAdornment>,
                          }}
                        />
                        <Button
                          variant="outlined"
                          size="small"
                          sx={{ mt: 1, minWidth: 110, whiteSpace: 'nowrap' }}
                          startIcon={<RefreshCw size={14} />}
                          onClick={async () => {
                            try {
                              const result = await api.get<{
                                devices: Array<{ path: string; model: string; vendor_id: string; product_id: string; accessible: boolean }>;
                                count: number;
                                setup: string;
                              }>('/api/printers/detect-usb');
                              setDetectedUSBDevices(result.devices);
                              setUsbSetupMsg(result.setup);
                            } catch {
                              setDetectedUSBDevices([]);
                              setUsbSetupMsg('Erro ao consultar devices. Backend rodando?');
                            }
                          }}
                        >
                          Detectar
                        </Button>
                      </Box>

                      {usbSetupMsg && (
                        <Alert
                          severity={detectedUSBDevices.some(d => d.accessible) ? 'success' : detectedUSBDevices.length > 0 ? 'warning' : 'info'}
                          sx={{ mt: 1, py: 0.5, fontSize: '0.78rem' }}
                        >
                          {usbSetupMsg}
                        </Alert>
                      )}

                      {detectedUSBDevices.length > 0 && (
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                            Devices encontrados — clique para selecionar:
                          </Typography>
                          <Stack direction="column" spacing={0.5}>
                            {detectedUSBDevices.map((dev) => (
                              <Box
                                key={dev.path || dev.vendor_id}
                                onClick={() => dev.path && setPrinterDispositivo(dev.path)}
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1,
                                  p: 1,
                                  borderRadius: 1.5,
                                  border: `1px solid`,
                                  borderColor: printerDispositivo === dev.path ? 'success.main' : 'divider',
                                  bgcolor: printerDispositivo === dev.path ? 'success.main' + '18' : 'background.default',
                                  cursor: dev.path ? 'pointer' : 'default',
                                  '&:hover': { bgcolor: dev.path ? 'action.hover' : undefined },
                                }}
                              >
                                <Box sx={{ flex: 1 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                    🖨️ {dev.model}
                                  </Typography>
                                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                                    {dev.path || '⚠️ Sem device file (execute: sudo modprobe usblp)'}
                                    {dev.vendor_id && ` · ${dev.vendor_id}:${dev.product_id}`}
                                  </Typography>
                                </Box>
                                <Chip
                                  label={dev.accessible ? 'OK' : dev.path ? 'Sem permissão' : 'Sem driver'}
                                  size="small"
                                  color={dev.accessible ? 'success' : 'warning'}
                                  variant="outlined"
                                  sx={{ fontSize: '0.65rem', fontWeight: 700 }}
                                />
                              </Box>
                            ))}
                          </Stack>
                        </Box>
                      )}
                      {detectedUSBDevices.length === 0 && usbSetupMsg === '' && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                          Clique em "Detectar" para escanear os devices USB disponíveis no servidor
                        </Typography>
                      )}
                    </Box>
                  )}

                  <TextField
                    select
                    label="Setor de Destino"
                    fullWidth
                    value={printerSetorID}
                    onChange={(e) => setPrinterSetorID(Number(e.target.value))}
                    helperText="Pedidos deste setor serão roteados para esta impressora"
                  >
                    {setores.map((s) => (
                      <MenuItem key={s.id} value={s.id}>{s.nome}</MenuItem>
                    ))}
                  </TextField>
                </Stack>
              </DialogContent>
              <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={() => setPrinterDialogOpen(false)}>Cancelar</Button>
                <Button
                  variant="contained"
                  startIcon={<Save size={16} />}
                  onClick={handleSavePrinter}
                  disabled={savePrinterMutation.isPending}
                >
                  {selectedPrinter ? 'Salvar Alterações' : 'Adicionar'}
                </Button>
              </DialogActions>
            </Dialog>
          </CardContent>
        </Card>
      )}


      {/* Tab 3: Pinpad / TEF setup */}
      {activeTab === 3 && (
        <Card>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Terminais TEF / Pinpad (Cielo)
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Configure e teste a conexão com os terminais de pagamento TEF
                </Typography>
              </Box>
              <Button
                variant="contained"
                startIcon={<CreditCard size={16} />}
                onClick={handleOpenCreatePinpad}
              >
                Adicionar Terminal
              </Button>
            </Box>

            {detectionResult && (
              <Alert
                severity={detectionResult.online ? 'success' : 'warning'}
                sx={{ mb: 3, borderRadius: 3 }}
                onClose={() => setDetectionResult(null)}
              >
                {detectionResult.online
                  ? `Terminal detectado! ${detectionResult.firmware ? `Firmware: ${detectionResult.firmware}` : ''}`
                  : `Terminal offline: ${detectionResult.error || 'Sem resposta'}`}
              </Alert>
            )}

            {pinpads.length === 0 ? (
              <Paper
                variant="outlined"
                sx={{
                  p: 6,
                  textAlign: 'center',
                  borderRadius: 3,
                  borderStyle: 'dashed',
                }}
              >
                <CreditCard size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
                <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
                  Nenhum terminal TEF configurado
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Adicione um terminal Cielo para processar pagamentos com cartão e PIX
                </Typography>
              </Paper>
            ) : (
              <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 3 }}>
                <Table>
                  <TableHead sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
                    <TableRow>
                      <TableCell><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Terminal</Typography></TableCell>
                      <TableCell align="center"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Modelo</Typography></TableCell>
                      <TableCell align="center"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Tipo</Typography></TableCell>
                      <TableCell align="center"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Conexão</Typography></TableCell>
                      <TableCell align="center"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Status</Typography></TableCell>
                      <TableCell align="right"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Ações</Typography></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pinpads.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell component="th" scope="row">
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.nome}</Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2">{row.modelo || 'Cielo'}</Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={row.tipo === 'serial' ? 'USB/Serial' : 'TCP/Rede'}
                            color={row.tipo === 'serial' ? 'info' : 'warning'}
                            size="small"
                            variant="outlined"
                            sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {row.tipo === 'serial' ? row.dispositivo : `${row.ip}:${row.porta}`}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            icon={row.ativo ? <Wifi size={14} /> : <WifiOff size={14} />}
                            label={row.ativo ? 'Ativo' : 'Inativo'}
                            color={row.ativo ? 'success' : 'default'}
                            size="small"
                            variant={row.ativo ? 'filled' : 'outlined'}
                            sx={{ fontWeight: 600 }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                            <IconButton
                              size="small"
                              onClick={() => handleDetectPinpad(row.id)}
                              disabled={detectingId === row.id}
                              color="info"
                              title="Testar conexão"
                            >
                              {detectingId === row.id ? (
                                <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                              ) : (
                                <Wifi size={16} />
                              )}
                            </IconButton>
                            <IconButton size="small" onClick={() => handleOpenEditPinpad(row)} color="primary">
                              <Edit size={16} />
                            </IconButton>
                            <IconButton size="small" onClick={() => deletePinpadMutation.mutate(row.id)} color="error">
                              <Trash2 size={16} />
                            </IconButton>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {/* Pinpad Dialog */}
            <Dialog open={pinpadDialogOpen} onClose={() => setPinpadDialogOpen(false)} maxWidth="sm" fullWidth>
              <DialogTitle sx={{ fontWeight: 700 }}>
                {selectedPinpad ? 'Editar Terminal TEF' : 'Adicionar Terminal TEF'}
              </DialogTitle>
              <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
                  <TextField
                    label="Nome do Terminal"
                    fullWidth
                    placeholder="Ex: Pinpad Caixa 1"
                    value={pinpadNome}
                    onChange={(e) => setPinpadNome(e.target.value)}
                  />
                  <TextField
                    select
                    label="Modelo"
                    fullWidth
                    value={pinpadModelo}
                    onChange={(e) => setPinpadModelo(e.target.value)}
                  >
                    <MenuItem value="Gertec PPC930">Gertec PPC930 (USB)</MenuItem>
                    <MenuItem value="Cielo LIO">Cielo LIO</MenuItem>
                    <MenuItem value="Cielo">Cielo (outro)</MenuItem>
                    <MenuItem value="Rede">Rede</MenuItem>
                    <MenuItem value="Getnet">Getnet</MenuItem>
                    <MenuItem value="Stone">Stone</MenuItem>
                    <MenuItem value="Outro">Outro</MenuItem>
                  </TextField>
                  <TextField
                    select
                    label="Tipo de Conexão"
                    fullWidth
                    value={pinpadTipo}
                    onChange={(e) => setPinpadTipo(e.target.value as 'serial' | 'tcp')}
                  >
                    <MenuItem value="serial">USB / Serial</MenuItem>
                    <MenuItem value="tcp">Rede (TCP)</MenuItem>
                  </TextField>
                  {pinpadTipo === 'serial' ? (
                    <>
                      <TextField
                        label="Dispositivo Serial"
                        fullWidth
                        placeholder="/dev/ttyACM0"
                        value={pinpadDispositivo}
                        onChange={(e) => setPinpadDispositivo(e.target.value)}
                        helperText="Caminho do dispositivo USB/serial no Linux"
                      />
                      <Alert severity="info" sx={{ borderRadius: 2 }}>
                        Dispositivo encontrado em <strong>/dev/ttyACM0</strong> (Gertec PPC930).
                        Certifique-se de que o usuário pertence ao grupo <strong>dialout</strong>:
                        <br /><code>sudo usermod -aG dialout $USER</code>
                      </Alert>
                    </>
                  ) : (
                    <>
                      <Grid container spacing={2}>
                        <Grid size={{ xs: 8 }}>
                          <TextField
                            label="IP do Agente TEF"
                            fullWidth
                            placeholder="127.0.0.1"
                            value={pinpadIP}
                            onChange={(e) => setPinpadIP(e.target.value)}
                          />
                        </Grid>
                        <Grid size={{ xs: 4 }}>
                          <TextField
                            label="Porta"
                            fullWidth
                            type="number"
                            value={pinpadPorta}
                            onChange={(e) => setPinpadPorta(Number(e.target.value))}
                          />
                        </Grid>
                      </Grid>
                      <Alert severity="info" sx={{ borderRadius: 2 }}>
                        O agente TEF geralmente roda em <strong>localhost:2001</strong>.
                      </Alert>
                    </>
                  )}
                  <TextField
                    label="Número de Série"
                    fullWidth
                    placeholder="N/S do terminal (opcional)"
                    value={pinpadSerial}
                    onChange={(e) => setPinpadSerial(e.target.value)}
                  />
                </Box>
              </DialogContent>
              <DialogActions sx={{ px: 3, pb: 3 }}>
                <Button onClick={() => setPinpadDialogOpen(false)}>Cancelar</Button>
                <Button
                  onClick={handleSavePinpad}
                  variant="contained"
                  disabled={savePinpadMutation.isPending || !pinpadNome}
                  startIcon={<Save size={16} />}
                >
                  Salvar Terminal
                </Button>
              </DialogActions>
            </Dialog>
          </CardContent>
        </Card>
      )}

      {/* Tab 4: Product Management */}
      {activeTab === 4 && (
        <Box>
          {/* Categorias Section */}
          <Card sx={{ mb: 3 }}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Categorias de Produtos
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Gerencie as categorias do cardápio
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<PlusCircle size={14} />}
                  onClick={() => { setSelectedCategory(null); setCategoryNome(''); setCategoryDescricao(''); setCategoryDialogOpen(true); }}
                  sx={{ fontWeight: 600, borderRadius: 2 }}
                >
                  Nova Categoria
                </Button>
              </Box>
              {categories.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                  Nenhuma categoria cadastrada
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {categories.map((cat) => (
                    <Chip
                      key={cat.id}
                      label={cat.nome}
                      onDelete={() => { if (confirm('Excluir categoria?')) deleteCategoryMutation.mutate(cat.id); }}
                      onClick={() => { setSelectedCategory(cat); setCategoryNome(cat.nome); setCategoryDescricao(cat.descricao || ''); setCategoryDialogOpen(true); }}
                      variant="outlined"
                      color="primary"
                      sx={{ fontWeight: 600, cursor: 'pointer' }}
                    />
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Products Section */}
          <Card>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Produtos
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {filteredProducts.length} produto(s) — {allProducts.filter((p) => p.ativo).length} ativo(s)
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  startIcon={<Package size={16} />}
                  onClick={handleOpenCreateProduct}
                  sx={{ fontWeight: 600, borderRadius: 2 }}
                >
                  Novo Produto
                </Button>
              </Box>

              {/* Search */}
              <TextField
                placeholder="Buscar produtos..."
                variant="outlined"
                size="small"
                fullWidth
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={16} style={{ opacity: 0.4 }} /></InputAdornment> } }}
                sx={{ mb: 2 }}
              />

              {filteredProducts.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 3, borderStyle: 'dashed' }}>
                  <Package size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
                  <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
                    Nenhum produto encontrado
                  </Typography>
                </Paper>
              ) : (
                <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 3 }}>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
                      <TableRow>
                        <TableCell><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Produto</Typography></TableCell>
                        <TableCell align="center"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Categoria</Typography></TableCell>
                        <TableCell align="center"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Preço</Typography></TableCell>
                        <TableCell align="center"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Cód. Barras</Typography></TableCell>
                        <TableCell align="center"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Ativo</Typography></TableCell>
                        <TableCell align="right"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Ações</Typography></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredProducts.map((row) => (
                        <TableRow key={row.id} sx={{ opacity: row.ativo ? 1 : 0.5 }}>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              {row.imagem_url ? (
                                <Box
                                  component="img"
                                  src={row.imagem_url}
                                  sx={{ width: 36, height: 36, borderRadius: 2, objectFit: 'cover' }}
                                  onError={(e: any) => { e.target.style.display = 'none'; }}
                                />
                              ) : (
                                <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Package size={16} style={{ opacity: 0.4 }} />
                                </Box>
                              )}
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.nome}</Typography>
                                <Typography variant="caption" color="text.secondary">{row.descricao?.substring(0, 40) || ''}</Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={categories.find((c) => c.id === row.categoria_id)?.nome || '—'}
                              size="small"
                              variant="outlined"
                              sx={{ fontWeight: 500, fontSize: '0.7rem' }}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                              R$ {row.preco.toFixed(2)}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                              {row.codigo_barras || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Switch
                              size="small"
                              checked={row.ativo}
                              onChange={(_, checked) => {
                                api.put(`/api/products/${row.id}`, { ativo: checked }).then(() => refetchAllProducts());
                              }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <IconButton size="small" onClick={() => handleOpenEditProduct(row)} color="primary">
                                <Edit size={14} />
                              </IconButton>
                              <IconButton size="small" onClick={() => deleteProductMutation.mutate(row.id)} color="error">
                                <Trash2 size={14} />
                              </IconButton>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>

          {/* Product Dialog */}
          <Dialog open={productDialogOpen} onClose={() => setProductDialogOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontWeight: 700 }}>
              {selectedProduct ? 'Editar Produto' : 'Novo Produto'}
            </DialogTitle>
            <DialogContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
                <TextField label="Nome do Produto" fullWidth value={productNome} onChange={(e) => setProductNome(e.target.value)} />
                <TextField label="Descrição" fullWidth multiline rows={2} value={productDescricao} onChange={(e) => setProductDescricao(e.target.value)} />
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6 }}>
                    <TextField label="Preço (R$)" fullWidth type="number" inputProps={{ step: 0.01 }} value={productPreco} onChange={(e) => setProductPreco(e.target.value)} />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField select label="Categoria" fullWidth value={productCategoriaID} onChange={(e) => handleCategoryChange(Number(e.target.value))}>
                      {categories.map((c) => (
                        <MenuItem key={c.id} value={c.id}>{c.nome}</MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                </Grid>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      select
                      label="Tipo de Item"
                      fullWidth
                      value={productTipo}
                      onChange={(e) => setProductTipo(e.target.value as 'produto' | 'insumo')}
                    >
                      <MenuItem value="produto">Produto Final (Venda)</MenuItem>
                      <MenuItem value="insumo">Insumo / Ingrediente</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField select label="Setor de Produção (KDS)" fullWidth value={productSetorID} onChange={(e) => setProductSetorID(Number(e.target.value))}>
                      {setores.map((s) => (
                        <MenuItem key={s.id} value={s.id}>{s.nome}</MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                </Grid>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      select
                      label="Unidade de Medida"
                      fullWidth
                      value={productUnidadeMedida}
                      onChange={(e) => setProductUnidadeMedida(e.target.value as any)}
                    >
                      <MenuItem value="un">Unidade (un)</MenuItem>
                      <MenuItem value="kg">Kilograma (kg)</MenuItem>
                      <MenuItem value="g">Grama (g)</MenuItem>
                      <MenuItem value="l">Litro (l)</MenuItem>
                      <MenuItem value="ml">Mililitro (ml)</MenuItem>
                    </TextField>
                  </Grid>
                </Grid>
                <TextField label="Código de Barras" fullWidth value={productCodigoBarras} onChange={(e) => setProductCodigoBarras(e.target.value)} />
                <TextField label="URL da Imagem" fullWidth placeholder="https://..." value={productImagemURL} onChange={(e) => setProductImagemURL(e.target.value)} />
              </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 3 }}>
              <Button onClick={() => setProductDialogOpen(false)}>Cancelar</Button>
              <Button variant="contained" onClick={handleSaveProduct} disabled={saveProductMutation.isPending} startIcon={<Save size={16} />}>
                Salvar Produto
              </Button>
            </DialogActions>
          </Dialog>

          {/* Category Dialog */}
          <Dialog open={categoryDialogOpen} onClose={() => setCategoryDialogOpen(false)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ fontWeight: 700 }}>
              {selectedCategory ? 'Editar Categoria' : 'Nova Categoria'}
            </DialogTitle>
            <DialogContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
                <TextField label="Nome da Categoria" fullWidth value={categoryNome} onChange={(e) => setCategoryNome(e.target.value)} />
                <TextField label="Descrição" fullWidth value={categoryDescricao} onChange={(e) => setCategoryDescricao(e.target.value)} />
              </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 3 }}>
              <Button onClick={() => setCategoryDialogOpen(false)}>Cancelar</Button>
              <Button variant="contained" onClick={() => saveCategoryMutation.mutate({ nome: categoryNome, descricao: categoryDescricao })} disabled={saveCategoryMutation.isPending}>
                Salvar
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      )}

      {/* Tab 5: Users setup */}
      {activeTab === 5 && user?.role === 'admin' && (
        <Card>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Gerenciamento de Funcionários e Acessos
              </Typography>
              <Button
                variant="contained"
                startIcon={<UserPlus size={16} />}
                onClick={handleOpenCreateUser}
              >
                Novo Usuário
              </Button>
            </Box>
            
            <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 3 }}>
              <Table>
                <TableHead sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
                  <TableRow>
                    <TableCell><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Nome</Typography></TableCell>
                    <TableCell align="center"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>E-mail (Login)</Typography></TableCell>
                    <TableCell align="center"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Cargo</Typography></TableCell>
                    <TableCell align="right"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Ações</Typography></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {usersList.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell component="th" scope="row">
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.nome}</Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2">{row.email}</Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={
                            row.role === 'admin' ? 'Administrador' : row.role === 'caixa' ? 'Caixa' : row.role === 'garcom' ? 'Garçom' : 'Cozinha'
                          }
                          color={row.role === 'admin' ? 'error' : row.role === 'caixa' ? 'success' : row.role === 'garcom' ? 'primary' : 'warning'}
                          size="small"
                          sx={{ fontWeight: 600 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => handleOpenEditUser(row)} color="primary" sx={{ mr: 1 }}>
                          <Edit size={16} />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleDeleteUser(row.id)} color="error" disabled={row.id === user?.id}>
                          <Trash2 size={16} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Dialog User CRUD */}
            <Dialog open={userDialogOpen} onClose={() => setUserDialogOpen(false)} maxWidth="xs" fullWidth>
              <DialogTitle sx={{ fontWeight: 700 }}>{selectedUser ? 'Editar Usuário' : 'Cadastrar Novo Usuário'}</DialogTitle>
              <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
                  <TextField
                    label="Nome Completo"
                    fullWidth
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                  />
                  <TextField
                    label="Email de Acesso"
                    type="email"
                    fullWidth
                    placeholder={selectedUser ? 'email@exemplo.com' : 'Deixe em branco para gerar automatico'}
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    helperText={!userEmail && !selectedUser ? 'Será gerado automaticamente como nome@sabor.com' : ''}
                  />
                  <TextField
                    label="Senha de Acesso"
                    type="password"
                    fullWidth
                    placeholder={selectedUser ? 'Preencha para alterar' : 'Senha'}
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                  />
                  <TextField
                    select
                    label="Cargo / Nível de Acesso"
                    fullWidth
                    value={userRole}
                    onChange={(e) => setUserRole(e.target.value)}
                  >
                    <MenuItem value="admin">Administrador / Gerente</MenuItem>
                    <MenuItem value="caixa">Operador de Caixa</MenuItem>
                    <MenuItem value="garcom">Garçom</MenuItem>
                    <MenuItem value="cozinha">Cozinha / Copa</MenuItem>
                  </TextField>
                </Box>
              </DialogContent>
              <DialogActions sx={{ px: 3, pb: 3 }}>
                <Button onClick={() => setUserDialogOpen(false)}>Cancelar</Button>
                <Button
                  onClick={handleSaveUser}
                  variant="contained"
                  disabled={createUserMutation.isPending || updateUserMutation.isPending}
                >
                  Salvar Usuário
                </Button>
              </DialogActions>
            </Dialog>
          </CardContent>
        </Card>
      )}

      {/* Tab 6: Permissions setup (admin only) */}
      {activeTab === 6 && user?.role === 'admin' && (
        <Card>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
              Gerenciamento de Permissões
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Defina quais cargos têm acesso a cada módulo do sistema. As alterações são salvas automaticamente.
            </Typography>

            <PermissionEditor />
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

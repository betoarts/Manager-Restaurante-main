import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Switch,
  Typography,
  Paper,
  Box,
  Alert,
  Button,
  CircularProgress,
  Snackbar,
} from '@mui/material';
import { Save as SaveIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';

const ALL_ROLES = [
  { key: 'admin', label: 'Administrador' },
  { key: 'gerente', label: 'Gerente' },
  { key: 'caixa', label: 'Caixa' },
  { key: 'garcom', label: 'Garçom' },
  { key: 'cozinha', label: 'Cozinha' },
];

const MODULES = [
  { id: 'pdv_acesso', label: 'Acesso ao PDV' },
  { id: 'pdv_cancelar', label: 'Cancelar Pedido (PDV)' },
  { id: 'caixa_sangria', label: 'Realizar Sangria/Estorno' },
  { id: 'financeiro_acesso', label: 'Acesso ao Financeiro' },
  { id: 'kds_acesso', label: 'Acesso ao KDS (Cozinha)' },
];

interface RolePermission {
  role: string;
  modulo: string;
  permitido: boolean;
}

export const PermissionEditor: React.FC = () => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [matrix, setMatrix] = useState<Record<string, Record<string, boolean>>>({});
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  const { data: permissoes, isLoading } = useQuery<RolePermission[]>({
    queryKey: ['permissoes'],
    queryFn: async () => {
      const { data } = await api.get('/api/permissoes');
      return data;
    }
  });

  useEffect(() => {
    if (permissoes) {
      const initialMatrix: Record<string, Record<string, boolean>> = {};
      ALL_ROLES.forEach(r => {
        initialMatrix[r.key] = {};
        MODULES.forEach(m => {
          const perm = permissoes.find(p => p.role === r.key && p.modulo === m.id);
          initialMatrix[r.key][m.id] = perm ? perm.permitido : false;
        });
      });
      setMatrix(initialMatrix);
    }
  }, [permissoes]);

  const saveMutation = useMutation({
    mutationFn: async (updates: RolePermission[]) => {
      const { data } = await api.post('/api/permissoes', updates);
      return data;
    },
    onSuccess: () => {
      setToast({ open: true, message: 'Permissões salvas com sucesso no banco de dados!', severity: 'success' });
      queryClient.invalidateQueries({ queryKey: ['permissoes'] });
    },
    onError: () => {
      setToast({ open: true, message: 'Erro ao salvar permissões.', severity: 'error' });
    }
  });

  const togglePermission = (role: string, modulo: string) => {
    // Evita alterar admin
    if (role === 'admin') return;

    setMatrix((prev) => {
      const rolePerms = prev[role] || {};
      return {
        ...prev,
        [role]: {
          ...rolePerms,
          [modulo]: !rolePerms[modulo]
        }
      };
    });
  };

  const handleSave = () => {
    const updates: RolePermission[] = [];
    ALL_ROLES.forEach(r => {
      MODULES.forEach(m => {
        updates.push({
          role: r.key,
          modulo: m.id,
          permitido: matrix[r.key]?.[m.id] || false
        });
      });
    });
    saveMutation.mutate(updates);
  };

  if (isLoading) {
    return <CircularProgress />;
  }

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
        Estas permissões definem ações dinâmicas no sistema (como poder cancelar pedidos e acessar o financeiro). Administradores sempre possuem acesso a tudo.
      </Alert>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button 
          variant="contained" 
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 3 }}>
        <Table size="small">
          <TableHead sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Ação / Módulo</TableCell>
              {ALL_ROLES.map((role) => (
                <TableCell key={role.key} align="center" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {role.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {MODULES.map((mod) => (
              <TableRow key={mod.id} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {mod.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.65rem' }}>
                    {mod.id}
                  </Typography>
                </TableCell>
                {ALL_ROLES.map((role) => {
                  const hasAccess = matrix[role.key]?.[mod.id] || false;
                  return (
                    <TableCell key={role.key} align="center">
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <Switch
                          size="small"
                          checked={role.key === 'admin' ? true : hasAccess}
                          onChange={() => togglePermission(role.key, mod.id)}
                          color="primary"
                          disabled={role.key === 'admin'}
                        />
                      </Box>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Snackbar 
        open={toast.open} 
        autoHideDuration={4000} 
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

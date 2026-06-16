import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Badge,
  useTheme,
  useMediaQuery,
  Tooltip,
} from '@mui/material';
import {
  LayoutDashboard,
  Smartphone,
  ChefHat,
  GlassWater,
  Dessert,
  Boxes,
  Settings,
  LogOut,
  Menu,
  Moon,
  Sun,
  Grid3X3,
  Wifi,
  WifiOff,
  PanelLeftClose,
  PanelLeftOpen,
  ShoppingCart,
  DollarSign,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { api } from '../utils/api';
import { getMenuForRole } from '../utils/permissions';

const DRAWER_WIDTH = 260;
const DRAWER_COLLAPSED_WIDTH = 68;

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const { user, company, logout, socketConnected, themeColors, updateCompanySettings } = useStore();

  const effectiveDrawerWidth = isMobile ? 0 : (desktopCollapsed ? DRAWER_COLLAPSED_WIDTH : DRAWER_WIDTH);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const toggleDarkMode = () => {
    if (company) {
      const updatedTheme = { ...themeColors, dark: !themeColors.dark };
      const updatedCompany = { ...company, theme: JSON.stringify(updatedTheme) };
      updateCompanySettings(updatedCompany);
      // Optional: Save to backend
      api.put('/api/auth/tenant', { theme: JSON.stringify(updatedTheme) }).catch(() => {});
    }
  };

  const menuIcons: Record<string, React.ReactNode> = {
    'Dashboard': <LayoutDashboard size={20} />,
    'PDV (Venda Rápida)': <Smartphone size={20} />,
    'Mapa de Mesas': <Grid3X3 size={20} />,
    'KDS Cozinha': <ChefHat size={20} />,
    'KDS Bar': <GlassWater size={20} />,
    'KDS Sobremesa': <Dessert size={20} />,
    'Estoque': <Boxes size={20} />,
    'Compras': <ShoppingCart size={20} />,
    'Financeiro': <DollarSign size={20} />,
    'Configurações': <Settings size={20} />,
  };

  const menuItems = getMenuForRole(user?.role).map((item) => ({
    ...item,
    icon: menuIcons[item.text] || <LayoutDashboard size={20} />,
  }));

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexContainer: 'column', flexDirection: 'column' }}>
      <Toolbar sx={{ display: 'flex', alignItems: 'center', justifyContent: desktopCollapsed && !isMobile ? 'center' : 'flex-start', gap: 1.5, py: 2, px: desktopCollapsed && !isMobile ? 0 : 2 }}>
        {company?.logo_url ? (
          <Avatar src={company.logo_url} alt="Logo" variant="rounded" sx={{ width: 40, height: 40 }} />
        ) : (
          <Avatar variant="rounded" sx={{ width: 40, height: 40, bgcolor: 'primary.main' }}>
            {company?.nome?.[0] || 'R'}
          </Avatar>
        )}
        {(!desktopCollapsed || isMobile) && (
          <Box sx={{ overflow: 'hidden' }}>
            <Typography variant="subtitle1" noWrap sx={{ fontWeight: 700, letterSpacing: '-0.5px' }}>
              {company?.nome || 'ERP Restaurante'}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              SaaS Admin
            </Typography>
          </Box>
        )}
      </Toolbar>
      <Divider sx={{ opacity: 0.6 }} />

      {/* Menu List */}
      <List sx={{ px: desktopCollapsed && !isMobile ? 0.5 : 1, flexGrow: 1, pt: 2 }}>
        {menuItems.map((item) => {
          const active = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
          const collapsed = desktopCollapsed && !isMobile;
          return (
            <ListItem key={item.text} disablePadding sx={{ display: 'block', mb: 0.5 }}>
              <Tooltip title={collapsed ? item.text : ''} placement="right" arrow>
                <ListItemButton
                  onClick={() => {
                    navigate(item.path);
                    if (isMobile) setMobileOpen(false);
                  }}
                  sx={{
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    bgcolor: active ? 'primary.light' : 'transparent',
                    color: active ? 'primary.contrastText' : 'text.primary',
                    opacity: active ? 1 : 0.85,
                    borderRadius: collapsed ? 2 : 0,
                    minHeight: 48,
                    px: collapsed ? 1 : 2,
                    '&:hover': {
                      bgcolor: active ? 'primary.light' : 'action.hover',
                      opacity: 1,
                    },
                  }}
                >
                  <ListItemIcon sx={{ color: active ? 'primary.contrastText' : 'text.secondary', minWidth: collapsed ? 0 : 40, justifyContent: 'center' }}>
                    {item.icon}
                  </ListItemIcon>
                  {!collapsed && (
                    <ListItemText primary={<Typography variant="body2" sx={{ fontSize: '14px', fontWeight: active ? 600 : 500 }}>{item.text}</Typography>} />
                  )}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          );
        })}
      </List>

      <Divider sx={{ opacity: 0.6 }} />

      {/* User Section */}
      <Box sx={{ p: desktopCollapsed && !isMobile ? 1 : 2, display: 'flex', alignItems: 'center', justifyContent: desktopCollapsed && !isMobile ? 'center' : 'flex-start', gap: 1.5 }}>
        <Tooltip title={desktopCollapsed && !isMobile ? `${user?.nome || 'Operador'} (${user?.role || ''})` : ''} placement="right" arrow>
          <Avatar sx={{ bgcolor: 'secondary.main', fontSize: '14px', fontWeight: 600 }}>
            {user?.nome?.[0]?.toUpperCase() || 'U'}
          </Avatar>
        </Tooltip>
        {(!desktopCollapsed || isMobile) && (
          <>
            <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                {user?.nome || 'Operador'}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', textTransform: 'capitalize' }}>
                {user?.role || 'garcom'}
              </Typography>
            </Box>
            <IconButton color="error" size="small" onClick={logout}>
              <LogOut size={18} />
            </IconButton>
          </>
        )}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        sx={{
          width: isMobile ? '100%' : `calc(100% - ${effectiveDrawerWidth}px)`,
          ml: isMobile ? 0 : `${effectiveDrawerWidth}px`,
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(15, 17, 26, 0.8)' : 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(10px)',
          zIndex: theme.zIndex.drawer + 1,
          transition: 'width 0.2s ease, margin-left 0.2s ease',
        }}
      >
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', px: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {isMobile ? (
              <IconButton color="inherit" edge="start" onClick={handleDrawerToggle} sx={{ mr: 1, color: 'text.primary' }}>
                <Menu size={24} />
              </IconButton>
            ) : (
              <IconButton
                color="inherit"
                edge="start"
                onClick={() => setDesktopCollapsed(!desktopCollapsed)}
                sx={{ mr: 1, color: 'text.primary' }}
                title={desktopCollapsed ? 'Expandir menu' : 'Recolher menu'}
              >
                {desktopCollapsed ? <PanelLeftOpen size={22} /> : <PanelLeftClose size={22} />}
              </IconButton>
            )}
            <Typography variant="h6" noWrap component="div" sx={{ color: 'text.primary', fontWeight: 700, fontSize: '18px' }}>
              {(() => {
                const match = menuItems.find((item) => location.pathname.startsWith(item.path) && item.path !== '/') || menuItems.find((item) => item.path === location.pathname);
                return match?.text || 'Gerenciador';
              })()}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {/* WebSocket connection status indicator */}
            <Tooltip title={socketConnected ? 'Conectado em tempo real' : 'Sem conexão em tempo real. Tentando reconectar...'}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {socketConnected ? (
                  <Badge color="success" variant="dot" overlap="circular">
                    <Wifi size={18} style={{ color: theme.palette.success.main }} />
                  </Badge>
                ) : (
                  <Badge color="error" variant="dot" overlap="circular" className="pulse">
                    <WifiOff size={18} style={{ color: theme.palette.error.main }} />
                  </Badge>
                )}
              </Box>
            </Tooltip>

            {/* Dark Mode toggle */}
            <IconButton onClick={toggleDarkMode} sx={{ color: 'text.primary' }}>
              {themeColors.dark ? <Sun size={20} /> : <Moon size={20} />}
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Drawer */}
      <Box component="nav" sx={{ width: { md: effectiveDrawerWidth }, flexShrink: { md: 0 } }}>
        {isMobile ? (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={handleDrawerToggle}
            ModalProps={{ keepMounted: true }}
            sx={{
              display: { xs: 'block', md: 'none' },
              '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH },
            }}
          >
            {drawerContent}
          </Drawer>
        ) : (
          <Drawer
            variant="permanent"
            sx={{
              display: { xs: 'none', md: 'block' },
              '& .MuiDrawer-paper': {
                boxSizing: 'border-box',
                width: effectiveDrawerWidth,
                transition: 'width 0.2s ease',
                overflowX: 'hidden',
              },
            }}
            open
          >
            {drawerContent}
          </Drawer>
        )}
      </Box>

      {/* Main Content Area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: isMobile ? '100%' : `calc(100% - ${effectiveDrawerWidth}px)`,
          pt: '88px', // offset AppBar height
          transition: 'width 0.2s ease',
        }}
      >
        {children}
      </Box>
    </Box>
  );
};



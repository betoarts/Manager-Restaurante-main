import { create } from 'zustand';
import type { Usuario, Empresa, Mesa, Pedido, Produto } from '../types';
import { api, clearAuthToken } from '../utils/api';

interface CartItem {
  produto: Produto;
  quantidade: number;
  observacao: string;
}

interface AppState {
  // Auth State
  user: Usuario | null;
  company: Empresa | null;
  isAuthenticated: boolean;
  login: (token: string, user: Usuario, company: Empresa) => void;
  logout: () => void;
  updateCompanySettings: (company: Empresa) => void;

  // UI Custom Theme State
  themeColors: {
    primary: string;
    secondary: string;
    dark: boolean;
  };

  // Tables Map State
  tables: Mesa[];
  setTables: (tables: Mesa[]) => void;
  updateTableState: (table: Mesa) => void;

  // PDV: Mesas em processo de fechamento (notificação para caixa)
  closingTables: Mesa[];
  dismissClosingTable: (mesaId: number) => void;

  // Garçom: pedidos prontos para retirada no balcão
  waiterReadyOrders: Pedido[];
  dismissWaiterReadyOrder: (orderId: number) => void;

  // PDV Cart State
  cart: CartItem[];
  selectedTableId: number | null;
  selectedComandaId: number | null;
  addToCart: (produto: Produto, quantidade?: number, observacao?: string) => void;
  removeFromCart: (produtoId: number) => void;
  updateCartQuantity: (produtoId: number, qty: number) => void;
  clearCart: () => void;
  setSelectedTableId: (tableId: number | null) => void;
  setSelectedComandaId: (comandaId: number | null) => void;

  // KDS Orders State
  kdsOrders: Pedido[];
  setKDSOrders: (orders: Pedido[]) => void;
  addOrUpdateKDSOrder: (order: Pedido) => void;

  // Real-time WebSocket connection
  socket: WebSocket | null;
  socketConnected: boolean;
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  // Auth State
  user: JSON.parse(localStorage.getItem('auth_user') || 'null'),
  company: JSON.parse(localStorage.getItem('auth_company') || 'null'),
  isAuthenticated: !!localStorage.getItem('auth_token'),
  themeColors: (() => {
    try {
      const co = JSON.parse(localStorage.getItem('auth_company') || 'null');
      if (co?.theme) {
        return JSON.parse(co.theme);
      }
    } catch (e) {}
    return { primary: '#1976d2', secondary: '#dc004e', dark: false };
  })(),

  login: (token, user, company) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('auth_company', JSON.stringify(company));
    
    let themeColors = { primary: '#1976d2', secondary: '#dc004e', dark: false };
    try {
      if (company.theme) {
        themeColors = JSON.parse(company.theme);
      }
    } catch (e) {}

    set({
      user,
      company,
      isAuthenticated: true,
      themeColors
    });
    
    // Connect WebSocket on successful login
    get().connectWebSocket();
  },

  logout: () => {
    clearAuthToken();
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_company');
    get().disconnectWebSocket();
    set({
      user: null,
      company: null,
      isAuthenticated: false,
      cart: [],
      tables: [],
      kdsOrders: [],
      selectedTableId: null,
      selectedComandaId: null
    });
  },

  updateCompanySettings: (company) => {
    localStorage.setItem('auth_company', JSON.stringify(company));
    let themeColors = { primary: '#1976d2', secondary: '#dc004e', dark: false };
    try {
      if (company.theme) {
        themeColors = JSON.parse(company.theme);
      }
    } catch (e) {}
    set({ company, themeColors });
  },

  // Tables Map State
  tables: [],
  setTables: (tables) => set({ tables }),
  updateTableState: (updatedMesa) => set((state) => ({
    tables: state.tables.map((m) => m.id === updatedMesa.id ? updatedMesa : m)
  })),

  // PDV: mesas em processo de fechamento
  closingTables: [],
  dismissClosingTable: (mesaId) => set((state) => ({
    closingTables: state.closingTables.filter((m) => m.id !== mesaId)
  })),

  // Garçom: pedidos prontos para retirada
  waiterReadyOrders: [],
  dismissWaiterReadyOrder: (orderId) => set((state) => ({
    waiterReadyOrders: state.waiterReadyOrders.filter((o) => o.id !== orderId)
  })),

  // PDV Cart State
  cart: [],
  selectedTableId: null,
  selectedComandaId: null,
  
  addToCart: (produto, quantidade = 1, observacao = '') => set((state) => {
    const existingIndex = state.cart.findIndex(item => item.produto.id === produto.id);
    if (existingIndex > -1) {
      const updatedCart = [...state.cart];
      updatedCart[existingIndex].quantidade += quantidade;
      if (observacao) {
        updatedCart[existingIndex].observacao = observacao;
      }
      return { cart: updatedCart };
    }
    return { cart: [...state.cart, { produto, quantidade, observacao }] };
  }),

  removeFromCart: (produtoId) => set((state) => ({
    cart: state.cart.filter(item => item.produto.id !== produtoId)
  })),

  updateCartQuantity: (produtoId, qty) => set((state) => {
    if (qty <= 0) {
      return { cart: state.cart.filter(item => item.produto.id !== produtoId) };
    }
    return {
      cart: state.cart.map(item => item.produto.id === produtoId ? { ...item, quantidade: qty } : item)
    };
  }),

  clearCart: () => set({ cart: [], selectedTableId: null, selectedComandaId: null }),
  setSelectedTableId: (selectedTableId) => set({ selectedTableId }),
  setSelectedComandaId: (selectedComandaId) => set({ selectedComandaId }),

  // KDS Orders State
  kdsOrders: [],
  setKDSOrders: (kdsOrders) => set({ kdsOrders }),
  addOrUpdateKDSOrder: (order) => set((state) => {
    const exists = state.kdsOrders.some((o) => o.id === order.id);
    if (exists) {
      // If order is delivered (entregue), remove it from active KDS list
      // Remove from KDS when dispatched by kitchen or delivered by cashier
      if (order.status === 'despachado' || order.status === 'entregue') {
        return { kdsOrders: state.kdsOrders.filter((o) => o.id !== order.id) };
      }
      // Otherwise, update details
      return {
        kdsOrders: state.kdsOrders.map((o) => o.id === order.id ? order : o)
      };
    }
    // Only append active kitchen orders (not dispatched or delivered)
    if (order.status !== 'despachado' && order.status !== 'entregue') {
      return { kdsOrders: [...state.kdsOrders, order] };
    }
    return state;
  }),

  // Real-time WebSocket connection
  socket: null,
  socketConnected: false,

  connectWebSocket: () => {
    const currentSocket = get().socket;
    if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
      return;
    }

    // Terminate existing connection before initializing new one
    get().disconnectWebSocket();

    const wsUrl = api.getWebSocketUrl();
    const ws = new WebSocket(wsUrl);

    // Reconnect backoff: 1s → 2s → 3s → 5s → 10s (max)
    let reconnectAttempts = 0;
    const getReconnectDelay = () => {
      const delays = [1000, 2000, 3000, 5000, 10000];
      return delays[Math.min(reconnectAttempts, delays.length - 1)];
    };

    ws.onopen = () => {
      console.log('Realtime WebSocket connected.');
      reconnectAttempts = 0;
      set({ socket: ws, socketConnected: true });
    };

    ws.onclose = () => {
      console.log('Realtime WebSocket disconnected.');
      set({ socket: null, socketConnected: false });
      // Auto reconnect with backoff if still authenticated
      if (get().isAuthenticated) {
        const delay = getReconnectDelay();
        reconnectAttempts++;
        setTimeout(() => get().connectWebSocket(), delay);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
      ws.close();
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.event) {
          case 'table_updated': {
            const updatedTable: Mesa = message.data;
            get().updateTableState(updatedTable);
            if (updatedTable.status === 'em_fechamento') {
              set((state) => ({
                closingTables: state.closingTables.some((m) => m.id === updatedTable.id)
                  ? state.closingTables.map((m) => m.id === updatedTable.id ? updatedTable : m)
                  : [...state.closingTables, updatedTable]
              }));
            } else {
              set((state) => ({
                closingTables: state.closingTables.filter((m) => m.id !== updatedTable.id)
              }));
            }
            break;
          }
          case 'order_created':
          case 'order_updated':
          case 'kds_updated':
            get().addOrUpdateKDSOrder(message.data);
            break;
          case 'order_ready_dispatch':
            set((state) => ({
              waiterReadyOrders: state.waiterReadyOrders.some((o) => o.id === message.data.id)
                ? state.waiterReadyOrders
                : [...state.waiterReadyOrders, message.data]
            }));
            // Vibrate device for immediate notification (mobile)
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              navigator.vibrate([200, 100, 200]);
            }
            break;
          case 'table_checkout_done':
            get().dismissClosingTable(message.data.id);
            break;
          case 'settings_updated':
            get().updateCompanySettings(message.data);
            break;
        }
      } catch (err) {
        console.error('Error handling WebSocket message payload:', err);
      }
    };
  },

  disconnectWebSocket: () => {
    const ws = get().socket;
    if (ws) {
      ws.close();
    }
    set({ socket: null, socketConnected: false });
  }
}));

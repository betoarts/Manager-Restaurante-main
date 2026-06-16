import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store/useStore';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { PDV } from './pages/PDV';
import { Mesas } from './pages/Mesas';
import { KDS } from './pages/KDS';
import { Estoque } from './pages/Estoque';
import { Configuracoes } from './pages/Configuracoes';
import { GarcomMobile } from './pages/GarcomMobile';
import { Compras } from './pages/Compras';
import { Financeiro } from './pages/Financeiro';
import { getHomeForRole } from './utils/permissions';

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, roles }) => {
  const isAuthenticated = useStore((state) => state.isAuthenticated);
  const user = useStore((state) => state.user);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (roles && roles.length > 0 && user) {
    if (!roles.includes(user.role)) {
      // Redirect to the user's home page if not authorized
      return <Navigate to={getHomeForRole(user.role)} replace />;
    }
  }

  return <>{children}</>;
};

const HomeRoute: React.FC = () => {
  const user = useStore((state) => state.user);
  if (!user) return <Navigate to="/login" replace />;
  
  const homePath = getHomeForRole(user.role);
  if (homePath === '/') {
    return (
      <Layout>
        <Dashboard />
      </Layout>
    );
  }
  return <Navigate to={homePath} replace />;
};

export const App: React.FC = () => {
  const { isAuthenticated, connectWebSocket, disconnectWebSocket } = useStore();

  // Handle WebSocket connections on app mount if user is already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      connectWebSocket();
    }
    return () => {
      disconnectWebSocket();
    };
  }, [isAuthenticated, connectWebSocket, disconnectWebSocket]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <HomeRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pdv"
          element={
            <ProtectedRoute roles={['admin', 'gerente', 'caixa']}>
              <Layout>
                <PDV />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/mesas"
          element={
            <ProtectedRoute roles={['admin', 'gerente', 'caixa']}>
              <Layout>
                <Mesas />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/kds/cozinha"
          element={
            <ProtectedRoute roles={['admin', 'gerente', 'cozinha']}>
              <Layout>
                <KDS setor="cozinha" />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/kds/bar"
          element={
            <ProtectedRoute roles={['admin', 'gerente', 'cozinha']}>
              <Layout>
                <KDS setor="bar" />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/kds/sobremesa"
          element={
            <ProtectedRoute roles={['admin', 'gerente', 'cozinha']}>
              <Layout>
                <KDS setor="sobremesa" />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/estoque"
          element={
            <ProtectedRoute roles={['admin', 'gerente']}>
              <Layout>
                <Estoque />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/compras"
          element={
            <ProtectedRoute roles={['admin', 'gerente']}>
              <Layout>
                <Compras />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/financeiro"
          element={
            <ProtectedRoute roles={['admin', 'gerente']}>
              <Layout>
                <Financeiro />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/configs"
          element={
            <ProtectedRoute roles={['admin', 'gerente']}>
              <Layout>
                <Configuracoes />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/garcom"
          element={
            <ProtectedRoute roles={['garcom']}>
              <GarcomMobile />
            </ProtectedRoute>
          }
        />

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
export default App;

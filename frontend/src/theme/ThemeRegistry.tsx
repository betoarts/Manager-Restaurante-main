import React, { useMemo } from 'react';
import { createTheme, ThemeProvider, CssBaseline } from '@mui/material';
import { useStore } from '../store/useStore';

interface ThemeRegistryProps {
  children: React.ReactNode;
}

export const ThemeRegistry: React.FC<ThemeRegistryProps> = ({ children }) => {
  const themeColors = useStore((state) => state.themeColors);

  const theme = useMemo(() => {
    const isDark = themeColors.dark;

    return createTheme({
      palette: {
        mode: isDark ? 'dark' : 'light',
        primary: {
          main: themeColors.primary || '#1976d2',
        },
        secondary: {
          main: themeColors.secondary || '#dc004e',
        },
        background: {
          default: isDark ? '#0f111a' : '#f5f7fb',
          paper: isDark ? '#161925' : '#ffffff',
        },
        text: {
          primary: isDark ? '#f1f5f9' : '#1e293b',
          secondary: isDark ? '#94a3b8' : '#64748b',
        },
      },
      shape: {
        borderRadius: 12,
      },
      typography: {
        fontFamily: "'Inter', 'Roboto', 'Helvetica', 'Arial', sans-serif",
        h1: { fontWeight: 700 },
        h2: { fontWeight: 700 },
        h3: { fontWeight: 600 },
        h4: { fontWeight: 600 },
        h5: { fontWeight: 600 },
        h6: { fontWeight: 500 },
        button: {
          textTransform: 'none',
          fontWeight: 600,
        },
      },
      components: {
        MuiButton: {
          styleOverrides: {
            root: {
              borderRadius: 8,
              padding: '8px 16px',
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                transform: 'translateY(-1px)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              },
            },
          },
        },
        MuiCard: {
          styleOverrides: {
            root: {
              borderRadius: 16,
              boxShadow: isDark 
                ? '0 4px 20px 0 rgba(0,0,0,0.4)' 
                : '0 4px 20px 0 rgba(100,116,139,0.08)',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'}`,
              backgroundImage: 'none',
            },
          },
        },
        MuiAppBar: {
          styleOverrides: {
            root: {
              backgroundImage: 'none',
              boxShadow: 'none',
              borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'}`,
            },
          },
        },
        MuiListItemButton: {
          styleOverrides: {
            root: {
              borderRadius: 8,
              margin: '2px 8px',
            },
          },
        },
      },
    });
  }, [themeColors]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
};

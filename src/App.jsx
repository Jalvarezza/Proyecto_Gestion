// src/App.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './features/auth/pages/LoginPage';
import { NotasPage } from './features/notas/pages/NotasPage.jsx';
import { DetalleNotaPage } from './features/notas/pages/DetalleNotaPage.jsx';
import { ProtectedRoute } from './shared/components/ProtectedRoute.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Rutas protegidas exclusivamente para usuarios autenticados */}
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Navigate to="/notas" replace />} />
        <Route path="/notas" element={<NotasPage />} />
        <Route path="/notas/:id_nv" element={<DetalleNotaPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
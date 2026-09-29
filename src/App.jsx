// src/App.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './features/auth/pages/LoginPage.jsx';
import { NotasPage } from './features/notas/pages/NotasPage.jsx';
import { DetalleNotaPage } from './features/notas/pages/DetalleNotaPage.jsx';
import { ProtectedRoute } from './shared/components/ProtectedRoute.jsx';
import { RoleRoute } from './shared/components/RoleRoute.jsx'; // <-- Cambiado de AdminRoute a RoleRoute

const AdminDashboard = () => (
  <div className="p-8 text-white bg-[#0f172a] min-h-screen">
    <h1 className="text-2xl font-bold text-sky-400">Panel de Administración WMS</h1>
    <p className="text-slate-400 mt-2">Gestión de usuarios, métricas e historial global.</p>
  </div>
);

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Rutas accesibles por cualquier usuario autenticado (Operador, Validador, etc.) */}
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Navigate to="/notas" replace />} />
        <Route path="/notas" element={<NotasPage />} />
        <Route path="/notas/:id_nv" element={<DetalleNotaPage />} />

        {/* Ejemplo: Ruta accesible para Admin y Supervisor */}
        <Route element={<RoleRoute allowedRoles={['admin', 'supervisor']} />}>
          <Route path="/admin" element={<AdminDashboard />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
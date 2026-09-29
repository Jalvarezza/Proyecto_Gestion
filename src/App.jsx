import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { NotasPage } from './features/notas/pages/NotasPage';
import { DetalleNotaPage } from './features/notas/pages/DetalleNotaPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/notas" replace />} />
      <Route path="/notas" element={<NotasPage />} />
      <Route path="/notas/:id_nv" element={<DetalleNotaPage />} />
    </Routes>
  );
}
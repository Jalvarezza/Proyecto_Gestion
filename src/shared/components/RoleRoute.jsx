// src/shared/components/RoleRoute.jsx
import React, { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '../../supabaseClient';

export function RoleRoute({ allowedRoles = [] }) {
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setUserRole(null);
        setLoading(false);
        return;
      }

      // Consulta la tabla profiles en Supabase
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('rol')
        .eq('id', user.id)
        .single();

      if (error || !profile) {
        console.error('Error al obtener perfil:', error);
        setUserRole(null);
      } else {
        setUserRole(profile.rol);
      }
      setLoading(false);
    };

    checkRole();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-slate-400">
        Verificando permisos...
      </div>
    );
  }

  // Si el usuario no tiene ninguno de los roles autorizados, lo redirige a /notas
  if (!userRole || !allowedRoles.includes(userRole)) {
    return <Navigate to="/notas" replace />;
  }

  return <Outlet />;
}
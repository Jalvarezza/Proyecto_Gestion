// src/features/notas/services/detalleNotaService.js
import { supabase } from '../../../supabaseClient';

export const detalleNotaApi = {
  // Carga la nota con su detalle de productos y ubicaciones
  async getNotaById(id_nv) {
    const { data, error } = await supabase
      .from('notas_venta')
      .select(`
        id_nv,
        numero_nv,
        cliente_nombre,
        rut_cliente,
        numero_oc,
        comentario_despacho,
        estado,
        fecha_carga,
        notas_venta_detalle (
          id_nv_detalle,
          id_producto,
          cant_solicitada,
          cant_picked,
          cant_validada,
          productos (
            sku,
            nombre,
            ubicacion
          )
        )
      `)
      .eq('id_nv', id_nv)
      .single();

    if (error) throw error;
    return data;
  },

  // Guarda el progreso de las cantidades picked / validadas
  async guardarAvancePicking(items) {
    const promesas = items.map((item) =>
      supabase
        .from('notas_venta_detalle')
        .update({
          cant_picked: item.cant_picked,
          cant_validada: item.cant_validada,
        })
        .eq('id_nv_detalle', item.id_nv_detalle)
    );

    const resultados = await Promise.all(promesas);
    const error = resultados.find((r) => r.error);
    if (error) throw error.error;
  },

  // Actualiza el estado de la Nota de Venta
  async cambiarEstadoNota(id_nv, nuevoEstado) {
    const { error } = await supabase
      .from('notas_venta')
      .update({ estado: nuevoEstado })
      .eq('id_nv', id_nv);

    if (error) throw error;
  }
};
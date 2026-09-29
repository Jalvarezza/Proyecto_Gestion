// src/features/validacion/services/validationService.js
import { supabase } from '../../../supabaseClient';

export async function procesarEscaneoValidacion(numeroNV, codigoBarrasEscaneado, idValidadorUUID) {
  try {
    // 1. Obtener los datos de la Nota de Venta
    const { data: nv, error: nvError } = await supabase
      .from('notas_venta')
      .select('id_nv, estado')
      .eq('numero_nv', numeroNV)
      .single();

    if (nvError || !nv) {
      return { success: false, message: `La Nota de Venta ${numeroNV} no existe.`, type: 'NO_ENCONTRADO' };
    }

    if (nv.estado !== 'LISTO_PARA_VALIDAR' && nv.estado !== 'EN_VALIDACION') {
      return { success: false, message: `La NV está en estado "${nv.estado}" y no se puede validar.`, type: 'INCORRECTO' };
    }

    // 2. Buscar el producto por código de barras
    const { data: producto, error: prodError } = await supabase
      .from('productos')
      .select('id_producto, sku, nombre')
      .eq('codigo_barras', codigoBarrasEscaneado)
      .single();

    if (prodError || !producto) {
      return { success: false, message: `Código [${codigoBarrasEscaneado}] no registrado.`, type: 'INCORRECTO' };
    }

    // 3. Verificar si el producto pertenece a la NV
    const { data: detalle, error: detError } = await supabase
      .from('notas_venta_detalle')
      .select('id_nv_detalle, cant_solicitada, cant_validada')
      .eq('id_nv', nv.id_nv)
      .eq('id_producto', producto.id_producto)
      .single();

    if (detError || !detalle) {
      await registrarLogEscaneo(nv.id_nv, idValidadorUUID, producto.id_producto, codigoBarrasEscaneado, 'INCORRECTO_SKU');
      return { success: false, message: `¡ALERTA! El producto "${producto.nombre}" NO pertenece a la NV.`, type: 'INCORRECTO', productName: producto.nombre };
    }

    if (detalle.cant_validada >= detalle.cant_solicitada) {
      await registrarLogEscaneo(nv.id_nv, idValidadorUUID, producto.id_producto, codigoBarrasEscaneado, 'SOBRANTE');
      return { success: false, message: `¡SOBRANTE! Ya se validaron todas las unidades de "${producto.nombre}".`, type: 'SOBRANTE', productName: producto.nombre };
    }

    // Incrementar cantidad validada
    const nuevaCantValidada = detalle.cant_validada + 1;
    await supabase
      .from('notas_venta_detalle')
      .update({ cant_validada: nuevaCantValidada })
      .eq('id_nv_detalle', detalle.id_nv_detalle);

    if (nv.estado === 'LISTO_PARA_VALIDAR') {
      await supabase
        .from('notas_venta')
        .update({ estado: 'EN_VALIDACION', id_validador: idValidadorUUID })
        .eq('id_nv', nv.id_nv);
    }

    await registrarLogEscaneo(nv.id_nv, idValidadorUUID, producto.id_producto, codigoBarrasEscaneado, 'CORRECTO');

    // Verificar si se completó la NV
    const nvCompleta = await verificarSiNVCompletada(nv.id_nv);
    if (nvCompleta) {
      await supabase
        .from('notas_venta')
        .update({ estado: 'VALIDADO_OK', fecha_fin_validacion: new Date().toISOString() })
        .eq('id_nv', nv.id_nv);

      return { success: true, message: `¡EXITO! NV COMPLETADA AL 100%`, type: 'OK', productName: producto.nombre };
    }

    return { success: true, message: `Validado: ${producto.nombre} (${nuevaCantValidada}/${detalle.cant_solicitada})`, type: 'OK', productName: producto.nombre };

  } catch (error) {
    console.error(error);
    return { success: false, message: 'Error interno en la lectura.', type: 'INCORRECTO' };
  }
}

async function registrarLogEscaneo(idNV, idValidador, idProducto, codigoEscaneado, resultado) {
  await supabase.from('log_escaneos_validacion').insert({
    id_nv: idNV, id_validador: idValidador, id_producto: idProducto, codigo_escaneado: codigoEscaneado, resultado
  });
}

async function verificarSiNVCompletada(idNV) {
  const { data: detalles } = await supabase.from('notas_venta_detalle').select('cant_solicitada, cant_validada').eq('id_nv', idNV);
  if (!detalles) return false;
  return detalles.every((item) => item.cant_validada >= item.cant_solicitada);
}
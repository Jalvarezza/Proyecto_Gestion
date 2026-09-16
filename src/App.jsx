import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function App() {
  const [rolActivo, setRolActivo] = useState('Admin')
  const [notasVenta, setNotasVenta] = useState([])
  const [productos, setProductos] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(false)

  // Cargar datos al iniciar
  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    setCargando(true)

    // 1. Obtener Notas de Venta con datos de Operador y Supervisor
    const { data: nvData } = await supabase
      .from('notas_venta')
      .select(`
        *,
        operador:usuarios!notas_venta_operador_id_fkey(nombre),
        supervisor:usuarios!notas_venta_supervisor_id_fkey(nombre),
        detalle_picking(*, producto:productos(nombre, codigo))
      `)
      .order('id', { ascending: false })

    // 2. Obtener Productos
    const { data: prodData } = await supabase
      .from('productos')
      .select('*')
      .order('codigo', { ascending: true })

    // 3. Obtener Usuarios
    const { data: userData } = await supabase
      .from('usuarios')
      .select('*')

    if (nvData) setNotasVenta(nvData)
    if (prodData) setProductos(prodData)
    if (userData) setUsuarios(userData)
    
    setCargando(false)
  }

  // --- ACCIONES DE CADA ROL ---

  // Operador: Actualizar progreso de picking
  async function actualizarPicking(detalleId, nuevaCantidad, cantidadSolicitada) {
    const nuevoEstado = nuevaCantidad >= cantidadSolicitada ? 'Pickeado' : 'Pendiente'

    await supabase
      .from('detalle_picking')
      .update({ cantidad_pickeada: nuevaCantidad, estado_item: nuevoEstado })
      .eq('id', detalleId)

    cargarDatos()
  }

  // Supervisor: Validar la Nota de Venta
  async function validarNV(nvId) {
    const supervisor = usuarios.find(u => u.rol === 'Supervisor')
    const supervisorId = supervisor ? supervisor.id : null

    await supabase
      .from('notas_venta')
      .update({ 
        estado: 'Validado', 
        supervisor_id: supervisorId 
      })
      .eq('id', nvId)

    cargarDatos()
  }

  // Admin / Supervisor: Despachar
  async function despacharNV(nvId) {
    await supabase
      .from('notas_venta')
      .update({ estado: 'Despachado' })
      .eq('id', nvId)

    cargarDatos()
  }

  return (
    <div style={styles.container}>
      {/* HEADER Y SELECTOR DE ROLES */}
      <header style={styles.header}>
        <div>
          <h2 style={{ margin: 0 }}>Sistema de Control Operacional - Bodega</h2>
          <p style={{ margin: '5px 0 0 0', color: '#666' }}>Prototipo de Tesis (React + Supabase)</p>
        </div>

        {/* Simulador de Sesión por Rol */}
        <div style={styles.roleSelectorCard}>
          <label style={{ fontWeight: 'bold', fontSize: '13px' }}>SIMULAR ROL ACTIVO:</label>
          <div style={{ display: 'flex', gap: '8px', marginTop: '5px' }}>
            {['Admin', 'Supervisor', 'Operador'].map((rol) => (
              <button
                key={rol}
                onClick={() => setRolActivo(rol)}
                style={{
                  ...styles.roleBtn,
                  backgroundColor: rolActivo === rol ? '#2563eb' : '#e2e8f0',
                  color: rolActivo === rol ? '#fff' : '#1e293b'
                }}
              >
                {rol}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* DASHBOARD SEGÚN ROL */}
      <main>
        {cargando ? (
          <p>Cargando datos desde Supabase...</p>
        ) : (
          <>
            {/* VISTA SEGÚN EL ROL SELECCIONADO */}
            {rolActivo === 'Admin' && (
              <VistaAdmin 
                notasVenta={notasVenta} 
                productos={productos} 
                despacharNV={despacharNV} 
              />
            )}

            {rolActivo === 'Supervisor' && (
              <VistaSupervisor 
                notasVenta={notasVenta} 
                validarNV={validarNV} 
                despacharNV={despacharNV} 
              />
            )}

            {rolActivo === 'Operador' && (
              <VistaOperador 
                notasVenta={notasVenta} 
                actualizarPicking={actualizarPicking} 
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}

// ------------------------------------------------------------------
// 1. VISTA ADMIN (Monitoreo General + Inventario)
// ------------------------------------------------------------------
function VistaAdmin({ notasVenta, productos, despacharNV }) {
  return (
    <div>
      <div style={styles.badgeAdmin}>Modo Vista: Administrador (Control Total)</div>

      <h3>📊 Monitoreo en Tiempo Real de Notas de Venta</h3>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>N° NV</th>
            <th style={styles.th}>Cliente / RUT</th>
            <th style={styles.th}>OC</th>
            <th style={styles.th}>Estado</th>
            <th style={styles.th}>Operador</th>
            <th style={styles.th}>Supervisor</th>
            <th style={styles.th}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {notasVenta.map((nv) => (
            <tr key={nv.id}>
              <td style={styles.td}><strong>{nv.numero_nv}</strong></td>
              <td style={styles.td}>{nv.cliente}<br/><small style={{color:'#666'}}>{nv.rut_cliente}</small></td>
              <td style={styles.td}>{nv.numero_oc || '-'}</td>
              <td style={styles.td}><BadgeEstado estado={nv.estado} /></td>
              <td style={styles.td}>{nv.operador?.nombre || 'Sin asignar'}</td>
              <td style={styles.td}>{nv.supervisor?.nombre || 'Pendiente'}</td>
              <td style={styles.td}>
                {nv.estado === 'Validado' && (
                  <button onClick={() => despacharNV(nv.id)} style={styles.btnDespachar}>
                    Despachar NV
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: '30px' }}>📦 Stock de Productos en Bodega</h3>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Código</th>
            <th style={styles.th}>Nombre Producto</th>
            <th style={styles.th}>Stock Disponible</th>
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => (
            <tr key={p.id}>
              <td style={styles.td}>{p.codigo}</td>
              <td style={styles.td}>{p.nombre}</td>
              <td style={styles.td}><strong>{p.stock} u.</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ------------------------------------------------------------------
// 2. VISTA SUPERVISOR (Validación y Auditoría)
// ------------------------------------------------------------------
function VistaSupervisor({ notasVenta, validarNV, despacharNV }) {
  return (
    <div>
      <div style={styles.badgeSupervisor}>Modo Vista: Supervisor (Validación y Calidad)</div>
      <h3>🔍 Auditoría de Picking para Validación</h3>

      {notasVenta.map((nv) => (
        <div key={nv.id} style={styles.cardNV}>
          <div style={styles.cardHeader}>
            <div>
              <strong>{nv.numero_nv}</strong> - {nv.cliente} (OC: {nv.numero_oc})
            </div>
            <BadgeEstado estado={nv.estado} />
          </div>

          <p style={{ fontSize: '13px', margin: '8px 0' }}>
            Operador asignado: <strong>{nv.operador?.nombre || 'N/A'}</strong>
          </p>

          <table style={styles.subTable}>
            <thead>
              <tr>
                <th style={styles.th}>Producto</th>
                <th style={styles.th}>Cant. Solicitada</th>
                <th style={styles.th}>Cant. Pickeada</th>
                <th style={styles.th}>Estado Ítem</th>
              </tr>
            </thead>
            <tbody>
              {nv.detalle_picking?.map((item) => (
                <tr key={item.id}>
                  <td style={styles.td}>{item.producto?.nombre} ({item.producto?.codigo})</td>
                  <td style={styles.td}>{item.cantidad_solicitada}</td>
                  <td style={styles.td}>{item.cantidad_pickeada}</td>
                  <td style={styles.td}>
                    <span style={{
                      color: item.cantidad_pickeada >= item.cantidad_solicitada ? 'green' : 'orange',
                      fontWeight: 'bold'
                    }}>
                      {item.estado_item}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
            {nv.estado === 'En Picking' && (
              <button onClick={() => validarNV(nv.id)} style={styles.btnValidar}>
                ✔ Validar Picking de la NV
              </button>
            )}
            {nv.estado === 'Validado' && (
              <button onClick={() => despacharNV(nv.id)} style={styles.btnDespachar}>
                🚀 Autorizar Despacho
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------
// 3. VISTA OPERADOR (Ejecución de Picking)
// ------------------------------------------------------------------
function VistaOperador({ notasVenta, actualizarPicking }) {
  // Filtrar NVs asignadas o en proceso de picking
  const nvsOperador = notasVenta.filter(nv => nv.estado === 'En Picking' || nv.estado === 'Pendiente')

  return (
    <div>
      <div style={styles.badgeOperador}>Modo Vista: Operador de Bodega (Picking)</div>
      <h3>📋 Tareas de Picking Asignadas</h3>

      {nvsOperador.length === 0 ? (
        <p>No tienes Notas de Venta pendientes por recolectar.</p>
      ) : (
        nvsOperador.map((nv) => (
          <div key={nv.id} style={styles.cardNV}>
            <div style={styles.cardHeader}>
              <strong>{nv.numero_nv} - {nv.cliente}</strong>
              <BadgeEstado estado={nv.estado} />
            </div>

            <p style={{ fontSize: '13px' }}>Selecciona la cantidad de ítems recolectados:</p>

            <table style={styles.subTable}>
              <thead>
                <tr>
                  <th style={styles.th}>Código</th>
                  <th style={styles.th}>Producto</th>
                  <th style={styles.th}>Solicitado</th>
                  <th style={styles.th}>Pickeado</th>
                  <th style={styles.th}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {nv.detalle_picking?.map((item) => (
                  <tr key={item.id}>
                    <td style={styles.td}>{item.producto?.codigo}</td>
                    <td style={styles.td}>{item.producto?.nombre}</td>
                    <td style={styles.td}><strong>{item.cantidad_solicitada}</strong></td>
                    <td style={styles.td}>{item.cantidad_pickeada}</td>
                    <td style={styles.td}>
                      <button 
                        onClick={() => actualizarPicking(item.id, item.cantidad_solicitada, item.cantidad_solicitada)}
                        style={styles.btnPickearCompleto}
                      >
                        Completar ({item.cantidad_solicitada})
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  )
}

// Componente para Badges de Estado
function BadgeEstado({ estado }) {
  const colores = {
    'Pendiente': '#6b7280',
    'En Picking': '#d97706',
    'Validado': '#2563eb',
    'Despachado': '#16a34a'
  }
  return (
    <span style={{
      backgroundColor: colores[estado] || '#666',
      color: '#fff',
      padding: '4px 10px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 'bold'
    }}>
      {estado}
    </span>
  )
}

// --- ESTILOS GENERALES ---
const styles = {
  container: { maxWidth: '1000px', margin: '20px auto', fontFamily: 'Arial, sans-serif', padding: '0 20px', color: '#1e293b' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '15px', marginBottom: '20px' },
  roleSelectorCard: { backgroundColor: '#f8fafc', padding: '10px 15px', borderRadius: '8px', border: '1px solid #cbd5e1' },
  roleBtn: { border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' },
  
  badgeAdmin: { backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '8px 12px', borderRadius: '6px', fontWeight: 'bold', marginBottom: '15px' },
  badgeSupervisor: { backgroundColor: '#fefce8', color: '#a16207', border: '1px solid #fef08a', padding: '8px 12px', borderRadius: '6px', fontWeight: 'bold', marginBottom: '15px' },
  badgeOperador: { backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: '8px 12px', borderRadius: '6px', fontWeight: 'bold', marginBottom: '15px' },

  table: { width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderRadius: '6px', overflow: 'hidden' },
  subTable: { width: '100%', borderCollapse: 'collapse', marginTop: '10px', backgroundColor: '#f8fafc' },
  th: { borderBottom: '2px solid #e2e8f0', padding: '10px', textAlign: 'left', backgroundColor: '#f1f5f9', fontSize: '13px' },
  td: { borderBottom: '1px solid #e2e8f0', padding: '10px', fontSize: '13px' },

  cardNV: { border: '1px solid #cbd5e1', borderRadius: '8px', padding: '15px', marginBottom: '15px', backgroundColor: '#fff' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' },

  btnValidar: { backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' },
  btnDespachar: { backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' },
  btnPickearCompleto: { backgroundColor: '#059669', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }
}
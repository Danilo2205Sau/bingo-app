// ============================================
// api.js — Cliente HTTP centralizado
// Todas las llamadas al backend van por aquí
// ============================================

const API_URL = (window.BINGO_API_URL || (
  window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3000/api'
    : 'https://bingo-app-production-9452.up.railway.app/api'
)).replace(/\/$/, '');

const Api = {

  // ── Sorteos / Eventos (público) ─────────────────────────────
  async getSorteoActivo() {
    const res = await fetch(`${API_URL}/sorteos/activo`);
    if (!res.ok) throw new Error('No hay sorteo activo');
    return res.json();
  },

  async getSorteosActivos() {
    const res = await fetch(`${API_URL}/sorteos/activos`);
    if (!res.ok) throw new Error('Error al cargar sorteos activos');
    return res.json();
  },

  async getNumerosDisponibles(modalidadId) {
    const res = await fetch(`${API_URL}/cartones/disponibles/${modalidadId}`);
    if (!res.ok) throw new Error('Error al cargar números disponibles');
    return res.json();
  },

  async reservarNumeros(modalidad_id, carton_ids) {
    const res = await fetch(`${API_URL}/cartones/reservar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modalidad_id, carton_ids }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al reservar números');
    return data;
  },

  // ── Ventas (comprador) ───────────────────────────────────────
  async crearVenta(formData) {
    const res = await fetch(`${API_URL}/ventas`, {
      method: 'POST',
      body: formData, // FormData con archivo incluido
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al procesar compra');
    return data;
  },

  async getVenta(id, codigoConsulta) {
    const res = await fetch(`${API_URL}/ventas/${id}`, {
      headers: { 'X-Consulta-Token': codigoConsulta },
    });
    if (!res.ok) throw new Error('Venta no encontrada');
    return res.json();
  },

  // ── Consulta pública ─────────────────────────────────────────
  async consultarBoleta(q) {
    const res = await fetch(`${API_URL}/consulta?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No encontrado');
    return data;
  },

  // ── Admin (requiere token JWT) ───────────────────────────────
  async loginAdmin(email, password) {
    const res = await fetch(`${API_URL}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Credenciales incorrectas');
    return data;
  },

  async getDashboard(token) {
    const res = await fetch(`${API_URL}/admin/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('No autorizado');
    return res.json();
  },

  async getVentasPendientes(token, offset = 0) {
    const res = await fetch(`${API_URL}/admin/ventas-pendientes?limit=50&offset=${offset}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No autorizado');
    return data;
  },

  async aprobarVenta(id, token) {
    const res = await fetch(`${API_URL}/admin/ventas/${id}/aprobar`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al aprobar');
    return data;
  },

  async rechazarVenta(id, notas, token) {
    const res = await fetch(`${API_URL}/admin/ventas/${id}/rechazar`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ notas }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al rechazar');
    return data;
  },

    async extraerBoletas(datos, token) {
    const res = await fetch(`${API_URL}/admin/extraer-boletas`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al extraer boletas');
    return data;
  },

  async getBoletasExtraidas(token) {
    const res = await fetch(`${API_URL}/admin/boletas-extraidas`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al cargar boletas extraídas');
    return data;
  },

  async getBoletasEvento(sorteoId, filtros, token) {
    const params = new URLSearchParams();
    if (filtros?.numero)   params.set('numero', filtros.numero);
    if (filtros?.telefono) params.set('telefono', filtros.telefono);
    const res = await fetch(`${API_URL}/admin/eventos/${sorteoId}/boletas?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al buscar boletas');
    return data;
  },

  // ── Gestión de eventos (admin) — CRUD completo ────────────────
  async getSorteos(token) {
    const res = await fetch(`${API_URL}/sorteos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al listar sorteos');
    return data;
  },

  async getSorteo(id, token) {
    const res = await fetch(`${API_URL}/sorteos/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al cargar el evento');
    return data;
  },

  // datos = { nombre, descripcion, fecha_sorteo, premio_descripcion, descripcion_premio,
  //           tipo_boleta, modalidad_nombre, precio_boleta, total_boletas,
  //           permite_elegir_numero, config, metodo_resultado, fuente_resultado }
  // imagenFile = File opcional (imagen de premiación)
  async crearEvento(datos, imagenFile, token) {
    const formData = new FormData();
    Object.entries(datos).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      formData.append(k, typeof v === 'object' ? JSON.stringify(v) : v);
    });
    if (imagenFile) formData.append('imagen_premio', imagenFile);

    const res = await fetch(`${API_URL}/sorteos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al crear el evento');
    return data;
  },

  async editarEvento(id, datos, imagenFile, token) {
    const formData = new FormData();
    Object.entries(datos).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      formData.append(k, v);
    });
    if (imagenFile) formData.append('imagen_premio', imagenFile);

    const res = await fetch(`${API_URL}/sorteos/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al editar el evento');
    return data;
  },

  async cambiarEstadoSorteo(id, estado, token) {
    return Api.editarEvento(id, { estado }, null, token);
  },

  async aumentarBoletas(modalidadId, nuevoTotal, token) {
    const res = await fetch(`${API_URL}/sorteos/modalidad/${modalidadId}/aumentar`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nuevo_total: nuevoTotal }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al aumentar boletas');
    return data;
  },

  // Borrado con doble confirmación: primera llamada sin confirmar,
  // si el backend responde 409 pidiendo confirmación, se repite con confirmar=true
  async eliminarEvento(id, confirmar, token) {
    const res = await fetch(`${API_URL}/sorteos/${id}${confirmar ? '?confirmar=true' : ''}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.status === 409 && data.requiereConfirmacion) {
      return { requiereConfirmacion: true, mensaje: data.mensaje };
    }
    if (!res.ok) throw new Error(data.error || 'Error al eliminar el evento');
    return data;
  },

  // ── Cartones (admin) ─────────────────────────────────────────
  async generarCartones(modalidad_id, cantidad, token) {
    const res = await fetch(`${API_URL}/cartones/generar`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ modalidad_id, cantidad }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al generar cartones');
    return data;
  },

  async subirCarton(formData, token) {
    const res = await fetch(`${API_URL}/cartones/subir`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData, // FormData con el PDF incluido
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al subir cartón');
    return data;
  },
};

// Helper formato moneda colombiana
function formatCOP(valor) {
  return '$' + Number(valor).toLocaleString('es-CO');
}

// Helper formato fecha
function formatFecha(iso) {
  return new Date(iso).toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

// ============================================
// api.js — Cliente HTTP centralizado
// Todas las llamadas al backend van por aquí
// ============================================

const API_URL = 'https://bingo-app-production-9452.up.railway.app/api'; // Cambiar en producción

const Api = {

  // ── Sorteos ──────────────────────────────────────────────────
  async getSorteoActivo() {
    const res = await fetch(`${API_URL}/sorteos/activo`);
    if (!res.ok) throw new Error('No hay sorteo activo');
    return res.json();
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

  async getVenta(id) {
    const res = await fetch(`${API_URL}/ventas/${id}`);
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

  async getVentasPendientes(token) {
    const res = await fetch(`${API_URL}/admin/ventas-pendientes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('No autorizado');
    return res.json();
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

  async crearSorteo(datos, token) {
    const res = await fetch(`${API_URL}/sorteos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(datos),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al crear sorteo');
    return data;
  },

  // ── Gestión de sorteos (admin) ───────────────────────────────
  async getSorteos(token) {
    const res = await fetch(`${API_URL}/sorteos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al listar sorteos');
    return data;
  },

  async cambiarEstadoSorteo(id, estado, token) {
    const res = await fetch(`${API_URL}/sorteos/${id}/estado`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ estado }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al cambiar estado');
    return data;
  },

  // ── Cartones (admin) ─────────────────────────────────────────
  async generarCartones(sorteo_id, cantidad, token) {
    const res = await fetch(`${API_URL}/cartones/generar`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sorteo_id, cantidad }),
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

(() => {
  "use strict";

  const config = window.TAZITA_SUPABASE_CONFIG || {};
  const supabaseUrl = (config.url || "").replace(/\/+$/, "");
  const ownerEmail = "Mauriciodanielriveracruz@gmail.com";
  const storageKey = "tazita-admin-session";
  const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const status = document.querySelector("#schedule-status");
  const grid = document.querySelector("#week-grid");
  const loginForm = document.querySelector("#admin-login");
  const adminSession = document.querySelector("#admin-session");
  const adminMessage = document.querySelector("#admin-message");
  let session = null;
  let schedule = [];

  function configurationReady() {
    return /^https:\/\/.+\.supabase\.co$/.test(supabaseUrl) && Boolean(config.anonKey);
  }

  function readSession() {
    try {
      const saved = sessionStorage.getItem(storageKey);
      session = saved ? JSON.parse(saved) : null;
    } catch (error) {
      console.error("No se pudo recuperar la sesión del administrador.", error);
      session = null;
      adminMessage.textContent = "No se pudo recuperar la sesión. Inicia sesión nuevamente.";
    }
  }

  function saveSession(value) {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
      session = value;
      return true;
    } catch (error) {
      console.error("No se pudo guardar la sesión del administrador.", error);
      adminMessage.textContent = "El navegador no pudo mantener la sesión. Revisa la configuración de privacidad.";
      return false;
    }
  }

  function authHeaders() {
    return {
      apikey: config.anonKey,
      Authorization: `Bearer ${session ? session.access_token : config.anonKey}`,
      "Content-Type": "application/json"
    };
  }

  async function readError(response) {
    const body = await response.json().catch(() => null);
    return body && (body.msg || body.message || body.error_description || body.error)
      ? body.msg || body.message || body.error_description || body.error
      : `Error ${response.status}`;
  }

  async function loadSchedule() {
    status.textContent = "Cargando disponibilidad…";
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/weekly_availability?select=weekday,is_open&order=weekday.asc`, {
        headers: authHeaders()
      });
      if (!response.ok) throw new Error(await readError(response));
      schedule = await response.json();
      if (!Array.isArray(schedule) || schedule.length !== 7) {
        throw new Error("El calendario no contiene los siete días. Revisa la configuración de Supabase.");
      }
      renderSchedule();
      status.textContent = "Disponibilidad semanal actualizada.";
    } catch (error) {
      console.error("No se pudo cargar el calendario.", error);
      status.textContent = "No fue posible cargar la disponibilidad. Intenta recargar la página.";
    }
  }

  function renderSchedule() {
    const canEdit = Boolean(session && session.user && session.user.email.toLowerCase() === ownerEmail.toLowerCase());
    loginForm.hidden = canEdit;
    adminSession.hidden = !canEdit;
    grid.innerHTML = schedule.map((day) => {
      const available = Boolean(day.is_open);
      const label = dayNames[day.weekday];
      return `
        <article class="week-day ${available ? "week-day-open" : "week-day-closed"}">
          <div class="week-day-heading">
            <span class="week-day-name">${label}</span>
            <span class="day-status"><span aria-hidden="true">${available ? "●" : "●"}</span> ${available ? "Disponible" : "No disponible"}</span>
          </div>
          <p class="day-hours">${available ? "10:00 a. m. – 5:30 p. m." : "No hay atención este día"}</p>
          ${canEdit ? `<button class="availability-toggle" type="button" data-weekday="${day.weekday}" aria-pressed="${available}">${available ? "Marcar no disponible" : "Marcar disponible"}</button>` : ""}
        </article>`;
    }).join("");
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    adminMessage.textContent = "";
    if (!configurationReady()) {
      adminMessage.textContent = "Falta conectar Supabase. Configura la URL y la clave pública en supabase-config.js.";
      return;
    }
    const submitButton = loginForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Ingresando…";
    try {
      const fields = new FormData(loginForm);
      const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: config.anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(fields.get("email")).trim(),
          password: String(fields.get("password"))
        })
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = await response.json();
      if (!result.user || result.user.email.toLowerCase() !== ownerEmail.toLowerCase()) {
        await fetch(`${supabaseUrl}/auth/v1/logout`, {
          method: "POST",
          headers: { apikey: config.anonKey, Authorization: `Bearer ${result.access_token}` }
        });
        throw new Error("Esta cuenta no está autorizada para administrar el calendario.");
      }
      if (!saveSession(result)) return;
      loginForm.reset();
      await loadSchedule();
      adminMessage.textContent = "Sesión iniciada. Ya puedes cambiar la disponibilidad de cada día.";
    } catch (error) {
      console.error("No se pudo iniciar sesión en el calendario.", error);
      adminMessage.textContent = `No se pudo iniciar sesión: ${error.message}`;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Iniciar sesión";
    }
  });

  document.querySelector("#admin-logout").addEventListener("click", async () => {
    const token = session && session.access_token;
    sessionStorage.removeItem(storageKey);
    session = null;
    adminMessage.textContent = "Sesión cerrada.";
    renderSchedule();
    if (!token || !configurationReady()) return;
    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error(await readError(response));
    } catch (error) {
      console.error("No se pudo invalidar la sesión remota.", error);
      adminMessage.textContent = "Se cerró la sesión en este navegador, pero no se pudo invalidar en el servidor.";
    }
  });

  grid.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-weekday]");
    if (!button || !session) return;
    const weekday = Number(button.dataset.weekday);
    const day = schedule.find((entry) => entry.weekday === weekday);
    if (!day) return;
    button.disabled = true;
    adminMessage.textContent = "Guardando cambio…";
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/weekly_availability?weekday=eq.${weekday}`, {
        method: "PATCH",
        headers: { ...authHeaders(), Prefer: "return=representation" },
        body: JSON.stringify({ is_open: !day.is_open })
      });
      if (!response.ok) throw new Error(await readError(response));
      const updated = await response.json();
      if (!Array.isArray(updated) || updated.length !== 1) {
        throw new Error("El servidor no confirmó el cambio. Revisa las políticas de acceso de Supabase.");
      }
      schedule = schedule.map((entry) => entry.weekday === weekday ? updated[0] : entry);
      renderSchedule();
      adminMessage.textContent = `${dayNames[weekday]} actualizado.`;
    } catch (error) {
      console.error("No se pudo guardar la disponibilidad.", error);
      adminMessage.textContent = `No se pudo guardar el cambio: ${error.message}`;
    }
  });

  if (!configurationReady()) {
    status.textContent = "Calendario aún no conectado.";
    grid.innerHTML = dayNames.map((name) => `
      <article class="week-day week-day-pending">
        <div class="week-day-heading"><span class="week-day-name">${name}</span><span class="day-status">Pendiente de configurar</span></div>
        <p class="day-hours">Disponibilidad por publicar</p>
      </article>`).join("");
    adminMessage.textContent = "Configura el proyecto Supabase siguiendo las instrucciones de README.md.";
  } else {
    readSession();
    loadSchedule();
  }
})();

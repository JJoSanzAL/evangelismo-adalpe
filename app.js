/* =========================================================
   1. CONFIGURACIÓN Y ESTADO GLOBAL
   ========================================================= */
const URL_SCRIPT_FIJA = "https://script.google.com/macros/s/AKfycbwgMN-HFvPqNfGb-4LYzfekQkoivYaPKugJd80kLdf6AvpBss873mNP7EJNk26lAq2QVA/exec";
const OBRAS = ["Los Olivos", "Nuevo Amanecer", "Los Heraldos", "SJL", "Belaunde"];
const PERIODOS_CUOTAS = [
  "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
  "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
  "2027-01", "2027-02"
];

let DB = { matriculados: [], asistencia: [], evangelismo: [], cuotas: [] };
let formState = {};
let visitasCache = {};
let chartAsis = null, chartDona = null, chartEvang = null;
let chartVarTratados = null, chartVarEvang = null, chartVarHermanos = null;
let activeLoginTimeout = null;
let memoriaPin = "";
let pickerViernes = null;
let panelAbiertoActual = null;
window.resumenCopiar = "";

function getUrlActiva() {
  return URL_SCRIPT_FIJA;
}

/* =========================================================
   2. ALMACENAMIENTO LOCAL Y UTILIDADES DE FECHA LOCAL
   ========================================================= */
function guardarStorageSeguro(clave, valor) {
  try { localStorage.setItem(clave, valor); } catch (e) {}
  try { sessionStorage.setItem(clave, valor); } catch (e) {}
}

function leerStorageSeguro(clave) {
  try {
    const v1 = localStorage.getItem(clave);
    if (v1 !== null && v1 !== "") return v1;
  } catch (e) {}
  try {
    const v2 = sessionStorage.getItem(clave);
    if (v2 !== null && v2 !== "") return v2;
  } catch (e) {}
  return "";
}

function normalizarDB(data) {
  return {
    matriculados: Array.isArray(data?.matriculados) ? data.matriculados : [],
    asistencia: Array.isArray(data?.asistencia) ? data.asistencia : [],
    evangelismo: Array.isArray(data?.evangelismo) ? data.evangelismo : [],
    cuotas: Array.isArray(data?.cuotas) ? data.cuotas : []
  };
}

function cargarCacheVisitas() {
  try {
    const raw = leerStorageSeguro("adalpe_visitas_cache");
    visitasCache = raw ? JSON.parse(raw) : {};
  } catch (e) {
    visitasCache = {};
  }
}

function guardarCacheVisitas() {
  try {
    guardarStorageSeguro("adalpe_visitas_cache", JSON.stringify(visitasCache));
  } catch (e) {}
}

function fechaLocalIso(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function claveFecha(val) {
  if (!val) return "";
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/");
    return `${y}-${m}-${d}`;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [d, m, y] = s.split("-");
    return `${y}-${m}-${d}`;
  }
  const dObj = new Date(s);
  if (!isNaN(dObj.getTime())) {
    return fechaLocalIso(dObj);
  }
  return s.substring(0, 10);
}

function fechaDMA(val) {
  const iso = claveFecha(val);
  const p = iso.split("-");
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : String(val || "");
}

function mesClave(val, fechaVal) {
  if (val) {
    const s = String(val).trim();
    if (/^\d{4}-\d{2}/.test(s)) return s.substring(0, 7);
  }
  const f = claveFecha(fechaVal);
  if (/^\d{4}-\d{2}-\d{2}$/.test(f)) return f.substring(0, 7);
  if (val) {
    const dObj = new Date(String(val).trim());
    if (!isNaN(dObj.getTime())) {
      return `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, "0")}`;
    }
  }
  return "";
}

function normalizarEstado(val) {
  return String(val || "").trim();
}

function normalizarObraTexto(val) {
  const s = String(val || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (s === "lo" || s === "l o" || s.includes("los olivos") || s.includes("central")) return "Los Olivos";
  if (s === "lh" || s === "l h" || s.includes("heraldos")) return "Los Heraldos";
  if (s.includes("belaunde")) return "Belaunde";
  if (s === "na" || s === "n a" || s.includes("nuevo amanecer") || s.includes("amanecer")) return "Nuevo Amanecer";
  if (s === "sjl" || s === "s j l" || s.includes("san juan")) return "SJL";
  return String(val || "").trim();
}

function obtenerViernesMasReciente(fechaBase) {
  const d = new Date(fechaBase.getFullYear(), fechaBase.getMonth(), fechaBase.getDate());
  const diff = (d.getDay() + 2) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function inicializarSelectorSoloViernes() {
  const ahora = new Date();
  const viernesInicial = obtenerViernesMasReciente(ahora);
  const inputEl = document.getElementById("reg-fecha");
  if (!inputEl) return;

  if (typeof flatpickr === "function") {
    pickerViernes = flatpickr(inputEl, {
      locale: (window.flatpickr && flatpickr.l10ns && flatpickr.l10ns.es) ? flatpickr.l10ns.es : "default",
      dateFormat: "Y-m-d",
      altInput: true,
      altFormat: "d/m/Y",
      altInputClass: "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold bg-white cursor-pointer",
      defaultDate: viernesInicial,
      disableMobile: true,
      enable: [
        function(date) {
          return date.getDay() === 5;
        }
      ],
      onChange: function() {
        cargarFormularioFecha();
      }
    });
  } else {
    inputEl.value = fechaLocalIso(viernesInicial);
  }
}

/* =========================================================
   3. INICIO, AUTENTICACIÓN Y CONEXIÓN GOOGLE SHEETS
   ========================================================= */
window.onload = () => {
  cargarCacheVisitas();
  inicializarSelectorSoloViernes();
  guardarStorageSeguro("adalpe_url", URL_SCRIPT_FIJA);
  const pinGuardado = leerStorageSeguro("adalpe_pin");
  const inp = document.getElementById("input-pin");
  if (inp) {
    if (pinGuardado) inp.value = pinGuardado;
    inp.focus();
  }
};

function resetBotonLogin() {
  const btn = document.getElementById("btn-ingresar");
  if (btn) {
    btn.disabled = false;
    btn.textContent = "Ingresar";
  }
}

function conectarSistema() {
  const inp = document.getElementById("input-pin");
  const errEl = document.getElementById("login-error");
  const pin = inp.value.trim();

  if (!pin) {
    errEl.textContent = "Escribe la clave de acceso para ingresar.";
    errEl.classList.remove("hidden");
    inp.focus();
    return;
  }

  memoriaPin = pin;
  errEl.classList.add("hidden");
  guardarStorageSeguro("adalpe_url", URL_SCRIPT_FIJA);
  guardarStorageSeguro("adalpe_pin", pin);

  const btn = document.getElementById("btn-ingresar");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Conectando...";
  }

  cargarDatos(pin);
}

function extraerJsonDeRespuesta(rawText) {
  const txt = String(rawText || "").trim();
  if (!txt) return null;
  if (txt.startsWith("{")) return JSON.parse(txt);
  const match = txt.match(/^[a-zA-Z0-9_.$]+\s*\(([\s\S]*)\)\s*;?\s*$/);
  if (match && match[1]) {
    return JSON.parse(match[1]);
  }
  return null;
}

function procesarDatosRecibidos(data, errEl) {
  if (!data || data.status !== "ok") {
    errEl.textContent = (data && data.message) || "Clave incorrecta o acceso denegado.";
    errEl.classList.remove("hidden");
    document.getElementById("login-screen").classList.remove("hidden");
    return;
  }

  DB = normalizarDB(data);
  document.getElementById("login-screen").classList.add("hidden");
  try {
    inicializarFiltros();
    renderDashboard();
    poblarSelectorResumenSemanal();
    renderResumenSemanal();
    renderWidgetClases();
    cargarFormularioFecha();
    renderCuotas();
    renderMatriculados();
  } catch (err) {
    console.error("Error al renderizar:", err);
  }
}

function cargarDatos(pinOverride) {
  const url = getUrlActiva();
  const pin = (
    pinOverride !== undefined
      ? pinOverride
      : (memoriaPin || leerStorageSeguro("adalpe_pin") || document.getElementById("input-pin").value.trim())
  );
  const errEl = document.getElementById("login-error");
  const loginVisible = !document.getElementById("login-screen").classList.contains("hidden");

  if (loginVisible) {
    errEl.classList.add("hidden");
  }

  if (activeLoginTimeout) {
    clearTimeout(activeLoginTimeout);
    activeLoginTimeout = null;
  }

  const sep = url.includes("?") ? "&" : "?";
  const baseQuery = `${url}${sep}action=getAll&pin=${encodeURIComponent(pin)}&_=${Date.now()}`;
  let finalizado = false;

  const limpiar = () => {
    if (activeLoginTimeout) {
      clearTimeout(activeLoginTimeout);
      activeLoginTimeout = null;
    }
    resetBotonLogin();
  };

  const ejecutarJsonp = () => {
    if (finalizado) return;
    const cbName = "adalpeCallback_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
    const script = document.createElement("script");

    const limpiarScript = () => {
      try { delete window[cbName]; } catch (e) {}
      if (script.parentNode) script.remove();
    };

    activeLoginTimeout = setTimeout(() => {
      if (finalizado) return;
      finalizado = true;
      limpiarScript();
      limpiar();
      if (!document.getElementById("login-screen").classList.contains("hidden")) {
        errEl.textContent = "Tiempo de espera agotado. Si estás en el navegador interno de una app, ábrelo en Safari.";
        errEl.classList.remove("hidden");
      }
    }, 12000);

    window[cbName] = (data) => {
      if (finalizado) return;
      finalizado = true;
      limpiarScript();
      limpiar();
      procesarDatosRecibidos(data, errEl);
    };

    script.onerror = () => {
      if (finalizado) return;
      finalizado = true;
      limpiarScript();
      limpiar();
      if (!document.getElementById("login-screen").classList.contains("hidden")) {
        errEl.textContent = "El navegador bloqueó la conexión. Ábrelo directamente en Safari y verifica que el script esté público.";
        errEl.classList.remove("hidden");
      }
    };

    script.src = `${baseQuery}&callback=${cbName}`;
    document.body.appendChild(script);
  };

  if (window.fetch) {
    fetch(baseQuery, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer"
    })
      .then(res => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(txt => {
        if (finalizado) return;
        const parsed = extraerJsonDeRespuesta(txt);
        if (parsed) {
          finalizado = true;
          limpiar();
          procesarDatosRecibidos(parsed, errEl);
        } else {
          ejecutarJsonp();
        }
      })
      .catch(() => {
        ejecutarJsonp();
      });
  } else {
    ejecutarJsonp();
  }
}

function enviarAccion(payload) {
  return new Promise((resolve) => {
    const url = getUrlActiva();
    const pin = memoriaPin || leerStorageSeguro("adalpe_pin") || document.getElementById("input-pin").value.trim();
    const sep = url.includes("?") ? "&" : "?";
    const encoded = encodeURIComponent(JSON.stringify({ ...payload, pin }));
    const baseUrl = `${url}${sep}action=${encodeURIComponent(payload.action)}&pin=${encodeURIComponent(pin)}&fecha=${encodeURIComponent(payload.fecha || "")}&payload=${encoded}&_=${Date.now()}`;

    let resuelto = false;
    const finalizar = (respObj) => {
      if (resuelto) return;
      resuelto = true;
      setTimeout(() => cargarDatos(pin), 900);
      resolve(respObj || { status: "ok" });
    };

    const intentarJsonpAccion = () => {
      const cbName = "adalpeSaveCb_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
      const script = document.createElement("script");
      const cleanup = () => {
        try { delete window[cbName]; } catch (e) {}
        if (script.parentNode) script.remove();
      };
      const timer = setTimeout(() => {
        cleanup();
        finalizar({ status: "ok" });
      }, 5000);
      window[cbName] = (resp) => {
        clearTimeout(timer);
        cleanup();
        if (resp && resp.status === "error") {
          alert("Aviso al guardar: " + resp.message);
        }
        finalizar(resp || { status: "ok" });
      };
      script.onerror = () => {
        clearTimeout(timer);
        cleanup();
        finalizar({ status: "ok" });
      };
      script.src = `${baseUrl}&callback=${cbName}`;
      document.body.appendChild(script);
    };

    if (window.fetch) {
      fetch(baseUrl, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer"
      })
        .then(res => res.text())
        .then(txt => {
          const parsed = extraerJsonDeRespuesta(txt);
          if (parsed) {
            if (parsed.status === "error") {
              alert("Aviso al guardar: " + parsed.message);
            }
            finalizar(parsed);
          } else {
            intentarJsonpAccion();
          }
        })
        .catch(() => {
          intentarJsonpAccion();
        });
    } else {
      intentarJsonpAccion();
    }
  });
}

/* =========================================================
   4. NAVEGACIÓN, PRESENTACIÓN Y VENTANAS FLOTANTES
   ========================================================= */
function cambiarTab(tab) {
  ["dashboard", "asistencia", "cuotas", "matriculados"].forEach(t => {
    document.getElementById(`view-${t}`).classList.add("hidden");
    document.getElementById(`tab-${t}`).classList.remove("tab-active");
  });
  document.getElementById(`view-${tab}`).classList.remove("hidden");
  document.getElementById(`tab-${tab}`).classList.add("tab-active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function togglePresentacion() {
  const activar = !document.body.classList.contains("presentation-mode");
  document.body.classList.toggle("presentation-mode", activar);

  const headerEl = document.getElementById("main-header");
  const navEl = document.getElementById("main-nav");
  const dockEl = document.getElementById("floating-dock");
  const exitBtn = document.getElementById("btn-exit-pres");

  if (activar) {
    cerrarPanelFlotante("resumen");
    cerrarPanelFlotante("curso");
    if (headerEl) headerEl.style.display = "none";
    if (navEl) navEl.style.display = "none";
    if (dockEl) dockEl.style.display = "none";
    if (exitBtn) exitBtn.style.display = "inline-flex";
  } else {
    if (headerEl) headerEl.style.display = "";
    if (navEl) navEl.style.display = "";
    if (dockEl) dockEl.style.display = "flex";
    if (exitBtn) exitBtn.style.display = "none";
  }
}

function abrirPanelFlotante(nombre) {
  const panelResumen = document.getElementById("panel-resumen");
  const panelCurso = document.getElementById("panel-curso");
  panelResumen.classList.add("hidden");
  panelCurso.classList.add("hidden");

  if (nombre === "resumen") {
    panelResumen.classList.remove("hidden");
    panelAbiertoActual = "resumen";
  } else if (nombre === "curso") {
    panelCurso.classList.remove("hidden");
    panelAbiertoActual = "curso";
  }
}

function cerrarPanelFlotante(nombre) {
  if (nombre === "resumen") {
    document.getElementById("panel-resumen").classList.add("hidden");
    if (panelAbiertoActual === "resumen") panelAbiertoActual = null;
  } else if (nombre === "curso") {
    document.getElementById("panel-curso").classList.add("hidden");
    if (panelAbiertoActual === "curso") panelAbiertoActual = null;
  }
}

function togglePanelFlotante(nombre) {
  if (panelAbiertoActual === nombre) {
    cerrarPanelFlotante(nombre);
  } else {
    abrirPanelFlotante(nombre);
  }
}

/* =========================================================
   5. DASHBOARD Y GRÁFICOS
   ========================================================= */
function inicializarFiltros() {
  const meses = [...new Set(DB.asistencia.map(a => mesClave(a.Anio_Mes, a.Fecha)).filter(m => /^\d{4}-\d{2}$/.test(m)))].sort();
  const selMes = document.getElementById("filtro-mes");
  selMes.innerHTML = `<option value="TODOS">Todo el Año 2026</option>` +
    meses.map(m => `<option value="${m}">${m}</option>`).join("");
  if (meses.length > 0) selMes.value = meses[meses.length - 1];
  actualizarFiltroFechas();
}

function actualizarFiltroFechas() {
  const mes = document.getElementById("filtro-mes").value;
  const fechas = [...new Set(DB.asistencia
    .filter(a => mes === "TODOS" || mesClave(a.Anio_Mes, a.Fecha) === mes)
    .map(a => claveFecha(a.Fecha))
    .filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f)))].sort();
  const selFecha = document.getElementById("filtro-fecha");
  selFecha.innerHTML = `<option value="TODAS">Todas las semanas del periodo</option>` +
    fechas.map(f => `<option value="${f}">Viernes ${fechaDMA(f)}</option>`).join("");
}

function obtenerVisitasPorObraYFecha(fechaIso, obraNombre) {
  const obrasTarget = (!obraNombre || obraNombre === "TODAS") ? OBRAS : [obraNombre];
  let total = 0;

  obrasTarget.forEach(o => {
    const evRow = DB.evangelismo.find(r =>
      claveFecha(r.Fecha) === fechaIso &&
      normalizarObraTexto(r.Obra) === o
    );
    const tieneValorSheet = evRow && evRow.Visitas !== undefined && evRow.Visitas !== null && String(evRow.Visitas).trim() !== "";
    const cacheKey = `${fechaIso}__${o}`;

    if (tieneValorSheet) {
      const vSheet = Number(evRow.Visitas) || 0;
      visitasCache[cacheKey] = vSheet;
      total += vSheet;
    } else if (visitasCache[cacheKey] !== undefined) {
      total += (Number(visitasCache[cacheKey]) || 0);
    }

    const asisVisitas = DB.asistencia.filter(r =>
      claveFecha(r.Fecha) === fechaIso &&
      normalizarObraTexto(r.Obra) === o &&
      Number(r.Codigo) === 3
    ).length;
    total += asisVisitas;
  });

  return total;
}

function crearGraficoLineaReal(canvasId, instanceRef, labelText, dataArr, colorHex, labelsArr) {
  if (instanceRef) instanceRef.destroy();
  return new Chart(document.getElementById(canvasId), {
    type: "line",
    data: {
      labels: labelsArr || [],
      datasets: [{
        label: labelText,
        data: dataArr,
        borderColor: colorHex,
        backgroundColor: colorHex,
        tension: 0.25,
        borderWidth: 2,
        pointRadius: 3.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const idx = ctx.dataIndex;
              const val = ctx.parsed.y;
              if (idx === 0) return `${labelText}: ${val}`;
              const prev = dataArr[idx - 1];
              const diff = val - prev;
              if (diff > 0) return `${labelText}: ${val} (▲ Subió +${diff})`;
              if (diff < 0) return `${labelText}: ${val} (▼ Bajó ${Math.abs(diff)})`;
              return `${labelText}: ${val} (Sin cambio)`;
            }
          }
        }
      }
    }
  });
}

function actualizarTextoLineaEstado(elId, arr, unidad) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!arr || arr.length === 0) {
    el.textContent = "Sin datos";
    return;
  }
  if (arr.length === 1) {
    el.textContent = `Actual: ${arr[0]} ${unidad}`;
    return;
  }
  const diff = arr[arr.length - 1] - arr[arr.length - 2];
  if (diff > 0) {
    el.textContent = `▲ Subió +${diff} vs. anterior (Actual: ${arr[arr.length - 1]})`;
    el.className = "text-[11px] font-bold text-emerald-700 mb-2";
  } else if (diff < 0) {
    el.textContent = `▼ Bajó ${Math.abs(diff)} vs. anterior (Actual: ${arr[arr.length - 1]})`;
    el.className = "text-[11px] font-bold text-amber-700 mb-2";
  } else {
    el.textContent = `Sin cambio vs. anterior (Actual: ${arr[arr.length - 1]})`;
    el.className = "text-[11px] font-semibold text-slate-600 mb-2";
  }
}

function renderDashboard() {
  const mes = document.getElementById("filtro-mes").value;
  const fecha = document.getElementById("filtro-fecha").value;
  const obra = document.getElementById("filtro-obra").value;

  const estadosPorId = {};
  DB.matriculados.forEach(m => {
    estadosPorId[String(m.ID).trim()] = normalizarEstado(m.Estado);
  });

  const asisFiltrada = DB.asistencia.filter(r => {
    const m = mesClave(r.Anio_Mes, r.Fecha);
    const f = claveFecha(r.Fecha);
    if (mes !== "TODOS" && m !== mes) return false;
    if (fecha !== "TODAS" && f !== fecha) return false;
    if (obra !== "TODAS" && normalizarObraTexto(r.Obra) !== obra) return false;
    return true;
  });

  const evangFiltrada = DB.evangelismo.filter(r => {
    const m = mesClave(r.Anio_Mes, r.Fecha);
    const f = claveFecha(r.Fecha);
    if (mes !== "TODOS" && m !== mes) return false;
    if (fecha !== "TODAS" && f !== fecha) return false;
    if (obra !== "TODAS" && normalizarObraTexto(r.Obra) !== obra) return false;
    return true;
  });

  const asisActivos = asisFiltrada.filter(r => estadosPorId[String(r.ID_Hermano || "").trim()] !== "Inactivo");

  const pres = asisActivos.filter(r => Number(r.Codigo) === 1).length;
  const just = asisActivos.filter(r => Number(r.Codigo) === 2).length;
  const inj = asisActivos.filter(r => Number(r.Codigo) === 0).length;

  const fechasConsideradas = [...new Set([
    ...asisFiltrada.map(r => claveFecha(r.Fecha)),
    ...evangFiltrada.map(r => claveFecha(r.Fecha))
  ].filter(Boolean))];

  const vis = fechasConsideradas.reduce((acc, fIso) => acc + obtenerVisitasPorObraYFecha(fIso, obra), 0);

  const totalReg = pres + just + inj;
  const pct = totalReg > 0 ? Math.round((pres / totalReg) * 100) : 0;

  const totEvang = evangFiltrada.reduce((acc, r) => acc + (Number(r.Evangelizados) || 0), 0);
  const totTrat = evangFiltrada.reduce((acc, r) => acc + (Number(r.Tratados_Entregados) || 0), 0);
  const activos = DB.matriculados.filter(m => normalizarEstado(m.Estado) === "Activo" && (obra === "TODAS" || normalizarObraTexto(m.Obra) === obra)).length;

  document.getElementById("kpi-presentes").textContent = pres;
  document.getElementById("kpi-pct-asistencia").textContent = `${pct}%`;
  document.getElementById("kpi-evangelizados").textContent = totEvang;
  document.getElementById("kpi-tratados").textContent = totTrat;
  document.getElementById("kpi-just").textContent = just;
  document.getElementById("kpi-injust").textContent = inj;
  document.getElementById("kpi-visitas").textContent = vis;
  document.getElementById("kpi-activos").textContent = activos;

  const groupKey = mes === "TODOS" ? "MES" : "FECHA";
  const unidadRef = groupKey === "MES" ? "mes anterior" : "semana anterior";

  const claves = [...new Set([
    ...DB.asistencia
      .filter(r => (mes === "TODOS" || mesClave(r.Anio_Mes, r.Fecha) === mes) && (obra === "TODAS" || normalizarObraTexto(r.Obra) === obra))
      .map(r => groupKey === "MES" ? mesClave(r.Anio_Mes, r.Fecha) : claveFecha(r.Fecha)),
    ...DB.evangelismo
      .filter(r => (mes === "TODOS" || mesClave(r.Anio_Mes, r.Fecha) === mes) && (obra === "TODAS" || normalizarObraTexto(r.Obra) === obra))
      .map(r => groupKey === "MES" ? mesClave(r.Anio_Mes, r.Fecha) : claveFecha(r.Fecha))
  ].filter(Boolean))].sort();

  const labels = claves.map(c => groupKey === "FECHA" ? fechaDMA(c) : c);
  const coincideClave = (r, c) => (groupKey === "MES" ? mesClave(r.Anio_Mes, r.Fecha) : claveFecha(r.Fecha)) === c;

  const seriePres = claves.map(c => DB.asistencia.filter(r =>
    coincideClave(r, c) &&
    (obra === "TODAS" || normalizarObraTexto(r.Obra) === obra) &&
    estadosPorId[String(r.ID_Hermano || "").trim()] !== "Inactivo" &&
    Number(r.Codigo) === 1
  ).length);

  const serieJust = claves.map(c => DB.asistencia.filter(r =>
    coincideClave(r, c) &&
    (obra === "TODAS" || normalizarObraTexto(r.Obra) === obra) &&
    estadosPorId[String(r.ID_Hermano || "").trim()] !== "Inactivo" &&
    Number(r.Codigo) === 2
  ).length);

  const serieInj = claves.map(c => DB.asistencia.filter(r =>
    coincideClave(r, c) &&
    (obra === "TODAS" || normalizarObraTexto(r.Obra) === obra) &&
    estadosPorId[String(r.ID_Hermano || "").trim()] !== "Inactivo" &&
    Number(r.Codigo) === 0
  ).length);

  const serieEv = claves.map(c => DB.evangelismo
    .filter(r => coincideClave(r, c) && (obra === "TODAS" || normalizarObraTexto(r.Obra) === obra))
    .reduce((a, b) => a + (Number(b.Evangelizados) || 0), 0));

  const serieTr = claves.map(c => DB.evangelismo
    .filter(r => coincideClave(r, c) && (obra === "TODAS" || normalizarObraTexto(r.Obra) === obra))
    .reduce((a, b) => a + (Number(b.Tratados_Entregados) || 0), 0));

  const fmtDelta = (arr, unidad) => {
    if (arr.length < 2) return `vs. ${unidadRef}: —`;
    const diff = arr[arr.length - 1] - arr[arr.length - 2];
    return diff >= 0
      ? `▲ Subió +${diff} ${unidad} vs. ${unidadRef}`
      : `▼ Bajó ${Math.abs(diff)} ${unidad} vs. ${unidadRef}`;
  };
  document.getElementById("kpi-var-asistencia").textContent = fmtDelta(seriePres, "presentes");
  document.getElementById("kpi-var-evang").textContent = fmtDelta(serieEv, "evangelizados");
  document.getElementById("kpi-var-tratados").textContent = fmtDelta(serieTr, "tratados");

  actualizarTextoLineaEstado("linea-estado-tratados", serieTr, "tratados");
  actualizarTextoLineaEstado("linea-estado-evang", serieEv, "evangelizados");
  actualizarTextoLineaEstado("linea-estado-hermanos", seriePres, "presentes");

  chartVarTratados = crearGraficoLineaReal("chart-var-tratados", chartVarTratados, "Tratados", serieTr, "#f97316", labels);
  chartVarEvang = crearGraficoLineaReal("chart-var-evang", chartVarEvang, "Evangelizados", serieEv, "#2563eb", labels);
  chartVarHermanos = crearGraficoLineaReal("chart-var-hermanos", chartVarHermanos, "Hermanos Presentes", seriePres, "#16a34a", labels);

  const totalDona = pres + just + inj + vis;
  const donaEmpty = document.getElementById("dona-empty-msg");
  if (chartDona) chartDona.destroy();
  if (totalDona > 0) {
    donaEmpty.classList.add("hidden");
    chartDona = new Chart(document.getElementById("chart-dona"), {
      type: "doughnut",
      data: {
        labels: ["Presentes", "Justificadas", "Injustificadas", "Visitas"],
        datasets: [{ data: [pres, just, inj, vis], backgroundColor: ["#16a34a", "#f59e0b", "#dc2626", "#0284c7"] }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            right: 4,
            left: 2,
            top: 0,
            bottom: 0
          }
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              boxWidth: 10,
              boxHeight: 8,
              padding: 8,
              font: {
                size: 9
              }
            }
          }
        }
      }
    });
  } else {
    donaEmpty.classList.remove("hidden");
  }

  if (chartAsis) chartAsis.destroy();
  chartAsis = new Chart(document.getElementById("chart-asistencia"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Presentes (1)", data: seriePres, backgroundColor: "#16a34a" },
        { label: "F. Justificada (2)", data: serieJust, backgroundColor: "#f59e0b" },
        { label: "F. Injustificada (0)", data: serieInj, backgroundColor: "#dc2626" }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }
  });

  if (chartEvang) chartEvang.destroy();
  chartEvang = new Chart(document.getElementById("chart-evangelismo"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Evangelizados", data: serieEv, backgroundColor: "#2563eb" },
        { label: "Tratados Entregados", data: serieTr, backgroundColor: "#f97316" }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

/* =========================================================
   6. PANELES FLOTANTES (RESUMEN SEMANAL Y EN CURSO)
   ========================================================= */
function poblarSelectorResumenSemanal() {
  const fechas = [...new Set(DB.asistencia.map(a => claveFecha(a.Fecha)).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f)))].sort();
  const sel = document.getElementById("resumen-semana-select");
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = fechas.slice().reverse().map(f =>
    `<option value="${f}">Semana ${fechaDMA(f)}</option>`
  ).join("");
  if (prev && fechas.includes(prev)) {
    sel.value = prev;
  } else if (fechas.length > 0) {
    sel.value = fechas[fechas.length - 1];
  }
}

function renderResumenSemanal(fechaElegida) {
  const selSemana = document.getElementById("resumen-semana-select");
  const todasFechas = [...new Set(DB.asistencia.map(a => claveFecha(a.Fecha)).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f)))].sort();
  const fechaTarget = fechaElegida || (selSemana && selSemana.value) || (todasFechas[todasFechas.length - 1] || "");

  if (selSemana && fechaTarget && selSemana.value !== fechaTarget) {
    selSemana.value = fechaTarget;
  }

  document.getElementById("badge-fecha-resumen").textContent = fechaTarget ? fechaDMA(fechaTarget) : "—";
  const body = document.getElementById("widget-resumen-body");
  if (!fechaTarget) {
    window.resumenCopiar = "";
    body.innerHTML = `<p class="text-slate-500 text-center py-2">Sin datos semanales aún.</p>`;
    return;
  }

  const infoPorId = {};
  DB.matriculados.forEach(m => {
    infoPorId[String(m.ID).trim()] = {
      estado: normalizarEstado(m.Estado),
      obra: normalizarObraTexto(m.Obra)
    };
  });

  const asisSem = DB.asistencia.filter(r => claveFecha(r.Fecha) === fechaTarget);
  const evangSem = DB.evangelismo.filter(r => claveFecha(r.Fecha) === fechaTarget);

  const asisSemActivos = asisSem.filter(r => {
    const info = infoPorId[String(r.ID_Hermano || "").trim()];
    return !info || info.estado !== "Inactivo";
  });

  const matriculadosTotal = DB.matriculados.filter(m => normalizarEstado(m.Estado) === "Activo").length;
  const presentes = asisSemActivos.filter(r => Number(r.Codigo) === 1);
  const just = asisSemActivos.filter(r => Number(r.Codigo) === 2).length;
  const injMarcadas = asisSemActivos.filter(r => Number(r.Codigo) === 0).length;

  const registradosUnicos = new Set(asisSemActivos.map(r => String(r.ID_Hermano || "").trim())).size;
  const sinRegistrar = registradosUnicos < matriculadosTotal ? Math.max(0, matriculadosTotal - registradosUnicos) : 0;
  const faltasTotal = just + injMarcadas + sinRegistrar;

  const visitas = obtenerVisitasPorObraYFecha(fechaTarget, "TODAS");

  const countObra = (nombreObraCanon) =>
    presentes.filter(r =>
      normalizarObraTexto(r.Obra) === nombreObraCanon
    ).length;

  const lo = countObra("Los Olivos");
  const lh = countObra("Los Heraldos");
  const bel = countObra("Belaunde");
  const na = countObra("Nuevo Amanecer");
  const sjl = countObra("SJL");

  const tratados = evangSem.reduce((acc, r) => acc + (Number(r.Tratados_Entregados) || 0), 0);
  const evCentral = evangSem
    .filter(r => normalizarObraTexto(r.Obra) === "Los Olivos")
    .reduce((acc, r) => acc + (Number(r.Evangelizados) || 0), 0);
  const evCong = evangSem
    .filter(r => normalizarObraTexto(r.Obra) !== "Los Olivos")
    .reduce((acc, r) => acc + (Number(r.Evangelizados) || 0), 0);
  const evTotal = evCentral + evCong;

  window.resumenCopiar = `
ASISTENCIA CAMPAÑA GENERAL

Matriculados: ${matriculadosTotal}
Presentes total: ${presentes.length}
Faltas: ${faltasTotal} (justificadas ${just})

LO: ${lo}
LH: ${lh}
Belaunde: ${bel}
NA: ${na}
SJL: ${sjl}

Visitantes: ${visitas}
Tratados entregados: ${tratados}
Total evangelizados: ${evTotal}

Evangelizados sede Central: ${evCentral}
Evangelizados congregaciones: ${evCong}
`.trim();

  const pad2 = (n) => String(n).padStart(2, "0");

  body.innerHTML = `
    <div class="flex justify-between items-center border-b border-slate-200 pb-1">
      <p class="font-extrabold text-blue-950 uppercase">
        Asistencia Campaña General:
      </p>

      <button
        type="button"
        id="btn-copiar-resumen"
        onclick="copiarResumenSemanal()"
        class="text-xs px-2.5 py-1 bg-blue-700 text-white rounded hover:bg-blue-800"
        title="Copiar resumen">
        📋
      </button>
    </div>
    <div class="flex justify-between"><span>Matriculados</span><b>${pad2(matriculadosTotal)}</b></div>
    <div class="flex justify-between text-emerald-700 font-bold"><span>Presentes total</span><span>${pad2(presentes.length)}</span></div>
    <div class="flex justify-between text-red-700 font-bold"><span>Faltas</span><span>${pad2(faltasTotal)} (justificadas ${pad2(just)})</span></div>
    <div class="border-t border-slate-200 pt-1.5 space-y-0.5">
      <div class="flex justify-between"><span>L O</span><b>${pad2(lo)}</b></div>
      <div class="flex justify-between"><span>L H</span><b>${pad2(lh)}</b></div>
      <div class="flex justify-between"><span>Belaunde</span><b>${pad2(bel)}</b></div>
      <div class="flex justify-between"><span>N A</span><b>${pad2(na)}</b></div>
      <div class="flex justify-between"><span>S J L</span><b>${pad2(sjl)}</b></div>
    </div>
    <div class="border-t border-slate-200 pt-1.5 space-y-0.5">
      <div class="flex justify-between text-sky-700 font-semibold"><span>Visitantes</span><span>${pad2(visitas)}</span></div>
      <div class="flex justify-between font-bold text-orange-700"><span>Tratados entregados</span><span>${tratados}</span></div>
      <div class="flex justify-between font-extrabold text-blue-950"><span>Total de evangelizados</span><span>${evTotal}</span></div>
    </div>
    <div class="border-t border-dashed border-slate-300 pt-1.5 space-y-0.5">
      <div class="flex justify-between"><span>Evangelizados sede Central</span><b>${evCentral}</b></div>
      <div class="flex justify-between"><span>Evangelizados congregaciones</span><b>${evCong}</b></div>
    </div>
  `;
}

function marcarBotonCopiado() {
  const btn = document.getElementById("btn-copiar-resumen");
  if (btn) {
    btn.innerHTML = "✅";
    setTimeout(() => {
      btn.innerHTML = "📋";
    }, 1500);
  }
}

function copiarFallbackMovil(texto) {
  try {
    const ta = document.createElement("textarea");
    ta.value = texto;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, texto.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) {
      marcarBotonCopiado();
      return true;
    }
  } catch (e) {}
  return false;
}

function copiarResumenSemanal() {
  const texto = window.resumenCopiar || "";
  if (!texto) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texto)
      .then(() => {
        marcarBotonCopiado();
      })
      .catch(() => {
        copiarFallbackMovil(texto);
      });
  } else {
    copiarFallbackMovil(texto);
  }
}

function obtenerListaCurso() {
  return DB.matriculados.filter(m => normalizarEstado(m.Estado) === "En Clases");
}

function renderWidgetClases() {
  const listaCurso = obtenerListaCurso();
  document.getElementById("badge-count-clases").textContent = listaCurso.length;
  const body = document.getElementById("widget-clases-body");
  if (listaCurso.length === 0) {
    body.innerHTML = `<p class="text-slate-500 text-center py-2">Ningún hermano marcado en curso de evangelismo.</p>`;
    return;
  }
  body.innerHTML = listaCurso.map(m => {
    const detalle = m.Motivo_Clases || "En curso de evangelismo";
    return `
      <div class="bg-white p-2.5 rounded-lg border border-red-200 flex items-center justify-between gap-2 shadow-sm">
        <div>
          <p class="font-bold text-slate-900">${m.Nombres_Apellidos}</p>
          <p class="text-[11px] text-red-700">${m.Obra} • ${detalle}</p>
        </div>
        <button type="button" onclick="aprobarHermano('${m.ID}')" class="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1 rounded transition">
          Aprobar
        </button>
      </div>
    `;
  }).join("");
}

/* =========================================================
   7. REGISTRO DE ASISTENCIA Y EVANGELISMO (VIERNES)
   ========================================================= */
function cargarFormularioFecha() {
  const fecha = claveFecha(document.getElementById("reg-fecha").value);
  formState = {};
  const existentes = DB.asistencia.filter(a => claveFecha(a.Fecha) === fecha);

  const badge = document.getElementById("contador-rapido");
  if (existentes.length > 0) {
    badge.textContent = `Fecha ya guardada (${fechaDMA(fecha)}) — Cambia solo lo necesario`;
    badge.className = "text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded";
  } else {
    badge.textContent = `Fecha nueva (${fechaDMA(fecha)}) — Marca cada hermano`;
    badge.className = "text-xs font-bold text-emerald-900";
  }

  DB.matriculados.filter(m => normalizarEstado(m.Estado) === "Activo").forEach(m => {
    const found = existentes.find(e => String(e.ID_Hermano).trim() === String(m.ID).trim());
    const codGuardado = (found !== undefined && found.Codigo !== "" && found.Codigo !== null) ? Number(found.Codigo) : null;
    formState[m.ID] = {
      codigo: codGuardado === 3 ? 1 : codGuardado,
      observacion: found ? (found.Observacion || "") : ""
    };
  });

  const gridEv = document.getElementById("grid-evangelismo-obras");
  gridEv.innerHTML = OBRAS.map(o => {
    const foundEv = DB.evangelismo.find(e => claveFecha(e.Fecha) === fecha && normalizarObraTexto(e.Obra) === o);
    const evVal = foundEv && foundEv.Evangelizados !== "" ? foundEv.Evangelizados : "";
    const trVal = foundEv && foundEv.Tratados_Entregados !== "" ? foundEv.Tratados_Entregados : "";
    const cacheKey = `${fecha}__${o}`;
    const tieneValorSheet = foundEv && foundEv.Visitas !== undefined && foundEv.Visitas !== null && String(foundEv.Visitas).trim() !== "";
    const visVal = tieneValorSheet
      ? (Number(foundEv.Visitas) || 0)
      : (visitasCache[cacheKey] !== undefined ? visitasCache[cacheKey] : "");

    return `
      <div class="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
        <p class="text-xs font-bold text-emerald-950">${o}</p>
        <div class="grid grid-cols-3 gap-1.5">
          <div>
            <label class="block text-[10px] text-slate-500">Evang.</label>
            <input type="number" min="0" inputmode="numeric" id="ev-${o}" value="${evVal}" placeholder="0" class="w-full border border-slate-300 rounded px-2 py-1 text-xs" />
          </div>
          <div>
            <label class="block text-[10px] text-slate-500">Tratados</label>
            <input type="number" min="0" inputmode="numeric" id="tr-${o}" value="${trVal}" placeholder="0" class="w-full border border-slate-300 rounded px-2 py-1 text-xs" />
          </div>
          <div>
            <label class="block text-[10px] text-sky-700 font-semibold">Visitas</label>
            <input type="number" min="0" inputmode="numeric" id="vis-${o}" value="${visVal}" placeholder="0" class="w-full border border-sky-300 bg-sky-50/50 rounded px-2 py-1 text-xs font-semibold text-sky-900" />
          </div>
        </div>
      </div>
    `;
  }).join("");

  renderListaAsistencia();
}

function renderListaAsistencia() {
  const obraFiltro = document.getElementById("reg-obra").value;
  const lista = DB.matriculados.filter(m => {
    const est = normalizarEstado(m.Estado);
    return est !== "Inactivo" && (obraFiltro === "TODAS" || normalizarObraTexto(m.Obra) === obraFiltro);
  });
  const container = document.getElementById("lista-asistencia-body");

  container.innerHTML = lista.map(m => {
    if (normalizarEstado(m.Estado) === "En Clases") {
      return `
        <div class="px-4 sm:px-5 py-3 bg-red-50/60 flex flex-wrap items-center justify-between gap-2 opacity-80">
          <div>
            <span class="text-xs font-bold text-slate-400 mr-2">${m.ID}</span>
            <span class="text-sm font-bold text-slate-700">${m.Nombres_Apellidos}</span>
            <span class="ml-2 text-[11px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded">${m.Obra}</span>
          </div>
          <span class="text-xs font-bold text-red-700 bg-red-100 px-3 py-1 rounded-full">
            Bloqueado • En Curso de Evangelismo
          </span>
        </div>
      `;
    }
    const st = formState[m.ID] || { codigo: null, observacion: "" };
    return `
      <div class="px-4 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50">
        <div class="min-w-[200px]">
          <span class="text-xs font-mono text-slate-400 mr-2">${m.ID}</span>
          <span class="text-sm font-semibold text-slate-800">${m.Nombres_Apellidos}</span>
          <span class="ml-2 text-[11px] text-slate-500">(${m.Obra})</span>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          ${[
            { c: 1, lbl: "1 • Presente", cls: "bg-emerald-600 text-white" },
            { c: 2, lbl: "2 • Justif.", cls: "bg-amber-500 text-white" },
            { c: 0, lbl: "0 • Injust.", cls: "bg-red-600 text-white" }
          ].map(btn => `
            <button type="button" onclick="setCodigo('${m.ID}', ${btn.c})"
              class="px-2.5 py-1.5 rounded text-xs font-bold border transition ${st.codigo === btn.c ? btn.cls + ' border-transparent shadow-sm' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}">
              ${btn.lbl}
            </button>
          `).join("")}
          <input type="text" value="${st.observacion}" onchange="setObs('${m.ID}', this.value)" placeholder="Nota..." class="border border-slate-200 rounded px-2 py-1 text-xs w-full sm:w-32 mt-1 sm:mt-0 sm:ml-2" />
        </div>
      </div>
    `;
  }).join("");
}

function setCodigo(id, cod) {
  if (!formState[id]) formState[id] = { codigo: null, observacion: "" };
  formState[id].codigo = (formState[id].codigo === cod) ? null : cod;
  renderListaAsistencia();
}

function setObs(id, txt) {
  if (!formState[id]) formState[id] = { codigo: null, observacion: "" };
  formState[id].observacion = txt;
}

async function guardarSoloAsistencia() {
  const fecha = claveFecha(document.getElementById("reg-fecha").value);
  const obraFiltro = document.getElementById("reg-obra").value;

  const activosFiltrados = DB.matriculados
    .filter(m => normalizarEstado(m.Estado) === "Activo" && (obraFiltro === "TODAS" || normalizarObraTexto(m.Obra) === obraFiltro));

  const sinMarcar = activosFiltrados.filter(m => !formState[m.ID] || formState[m.ID].codigo === null || formState[m.ID].codigo === undefined);
  if (sinMarcar.length > 0) {
    alert(`Todavía hay ${sinMarcar.length} hermano(s) sin marcar asistencia (por ejemplo: ${sinMarcar[0].Nombres_Apellidos}).`);
    return;
  }

  const btn = document.getElementById("btn-guardar-asis");
  btn.disabled = true;
  btn.textContent = "Guardando...";

  const registros = activosFiltrados.map(m => ({
    id_hermano: m.ID,
    nombre: m.Nombres_Apellidos,
    obra: m.Obra,
    codigo: formState[m.ID].codigo,
    observacion: formState[m.ID].observacion || ""
  }));

  const resp = await enviarAccion({ action: "saveAsistencia", fecha, obraFiltro, registros });
  btn.disabled = false;
  btn.textContent = "Guardar Asistencia del Viernes";
  if (!resp || resp.status !== "error") {
    alert("¡Asistencia del viernes guardada en Google Sheets!");
  }
}

async function guardarSoloEvangelismo() {
  const btn = document.getElementById("btn-guardar-evang");
  btn.disabled = true;
  btn.textContent = "Guardando...";
  const fecha = claveFecha(document.getElementById("reg-fecha").value);

  const evangelismo = OBRAS.map(o => {
    const visNum = Number(document.getElementById(`vis-${o}`).value) || 0;
    visitasCache[`${fecha}__${o}`] = visNum;
    return {
      obra: o,
      evangelizados: document.getElementById(`ev-${o}`).value,
      tratados: document.getElementById(`tr-${o}`).value,
      visitas: visNum
    };
  });
  guardarCacheVisitas();

  const resp = await enviarAccion({ action: "saveEvangelismo", fecha, evangelismo });
  btn.disabled = false;
  btn.textContent = "Guardar Evangelizados, Tratados y Visitas";
  if (!resp || resp.status !== "error") {
    alert("¡Evangelizados, tratados y visitas guardados!");
  }
}

/* =========================================================
   8. CONTROL DE CUOTAS
   ========================================================= */
function renderCuotas() {
  const thead = document.getElementById("cuotas-thead");
  thead.innerHTML = `<th class="px-3 py-3 sticky left-0 bg-slate-800">Hermano</th><th class="px-3 py-3">Obra</th>` +
    PERIODOS_CUOTAS.map(p => `<th class="px-2 py-3 text-center">${p.slice(2)}</th>`).join("") +
    `<th class="px-3 py-3 text-right">Total S/</th>`;

  let totalGlobal = 0;
  const tbody = document.getElementById("cuotas-tbody");
  tbody.innerHTML = DB.cuotas.map(c => {
    let countP = 0;
    const cells = PERIODOS_CUOTAS.map(p => {
      const isPaid = String(c[p] || "").trim().toUpperCase() === "P";
      if (isPaid) countP++;
      return `
        <td class="px-1.5 py-2 text-center">
          <button type="button" onclick="toggleCuota('${c.ID_Hermano}', '${p}', ${!isPaid})"
            class="w-7 h-7 rounded font-bold transition ${isPaid ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}">
            ${isPaid ? 'P' : '·'}
          </button>
        </td>
      `;
    }).join("");
    const monto = countP * 2;
    totalGlobal += monto;
    return `
      <tr class="hover:bg-slate-50">
        <td class="px-3 py-2 font-semibold sticky left-0 bg-white">${c.Nombres_Apellidos}</td>
        <td class="px-3 py-2 text-slate-500">${c.Obra}</td>
        ${cells}
        <td class="px-3 py-2 text-right font-bold text-emerald-700">S/ ${monto.toFixed(2)}</td>
      </tr>
    `;
  }).join("");
  document.getElementById("total-recaudado-global").textContent = `S/ ${totalGlobal.toFixed(2)}`;
}

async function toggleCuota(idHermano, periodo, pagado) {
  const row = DB.cuotas.find(c => c.ID_Hermano === idHermano);
  if (row) row[periodo] = pagado ? "P" : "";
  renderCuotas();
  await enviarAccion({ action: "toggleCuota", id_hermano: idHermano, periodo, pagado });
}

/* =========================================================
   9. MATRICULADOS Y ESTADOS
   ========================================================= */
async function cambiarEstadoCursoHermano(idHermano, opcion) {
  const hermano = DB.matriculados.find(m => String(m.ID).trim() === String(idHermano).trim());
  if (!hermano) return;

  let nuevoEstado = "Activo";
  let motivo = "";

  if (opcion === "SI") {
    nuevoEstado = "En Clases";
    motivo = "Marcado en curso de evangelismo";
  } else if (opcion === "INACTIVO") {
    nuevoEstado = "Inactivo";
    motivo = "Inactivo (retirado por inasistencia a cursos/evangelismo)";
  } else {
    nuevoEstado = "Activo";
    motivo = "";
  }

  hermano.Estado = nuevoEstado;
  hermano.Motivo_Clases = motivo;

  renderWidgetClases();
  renderMatriculados();
  renderListaAsistencia();

  await enviarAccion({
    action: "setEstadoHermano",
    id_hermano: idHermano,
    estado: nuevoEstado,
    motivo: motivo
  });
}

async function aprobarHermano(id) {
  if (!confirm("¿Confirmas que este hermano aprobó las clases de evangelismo y vuelve a la campaña?")) return;
  await enviarAccion({ action: "aprobarHermano", id_hermano: id });
}

function obtenerMotivoHermano(m, inj, just) {
  const est = normalizarEstado(m.Estado);
  const motivoSheet = String(m.Motivo_Clases || "").trim();
  if (est === "Inactivo") return "Inactivo (retirado por inasistencia a cursos/evangelismo)";
  if (est === "En Clases") return motivoSheet || "En curso de evangelismo";
  if (inj >= 3) return "Alcanzó 3 faltas injust. en el mes";
  if (just >= 4) return "Alcanzó 4 faltas just. en el mes";
  if (inj === 2) return "2 faltas injust. en el mes";
  if (just >= 3) return `${just} faltas just. en el mes`;
  if (inj === 1) return "1 falta injust. en el mes";
  if (just > 0) return `${just} falta(s) just. en el mes`;
  return motivoSheet || "Sin faltas en el mes";
}

function renderMatriculados() {
  const tbody = document.getElementById("matriculados-tbody");
  tbody.innerHTML = DB.matriculados.map(m => {
    const est = normalizarEstado(m.Estado);
    const inj = Number(m.Injustificadas_Mes_Actual) || 0;
    const just = Number(m.Justificadas_Mes_Actual) || 0;

    const opcionActual = est === "En Clases" ? "SI" : (est === "Inactivo" ? "INACTIVO" : "ACTIVO");

    const badgeEst = est === "Activo"
      ? "bg-emerald-100 text-emerald-800"
      : est === "En Clases"
        ? "bg-red-100 text-red-800"
        : "bg-slate-200 text-slate-600";

    let faltasHtml;
    if (est === "Inactivo") {
      faltasHtml = `<span class="text-slate-400 italic">No aplica (Inactivo)</span>`;
    } else {
      const clsInj = inj === 0
        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
        : inj === 1
          ? "bg-amber-100 text-amber-800 border-amber-300"
          : "bg-red-100 text-red-800 border-red-300";

      const clsJust = just === 0
        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
        : (just === 1 || just === 2)
          ? "bg-amber-100 text-amber-800 border-amber-300"
          : "bg-red-100 text-red-800 border-red-300";

      faltasHtml = `
        <span class="inline-block px-2 py-0.5 rounded border font-bold ${clsInj}">Injust: ${inj}</span>
        <span class="mx-1 text-slate-400">|</span>
        <span class="inline-block px-2 py-0.5 rounded border font-bold ${clsJust}">Just: ${just}</span>
      `;
    }

    const motivoTexto = obtenerMotivoHermano(m, inj, just);

    return `
      <tr class="hover:bg-slate-50">
        <td class="px-4 py-2.5 font-mono text-slate-500">${m.ID}</td>
        <td class="px-4 py-2.5 font-semibold">${m.Nombres_Apellidos}</td>
        <td class="px-4 py-2.5">${m.Obra}</td>
        <td class="px-4 py-2.5">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded-full font-bold text-[11px] ${badgeEst}">
              ${est}
            </span>
            <select onchange="cambiarEstadoCursoHermano('${m.ID}', this.value)"
              class="border border-slate-300 rounded px-2 py-1 text-[11px] font-semibold bg-white text-slate-800">
              <option value="ACTIVO" ${opcionActual === "ACTIVO" ? "selected" : ""}>En curso: No (Activo)</option>
              <option value="SI" ${opcionActual === "SI" ? "selected" : ""}>En curso: Sí</option>
              <option value="INACTIVO" ${opcionActual === "INACTIVO" ? "selected" : ""}>Inactivo</option>
            </select>
          </div>
        </td>
        <td class="px-4 py-2.5">${faltasHtml}</td>
        <td class="px-4 py-2.5 text-slate-600">${motivoTexto}</td>
      </tr>
    `;
  }).join("");
}

async function agregarHermano() {
  const nombre = document.getElementById("nuevo-nombre").value.trim();
  const obra = document.getElementById("nuevo-obra").value;
  if (!nombre) return;
  document.getElementById("nuevo-nombre").value = "";
  await enviarAccion({ action: "addHermano", nombre, obra });
}

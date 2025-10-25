/* ======= Dimensiones 4x5 y tiempos ======= */
const ROWS=4, COLS=5, CELL=72, TURN_MS=400, STEP_MS=600;

/* ======= Estado ======= */
let track = makeTrack(ROWS,COLS,false);  // matriz de booleanos
let program=[], running=false, configMode=false;
let angle=90, pos={r:0,c:0}, start={r:0,c:0};

/* ======= Pistas pre-cargadas =======*/
const PRESETS=[
  fromCoords(ROWS,COLS,[
    [0,0],[0,1],[0,2],[0,3],[0,4],
    [1,4],[2,4],[3,4]
  ]),
  fromCoords(ROWS,COLS,[
    [3,0],[2,0],[1,0],[0,0],
    [0,1],[0,2],[0,3],[0,4]
  ]),
  fromCoords(ROWS,COLS,[
    [0,0],[0,1],[1,1],[1,2],
    [2,2],[2,3],[3,3],[3,4]
  ])
];

/* ======= DOM ======= */
const gridEl=document.getElementById('grid');
const robotEl=document.getElementById('robot');
const chipsEl=document.getElementById('programChips');
const msgEl=document.getElementById('message');
const cfgHint=document.getElementById('cfgHint');
const panelTitle=document.getElementById('panelTitle');
const controls=document.getElementById('controls');

/* ======= API base del backend ======= */
const API_BASE = "http://localhost:8080/api";
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin123";
const AUTH_HEADER = "Basic " + btoa(`${ADMIN_USER}:${ADMIN_PASS}`);
let currentUser = null;
let authHeader = null;

/* ======= Helpers ======= */
function makeTrack(r,c,f=false){return Array.from({length:r},()=>Array(c).fill(f));}
function cloneTrack(t){return t.map(row=>row.slice());}
function fromCoords(r,c,coords){
  const t=makeTrack(r,c,false);
  coords.forEach(([rr,cc])=>{ if(rr>=0&&rr<r&&cc>=0&&cc<c) t[rr][cc]=true; });
  return t;
}


async function randomPreset() {
  try {
    const response = await fetch(`${API_BASE}/tracks/random`, {
      headers: {
        "Authorization": AUTH_HEADER,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) throw new Error("No se pudo cargar pista aleatoria");

    const pista = await response.json();
    const data = JSON.parse(pista.gridJson);
    showMsg(`Pista cargada: ${pista.name}`, true);
    return data.cells;

  } catch (err) {
    console.error(err);
    showMsg("Error cargando pista aleatoria (usando local).", false);
    return cloneTrack(PRESETS[Math.floor(Math.random() * PRESETS.length)]);
  }
}


/* ======= Construcción y pintado de grilla ======= */
function buildGrid(){
  gridEl.innerHTML='';
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const d=document.createElement('div');
      d.className='cell';
      d.dataset.r=r; d.dataset.c=c;
      d.addEventListener('click',()=>onCellClick(r,c,d));
      gridEl.appendChild(d);
    }
  }
}

function paintTrack(){
  [...gridEl.children].forEach(cell=>{
    const r=+cell.dataset.r, c=+cell.dataset.c;
    cell.classList.toggle('valid', !!track[r][c]);
  });
}

/* ======= Configurar: click en celda ======= */
function onCellClick(r,c,el){
  if(!configMode || running) return;
  track[r][c] = !track[r][c];
  el.classList.toggle('valid', track[r][c]);
  updateStartFromFirstGreen();
}

/* ======= Posición/transform del robot ======= */
function updateStartFromFirstGreen(){
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      if(track[r][c]){ start={r,c}; setPos(start); angle=90; applyTransform(); return; }
    }
  }
  start={r:0,c:0}; setPos(start); angle=90; applyTransform();
}
function setPos(p){ pos={ r:p.r, c:p.c }; }
function applyTransform(){
  robotEl.style.transform = `translate(${pos.c*CELL}px, ${pos.r*CELL}px) rotate(${angle}deg)`;
}

/* ======= Programación (chips) ======= */
function renderProgram(){
  chipsEl.innerHTML='';
  program.forEach(cmd=>{
    const s=document.createElement('span');
    s.className='chip';
    s.textContent=cmd;
    chipsEl.appendChild(s);
  });
}

function addCmd(cmd){ if(running) return; program.push(cmd); renderProgram(); }
function clearProgram(){ if(running) return; program=[]; renderProgram(); }

/* ======= Mensajes ======= */
function showMsg(text, ok=true){
  msgEl.textContent=text;
  msgEl.className='msg show';
  msgEl.style.background = ok ? '#ecfdf5' : '#fee2e2';
  msgEl.style.color = ok ? '#065f46' : '#7f1d1d';
}

/* ======= Ejecución ======= */
function onTrack(p){ return p.r>=0 && p.r<ROWS && p.c>=0 && p.c<COLS && !!track[p.r][p.c]; }
function stepForward(){
  const p={ r:pos.r, c:pos.c };
  if(angle===0) p.r -= 1;
  else if(angle===90) p.c += 1;
  else if(angle===180) p.r += 1;
  else if(angle===270) p.c -= 1;

  if(!onTrack(p)) return false;
  setPos(p); applyTransform(); return true;
}
// Un nivel de bucle: repite 1 vez el bloque entre INICIO/FIN
function expandLoops(list){
  const out=[], buf=[]; let inLoop=false;
  for(const cmd of list){
    if(cmd==='Bucle Inicio'){ inLoop=true; buf.length=0; }
    else if(cmd==='Bucle Fin'){ if(inLoop){ out.push(...buf, ...buf); inLoop=false; buf.length=0; } }
    else{ inLoop ? buf.push(cmd) : out.push(cmd); }
  }
  if(inLoop && buf.length) out.push(...buf);
  return out;
}
const delay = ms => new Promise(r=>setTimeout(r,ms));

async function run(){
  if(running || program.length===0 || configMode) return;

  if (!onTrack(pos)){
    showMsg('Intentalo de nuevo, el robot no está en la pista.', false);
    return;
  }

  running = true;
  msgEl.classList.remove('show');

  // Asegura que la pista esté pintada en ejecución (verde)
  paintTrack();

  const seq = expandLoops(program);
  for(const cmd of seq){
    if(cmd==='Girar Izquierda'){
      angle = (angle + 270) % 360; applyTransform(); await delay(TURN_MS+40);
    } else if(cmd==='Girar Derecha'){
      angle = (angle + 90) % 360; applyTransform(); await delay(TURN_MS+40);
    } else if(cmd==='Adelante'){
      const ok = stepForward(); await delay(STEP_MS);
      if(!ok){ showMsg('Inténtalo de nuevo: el robot salió del camino.', false); running=false; return; }
    }
  }
  showMsg('¡Misión cumplida!', true);
  running = false;
}

function promptLogin() {
  return new Promise((resolve) => {
    const modal = document.getElementById("loginModal");
    const userInput = document.getElementById("loginUser");
    const passInput = document.getElementById("loginPass");
    const btnOk = document.getElementById("btnLoginOk");
    const btnCancel = document.getElementById("btnLoginCancel");

    modal.style.display = "flex";
    userInput.value = "";
    passInput.value = "";
    userInput.focus();

    const close = (result) => {
      modal.style.display = "none";
      btnOk.onclick = btnCancel.onclick = null;
      resolve(result);
    };

    btnCancel.onclick = () => close(false);
    btnOk.onclick = async () => {
      const user = userInput.value.trim();
      const pass = passInput.value.trim();
      if (!user || !pass) {
        showMsg("Debe ingresar usuario y contraseña.", false);
        return;
      }

      const header = "Basic " + btoa(`${user}:${pass}`);
      try {
        const res = await fetch(`${API_BASE}/admin/check`, {
          headers: { "Authorization": header },
        });
        if (!res.ok) {
          showMsg("Credenciales inválidas o sin permisos.", false);
          close(false);
          return;
        }
        currentUser = user;
        authHeader = header;
        localStorage.setItem("authHeader", header);
        localStorage.setItem("currentUser", user);
        showMsg(`Bienvenido, ${user}.`, true);
        close(true);
      } catch (err) {
        console.error(err);
        showMsg("Error al verificar credenciales.", false);
        close(false);
      }
    };
  });
}


/* ======= Botones ======= */
document.getElementById('btnRun').onclick = run;

document.getElementById('btnReiniciar').onclick = async ()=>{
  if(running) return;
  const saved = localStorage.getItem('customTrack');
  track = saved ? JSON.parse(saved) : await randomPreset();
  paintTrack();
  updateStartFromFirstGreen();
  clearProgram();
  showMsg('Tablero reiniciado.', true);
};

document.getElementById('btnConfig').onclick = async ()=> {
  if (running) return;

  if (!currentUser) {
    const ok = await promptLogin();
    if (!ok) return;
  }

  configMode = !configMode;
  controls.style.display = configMode ? 'none' : 'flex';
  cfgHint.style.display = configMode ? 'block' : 'none';
  panelTitle.textContent = configMode ? 'Configurar Pista' : 'Movimientos';
  configButtons.style.display = configMode ? 'flex' : 'none';
  fileButtons.style.display = configMode ? 'none' : 'flex';
};

document.getElementById('btnClear').onclick = clearProgram;

document.getElementById('btnSaveTrack').onclick = async () => {
  if (running) return;

  if (!currentUser || !authHeader) {
    showMsg("Debe iniciar sesión como administrador para guardar.", false);
    return;
  }

  const pista = {
    name: prompt("Ingrese un nombre para la pista:", "Pista_" + Date.now()),
    width: COLS,
    height: ROWS,
    gridJson: JSON.stringify({ cells: track })
  };

  if (!pista.name) {
    showMsg("Debe ingresar un nombre para la pista.", false);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/admin/tracks`, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(pista)
    });

    if (res.ok) {
      const result = await res.text();
      showMsg(`Pista guardada correctamente. (${pista.name})`, true);
      console.log("Respuesta servidor:", result);
    } else if (res.status === 401 || res.status === 403) {
      showMsg("No autorizado. Verifique sus credenciales.", false);
    } else {
      showMsg("Error al guardar la pista.", false);
    }
  } catch (err) {
    console.error(err);
    showMsg("Error de conexión con el servidor.", false);
  }
};


document.getElementById('btnRandom').onclick = async ()=>{
  if(running) return;
  track = await randomPreset(); // <-- await
  paintTrack();
  updateStartFromFirstGreen();
  clearProgram();
  showMsg('Pista aleatoria cargada.', true);
};

controls.querySelectorAll('[data-cmd]').forEach(b=> b.onclick = ()=> addCmd(b.dataset.cmd) );

/* ======= Inicio ======= */
(async function init(){
  buildGrid();
  const saved = localStorage.getItem('customTrack');
  track = saved ? JSON.parse(saved) : await randomPreset(); // <-- await
  paintTrack();
  updateStartFromFirstGreen();
  applyTransform();
  renderProgram();
})();

/* ======= Importar y exportar con el backend ======= */
document.getElementById("btnExport").onclick = async ()=>{
  const modal = document.getElementById("exportModal");
  const select = document.getElementById("exportSelect");
  const btnOk = document.getElementById("btnExportOk");
  const btnCancel = document.getElementById("btnExportCancel");

  modal.style.display = "flex";
  select.innerHTML = "<option>Cargando...</option>";

  try {
    const res = await fetch(`${API_BASE}/tracks`, {
      headers: { "Authorization": AUTH_HEADER }
    });
    const pistas = await res.json();

    if (pistas.length === 0) {
      select.innerHTML = "<option>No hay pistas guardadas</option>";
      return;
    }

    select.innerHTML = "";
    pistas.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error(err);
    showMsg("Error al obtener lista de pistas.", false);
    modal.style.display = "none";
    return;
  }

  const closeModal = () => {
    modal.style.display = "none";
    btnOk.onclick = btnCancel.onclick = null;
  };

  btnCancel.onclick = closeModal;

  btnOk.onclick = async () => {
    const id = select.value;
    if (!id) {
      showMsg("Debe seleccionar una pista.", false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/admin/tracks/${id}/export`, {
        headers: { "Authorization": AUTH_HEADER }
      });

      if (!res.ok) {
        showMsg("Error exportando pista.", false);
        closeModal();
        return;
      }

      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${select.options[select.selectedIndex].text}.json`;
      link.click();

      showMsg(`✅ Pista exportada: ${select.options[select.selectedIndex].text}`, true);
    } catch (err) {
      console.error(err);
      showMsg("Error al exportar pista.", false);
    }

    closeModal();
  };
};

document.getElementById("btnArchivo").onclick = async ()=>{
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = async (e)=>{
    const file = e.target.files[0];
    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/admin/tracks/import`, {
        method: "POST",
        headers: { "Authorization": AUTH_HEADER },
        body: form
      });

      const msg = await res.text();
      showMsg(msg, res.ok);
    } catch (err) {
      console.error(err);
      showMsg("Error al importar pista.", false);
    }
  };
  input.click();
};

//Botón Usuarios
document.getElementById("btnUsers").onclick = () => {
  document.getElementById("modalUsuarios").classList.remove("hidden");
  loadAdmins();
};

// Botón Bitácora
document.getElementById("btnLogs").onclick = () => {
  document.getElementById("modalBitacora").classList.remove("hidden");
  loadBitacora();
};

// Cerrar modales
document.getElementById("cancelar").onclick = () => 
  document.getElementById("modalUsuarios").classList.add("hidden");
document.getElementById("closeBitacora").onclick = () =>
  document.getElementById("modalBitacora").classList.add("hidden");

const configButtons = document.getElementById('Config-Buttons');
const fileButtons = document.getElementById('fileButtons');


// ------------------- FUNCIONES DE USUARIOS -------------------
async function loadAdmins() {
  try {
    const res = await fetch(`${API_BASE}/admins`, {
      headers: { "Authorization": AUTH_HEADER }
    });
    if (!res.ok) throw new Error("Error al cargar usuarios");
    const admins = await res.json();

    const tbody = document.querySelector("#tblAdmins tbody");
    tbody.innerHTML = "";
    admins.forEach(a => {
  const tr = document.createElement("tr");

  const isMainAdmin = a.username.toLowerCase() === "admin";

  tr.innerHTML = `
    <td>${a.id}</td>
    <td>${a.username}</td>
    <td>${a.enabled ? "Activo" : "Inactivo"}</td>
    <td>
      ${
        isMainAdmin
          ? `<span style="color: gray;">Bloqueado</span>`
          : `
            <button class="btn btn-warning" onclick="editAdmin(${a.id}, '${a.username}', ${a.enabled})">Editar</button>
            <button class="btn btn-danger" onclick="deleteAdmin(${a.id})">Eliminar</button>
          `
      }
    </td>`;
  tbody.appendChild(tr);
});
  } catch (err) {
    console.error(err);
  }
}


window.editAdmin = (id, username, enabled) => {
  document.getElementById("adminId").value = id;
  document.getElementById("username").value = username;
  document.getElementById("password").value = "";
  document.getElementById("enabled").value = enabled;
};

async function deleteAdmin(id) {
  if (!confirm("¿Desea eliminar este usuario?")) return;

  try {
    const res = await fetch(`${API_BASE}/admins/${id}`, {
      method: "DELETE",
      headers: { "Authorization": AUTH_HEADER }
    });

    const msg = await res.text();
    showMsg(msg || "Usuario eliminado.", res.ok);
    if (res.ok) loadAdmins();
  } catch (err) {
    console.error(err);
    showMsg("Error al eliminar usuario.", false);
  }
}


document.getElementById("formAdmin").onsubmit = async e => {
  e.preventDefault();

  const id = document.getElementById("adminId").value;
  const admin = {
    username: document.getElementById("username").value,
    password: document.getElementById("password").value,
    enabled: document.getElementById("enabled").value === "true"
  };

  const method = id ? "PUT" : "POST";
  const url = id ? `${API_BASE}/admins/${id}` : `${API_BASE}/admins`;

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": AUTH_HEADER
      },
      body: JSON.stringify(admin)
    });

    const msg = await res.text();
    showMsg(msg || "Usuario guardado.", res.ok);
    if (res.ok) loadAdmins();
  } catch (err) {
    console.error(err);
    showMsg("Error al guardar usuario.", false);
  }
};


// ------------------- FUNCIONES DE BITÁCORA -------------------
async function loadBitacora() {
  try {
    const res = await fetch(`${API_BASE}/audit`, {
      headers: { "Authorization": AUTH_HEADER }
    });

    if (!res.ok) throw new Error("Error al cargar bitácora");
    const logs = await res.json();

    const tbody = document.querySelector("#tblBitacora tbody");
    tbody.innerHTML = "";
    logs.forEach(l => {
      const fecha = l.eventTime ? l.eventTime.replace("T", " ").split(".")[0] : "";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${fecha}</td>
        <td>${l.who}</td>
        <td>${l.action}</td>
        <td>${l.details || ""}</td>`;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    showMsg("Error al cargar bitácora.", false);
  }
}

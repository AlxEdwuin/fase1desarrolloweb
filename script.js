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

/* ======= Helpers ======= */
function makeTrack(r,c,f=false){return Array.from({length:r},()=>Array(c).fill(f));}
function cloneTrack(t){return t.map(row=>row.slice());}
function fromCoords(r,c,coords){
  const t=makeTrack(r,c,false);
  coords.forEach(([rr,cc])=>{ if(rr>=0&&rr<r&&cc>=0&&cc<c) t[rr][cc]=true; });
  return t;
}
function randomPreset(){return cloneTrack(PRESETS[Math.floor(Math.random()*PRESETS.length)]);}

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
  // Marca de verde todas las celdas que conforman la pista
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
  // si no hay celdas verdes, queda en (0,0)
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
  showMsg('¡Misión cumplida! 🎉', true);
  running = false;
}

/* ======= Botones ======= */
document.getElementById('btnRun').onclick = run;
document.getElementById('btnReiniciar').onclick = ()=>{
  if(running) return;
  track = localStorage.getItem('customTrack') ? JSON.parse(localStorage.getItem('customTrack')) : randomPreset();
  paintTrack(); updateStartFromFirstGreen(); clearProgram(); showMsg('Tablero reiniciado.', true);
};
document.getElementById('btnConfig').onclick = ()=>{
  if(running) return;
  configMode = !configMode;
  controls.style.display = configMode ? 'none' : 'flex';
  cfgHint.style.display = configMode ? 'block' : 'none';
  panelTitle.textContent = configMode ? 'Configurar Pista' : 'Movimientos';
};
document.getElementById('btnClear').onclick = clearProgram;
document.getElementById('btnSaveTrack').onclick = ()=>{
  localStorage.setItem('customTrack', JSON.stringify(track));
  showMsg('Pista guardada localmente.', true);
};
document.getElementById('btnRandom').onclick = ()=>{
  if(running) return;
  track = randomPreset();
  paintTrack(); updateStartFromFirstGreen(); clearProgram(); showMsg('Pista aleatoria cargada.', true);
};
controls.querySelectorAll('[data-cmd]').forEach(b=> b.onclick = ()=> addCmd(b.dataset.cmd) );

/* ======= Inicio ======= */
(function init(){
  buildGrid();
  const saved = localStorage.getItem('customTrack');
  track = saved ? JSON.parse(saved) : randomPreset();
  paintTrack();                 
  updateStartFromFirstGreen();  
  applyTransform();
  renderProgram();
})();


const configButtons = document.getElementById('Config-Buttons');
const fileButtons = document.getElementById('fileButtons');

document.getElementById('btnConfig').onclick = ()=>{
  if(running) return;

  
  configMode = !configMode;

  controls.style.display = configMode ? 'none' : 'flex';
  cfgHint.style.display = configMode ? 'block' : 'none';
  panelTitle.textContent = configMode ? 'Configurar Pista' : 'Movimientos';

  configButtons.style.display = configMode ? 'flex' : 'none';
  fileButtons.style.display = configMode ? 'none' : 'flex';

};
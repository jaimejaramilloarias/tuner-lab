import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * TUNER LAB v6.1 — Armónicos & Temperamentos (Optimizado + fix)
 * --------------------------------------------------------------
 * Cambios en 6.1:
 * • FIX: `devColor` definido en ámbito de módulo (usado por TunerLab y Comparador).
 * • TESTS extra: umbrales devColor y verificación 10/9 (E/D con C como fundamental).
 * • Mantiene optimizaciones, audio y funciones de v6.
 */

// ================== Utilidades generales =====================
const LOG2 = Math.log(2);
const toCents = (ratio: number) => 1200 * Math.log(ratio) / LOG2;
const fromCents = (cents: number) => Math.pow(2, cents / 1200);
const log2 = (x: number) => Math.log(x) / LOG2;

function clamp(x:number, a:number, b:number){ return Math.min(b, Math.max(a, x)); }

function signedDelta(refCents: number, targetCents: number) {
  // Diferencia mínima circular (en cents) en el rango [-600, 600)
  let d = targetCents - refCents;
  d = (((d + 600) % 1200) + 1200) % 1200 - 600; // asegurar módulo positivo en JS
  return d;
}

function gcdInt(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) { const t = b; b = a % b; a = t; }
  return a || 1;
}

function reduceFraction(numer: number, denom: number) {
  const g = gcdInt(numer, denom);
  return [numer / g, denom / g];
}

function formatRatio(numer: number, denom: number) {
  if (denom === 1) return `${numer}/1`;
  return `${numer}/${denom}`;
}

// Coloreado por desviación (¢)
const devColor = (c:number)=>{
  const a = Math.abs(c);
  if(a < 5) return "text-emerald-300";     // verde: casi puro
  if(a < 15) return "text-amber-300";      // ámbar: desviación moderada
  return "text-rose-300";                  // rosa: desviación grande
};

// ================== Hook: localStorage simple =================
function useLocalStorage<T>(key:string, initial:T){
  const [state, setState] = useState<T>(()=>{
    try{
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) as T : initial;
    }catch{ return initial; }
  });
  useEffect(()=>{ try{ window.localStorage.setItem(key, JSON.stringify(state)); }catch{} }, [key, state]);
  return [state, setState] as const;
}

// ================== Conversión nota ↔ frecuencia =============
const NOTE_INDEX: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4,
  F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9,
  "A#": 10, Bb: 10, B: 11,
};
const PC_NAMES = ["C","C#/Db","D","D#/Eb","E","F","F#/Gb","G","G#/Ab","A","A#/Bb","B"];

function parseNoteOrHz(input: string, a4 = 440): { freq: number | null, label: string, midi: number | null, pc: number | null } {
  const s = input.trim();
  // Intento 1: frecuencia en Hz
  const asNum = Number(s.replace(",", "."));
  if (!isNaN(asNum) && asNum > 0) {
    return { freq: asNum, label: `${asNum.toFixed(6)} Hz`, midi: null, pc: null };
  }
  // Intento 2: nota tipo C4, F#3, Bb2, etc.
  const m = s.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!m) return { freq: null, label: "", midi: null, pc: null };
  let [, L, acc, octStr] = m;
  const letter = L.toUpperCase();
  const name = acc ? `${letter}${acc}` : letter;
  const idx = NOTE_INDEX[name];
  if (idx == null) return { freq: null, label: "", midi: null, pc: null };
  const octave = parseInt(octStr, 10);
  const midi = (octave + 1) * 12 + idx; // MIDI: C-1 = 0
  const freq = a4 * Math.pow(2, (midi - 69) / 12);
  return { freq, label: `${letter}${acc || ""}${octave}`, midi, pc: (midi % 12 + 12) % 12 };
}

// ================== Temperamento Igual =======================
function equalTempNearest(centsJust: number) {
  const n = Math.round(centsJust / 100); // semitonos más cercano
  const cents = n * 100;
  const ratio = fromCents(cents);
  return { cents, ratio, steps: n };
}

// ================== Pitagórico (3-limit) (con memo) =========
const _pythCache = new Map<number, { cents:number, ratio:number, fraction:string }>();
function nearestPythagorean(centsTarget: number) {
  const key = Math.round(centsTarget*1000);
  const hit = _pythCache.get(key); if(hit) return hit;
  let best = { b: 0, a: 0, cents: 0, ratio: 1, err: Infinity } as { b: number; a: number; cents: number; ratio: number; err: number };
  for (let b = -11; b <= 11; b++) {
    const pow3 = Math.pow(3, b);
    const a = Math.floor(log2(pow3)); // asegura r en [1,2)
    const r = pow3 / Math.pow(2, a);
    let c = toCents(r);
    c = ((c % 1200) + 1200) % 1200;
    const err = Math.abs(signedDelta(centsTarget, c));
    if (err < best.err) best = { b, a, cents: c, ratio: r, err };
  }
  // Construye fracción exacta con enteros positivos
  let numer = 1, denom = 1;
  if (best.b >= 0 && best.a >= 0) { numer = Math.pow(3, best.b); denom = Math.pow(2, best.a); }
  else if (best.b >= 0 && best.a < 0) { numer = Math.pow(3, best.b) * Math.pow(2, -best.a); denom = 1; }
  else if (best.b < 0 && best.a >= 0) { numer = 1; denom = Math.pow(3, -best.b) * Math.pow(2, best.a); }
  else { numer = Math.pow(2, -best.a); denom = Math.pow(3, -best.b); }
  const [rn, rd] = reduceFraction(Math.round(numer), Math.round(denom));
  const fraction = formatRatio(rn, rd);
  const res = { cents: best.cents, ratio: best.ratio, fraction };
  _pythCache.set(key, res);
  return res;
}

// ================== Werckmeister III (con memo) ==============
function werckmeisterIIIPositions(): number[] {
  const pureFifth = toCents(3 / 2); // ≈ 701.955
  const pythComma = 1200 * Math.log(531441 / 524288) / LOG2; // ≈ 23.460
  const quarterComma = pythComma / 4; // ≈ 5.865
  const temperedFifth = pureFifth - quarterComma; // ≈ 696.090
  const sizes: number[] = [
    temperedFifth, temperedFifth, temperedFifth, temperedFifth,
    pureFifth, pureFifth, pureFifth, pureFifth, pureFifth, pureFifth, pureFifth, pureFifth,
  ];
  const cents: number[] = [0];
  let acc = 0;
  for (let i = 0; i < 11; i++) {
    acc += sizes[i];
    let pos = acc % 1200;
    if (pos < 0) pos += 1200;
    cents.push(pos);
  }
  const unique = [...cents].map(x => (x + 1200) % 1200);
  unique.sort((a, b) => a - b);
  return unique;
}
const _w3Cache = new Map<number, {cents:number, ratio:number}>();
function nearestWerckmeister(centsTarget: number, positions: number[]) {
  const key = Math.round(centsTarget*1000);
  const hit = _w3Cache.get(key); if(hit) return hit;
  let best = { idx: 0, cents: positions[0], err: Math.abs(positions[0] - centsTarget) } as {idx:number; cents:number; err:number};
  for (let i = 1; i < positions.length; i++) {
    let err = Math.abs(positions[i] - centsTarget);
    if (err > 600) err = 1200 - err;
    if (err < best.err) best = { idx: i, cents: positions[i], err };
  }
  const ratio = fromCents(best.cents);
  const res = { cents: best.cents, ratio };
  _w3Cache.set(key, res);
  return res;
}

// ================== Conjunto Justo común (y memo) ============
const JUST_SET: {name:string, frac:[number,number]}[] = [
  {name:"1/1 (unísono)", frac:[1,1]},
  {name:"16/15 (2m)", frac:[16,15]},
  {name:"10/9 (2m)", frac:[10,9]},
  {name:"9/8 (2M)", frac:[9,8]},
  {name:"6/5 (3m)", frac:[6,5]},
  {name:"5/4 (3M)", frac:[5,4]},
  {name:"4/3 (4J)", frac:[4,3]},
  {name:"45/32 (TT)", frac:[45,32]},
  {name:"3/2 (5J)", frac:[3,2]},
  {name:"8/5 (6m)", frac:[8,5]},
  {name:"5/3 (6M)", frac:[5,3]},
  {name:"16/9 (7m)", frac:[16,9]},
  {name:"15/8 (7M)", frac:[15,8]},
];
const _justCache = new Map<number, {name:string, frac:[number,number], cents:number}>();
function nearestJust(centsTarget:number){
  const key = Math.round(centsTarget*1000);
  const hit = _justCache.get(key); if(hit) return hit;
  let best = {name:"", frac:[1,1] as [number,number], cents:0, err:1e9};
  for(const j of JUST_SET){
    const c = toCents(j.frac[0]/j.frac[1]);
    let err = Math.abs(signedDelta(centsTarget, c));
    if(err < best.err) best = {name:j.name, frac:j.frac, cents:c, err};
  }
  const res = {name:best.name, frac:best.frac, cents:best.cents};
  _justCache.set(key, res);
  return res;
}

// ================== Audio (Web Audio API) ====================
function useAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const ensure = () => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return ctxRef.current!;
  };

  // Volumen maestro y ADSR
  const masterGainRef = useRef<GainNode | null>(null);
  const ensureMaster = () => {
    const ctx = ensure();
    if (!masterGainRef.current) {
      masterGainRef.current = ctx.createGain();
      masterGainRef.current.gain.value = 0.2;
      masterGainRef.current.connect(ctx.destination);
    }
    return masterGainRef.current!;
  };

  const setMasterVolume = (v:number) => { ensureMaster().gain.value = clamp(v,0,1); };

  type Handle = { osc: OscillatorNode, gain: GainNode };

  const startTone = (freq:number, type:OscillatorType = "triangle", attack=0.01) => {
    const ctx = ensure();
    const master = ensureMaster();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(master);
    const now = ctx.currentTime;
    osc.start(now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(1.0, now + Math.max(attack,0.005));
    return { osc, gain } as Handle;
  };

  const stopTone = (h:Handle, release=0.1) => {
    const ctx = ensure();
    const now = ctx.currentTime;
    h.gain.gain.cancelScheduledValues(now);
    h.gain.gain.setTargetAtTime(0.0001, now, Math.max(release,0.01));
    h.osc.stop(now + Math.max(release,0.01) + 0.05);
  };

  const playOne = async (freq:number, dur=0.8, type:OscillatorType = "triangle", attack=0.01, release=0.12) => {
    const h = startTone(freq, type, attack);
    await new Promise(res => setTimeout(res, Math.max(0, dur*1000)));
    stopTone(h, release);
  };

  const playAB = async (fA: number, fB: number, durEach = 0.7, gap = 0.3, attack=0.01, release=0.12) => {
    await playOne(fA, durEach, "triangle", attack, release);
    await new Promise(res => setTimeout(res, (gap+0.02)*1000));
    await playOne(fB, durEach, "triangle", attack, release);
  };

  return { setMasterVolume, startTone, stopTone, playOne, playAB };
}

// ================== Exportar CSV =============================
function downloadCSV(filename:string, rows: string[][]){
  const csv = rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(()=> URL.revokeObjectURL(url), 5000);
}

// ================== Componente principal =====================
export default function App() {
  const [a4, setA4] = useLocalStorage<number>("tl.a4", 440);
  const [input, setInput] = useLocalStorage<string>("tl.input", "C4");
  const [duration, setDuration] = useLocalStorage<number>("tl.dur", 0.8);
  const [count, setCount] = useLocalStorage<number>("tl.count", 20);
  const [realOctave, setRealOctave] = useLocalStorage<boolean>("tl.realOct", true);
  const [tab, setTab] = useLocalStorage<'arm'|'cmp'>("tl.tab", 'arm');

  // Audio params
  const [volume, setVolume] = useLocalStorage<number>("tl.vol", 0.2);
  const [attack, setAttack] = useLocalStorage<number>("tl.att", 0.015);
  const [release, setRelease] = useLocalStorage<number>("tl.rel", 0.12);
  const [gapAB, setGapAB] = useLocalStorage<number>("tl.gap", 0.35);

  // Menú de visibilidad de columnas (por defecto: solo Justo + Notas)
  const [showNote, setShowNote] = useLocalStorage<boolean>("tl.showNote", true);
  const [showJustRatio, setShowJustRatio] = useLocalStorage<boolean>("tl.showJR", true);
  const [showJustCents, setShowJustCents] = useLocalStorage<boolean>("tl.showJC", true);
  const [showJustHz, setShowJustHz] = useLocalStorage<boolean>("tl.showJH", true);
  const [showEqual, setShowEqual] = useLocalStorage<boolean>("tl.showEI", false);
  const [showPyth, setShowPyth] = useLocalStorage<boolean>("tl.showP", false);
  const [showW3, setShowW3] = useLocalStorage<boolean>("tl.showW3", false);
  const [showDeviations, setShowDeviations] = useLocalStorage<boolean>("tl.showDev", false);

  const { setMasterVolume, playOne, playAB } = useAudio();
  useEffect(()=> setMasterVolume(volume), [volume]);

  const parsed = useMemo(() => parseNoteOrHz(input, a4), [input, a4]);
  const baseFreq = parsed.freq || 261.625565; // fallback C4 ≈ 261.626 Hz
  const basePc = (parsed.pc ?? 0) as number; // 0=C,1=C#, ...

  const w3Positions = useMemo(() => werckmeisterIIIPositions(), []);

  const harmonics = useMemo(() => {
    const rows: any[] = [];
    for (let n = 1; n <= Math.max(1, count); n++) {
      const freqH = baseFreq * n; // Hz del armónico n (Justo, octava real)
      // Octava reducida: n / 2^k ∈ [1,2)
      const k = Math.floor(Math.log2(n));
      const denom = Math.pow(2, k);
      const numer = n;
      const [rn, rd] = reduceFraction(numer, denom);
      const ratioReduced = rn / rd;
      const centsJust = toCents(ratioReduced);

      // Igual / Pitagórico / W3 en octava base
      const eq = equalTempNearest(centsJust);
      const pyth = nearestPythagorean(centsJust);
      const w3 = nearestWerckmeister(centsJust, w3Positions);

      rows.push({
        n,
        harmonicHz: freqH,
        just: { ratio: formatRatio(rn, rd), cents: centsJust, ratioVal: ratioReduced },
        equal: { cents: eq.cents, ratioVal: eq.ratio, freqBase: baseFreq * eq.ratio, delta: signedDelta(centsJust, eq.cents) },
        pyth:  { cents: pyth.cents, ratioVal: pyth.ratio, freqBase: baseFreq * pyth.ratio, delta: signedDelta(centsJust, pyth.cents), fraction: pyth.fraction },
        w3:    { cents: w3.cents, ratioVal: w3.ratio, freqBase: baseFreq * w3.ratio, delta: signedDelta(centsJust, w3.cents) },
      });
    }
    return rows;
  }, [baseFreq, count, w3Positions]);

  const fmt = (x: number, d = 3) => x.toFixed(d);
  const fmtJ = (x: number) => x.toFixed(6); // “exacto” visualmente

  // Exportar CSV armónicos
  const exportHarmonicsCSV = () => {
    const header = ["n","Nota (12-TET)","Razón (J)","Cents (J)","Hz (J)","Hz (EI)","Dev EI (¢)","Hz (P)","3-limit","Dev P (¢)","Hz (W3)","Dev W3 (¢)"];
    const rows: string[][] = [header];
    const basePcLocal = basePc;
    harmonics.forEach((row:any)=>{
      const steps = Math.round(row.just.cents/100);
      const pc = (basePcLocal + steps) % 12; const note = PC_NAMES[(pc+12)%12];
      const jHz = realOctave ? row.harmonicHz : baseFreq * row.just.ratioVal;
      const eqHz = realOctave ? row.harmonicHz * fromCents(row.equal.delta) : row.equal.freqBase;
      const pHz  = realOctave ? row.harmonicHz * fromCents(row.pyth.delta)  : row.pyth.freqBase;
      const wHz  = realOctave ? row.harmonicHz * fromCents(row.w3.delta)    : row.w3.freqBase;
      rows.push([
        String(row.n), note, row.just.ratio, row.just.cents.toFixed(1), fmtJ(jHz),
        fmt(eqHz), row.equal.delta.toFixed(1), fmt(pHz), row.pyth.fraction, row.pyth.delta.toFixed(1), fmt(wHz), row.w3.delta.toFixed(1)
      ]);
    });
    downloadCSV("harmonicos.csv", rows);
  };

  // ================== Pruebas básicas =====================
  useEffect(() => {
    const tol = 0.8;
    const approx = (a: number, b: number, t = tol) => Math.abs(a - b) <= t;
    console.assert(approx(toCents(3/2), 701.955), "toCents(3/2) ≈ 701.955");
    const ei = equalTempNearest(386.3); console.assert(ei.cents === 400, "equalTempNearest(386.3) = 400¢");
    const d = signedDelta(1190, 10); console.assert(approx(d, 20), `signedDelta wrap esperado ~20, obt=${d}`);
    // tests devColor
    console.assert(devColor(0) === 'text-emerald-300', 'devColor <5¢');
    console.assert(devColor(10) === 'text-amber-300', 'devColor 5–15¢');
    console.assert(devColor(25) === 'text-rose-300', 'devColor >15¢');
  }, []);

  // Header helper con tooltip
  const TH = ({children, title}:{children: React.ReactNode; title: string}) => (
    <th className="px-3 py-2 text-left" title={title}>{children}</th>
  );

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-4 flex items-center gap-4">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Tuner Lab · Armónicos & Temperamentos</h1>
          <div className="ml-auto flex gap-2 bg-neutral-900 rounded-xl p-1" title="Pestañas">
            <button className={`px-3 py-1 rounded-lg ${tab==='arm'?'bg-neutral-800':'hover:bg-neutral-800/60'}`} onClick={()=>setTab('arm')}>Armónicos</button>
            <button className={`px-3 py-1 rounded-lg ${tab==='cmp'?'bg-neutral-800':'hover:bg-neutral-800/60'}`} onClick={()=>setTab('cmp')}>Comparador</button>
          </div>
        </header>

        {/* Controles globales audio */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
          <div className="bg-neutral-900 rounded-2xl p-4 shadow" title="Volumen maestro">
            <label className="block text-sm text-neutral-400 mb-1">Volumen</label>
            <input type="range" min={0} max={1} step={0.01} value={volume} onChange={e=>setVolume(parseFloat(e.target.value))} className="w-full" />
          </div>
          <div className="bg-neutral-900 rounded-2xl p-4 shadow" title="Ataque de la envolvente (s)">
            <label className="block text-sm text-neutral-400 mb-1">Ataque (s)</label>
            <input type="number" min={0.005} max={0.3} step={0.005} value={attack} onChange={e=>setAttack(parseFloat(e.target.value))} className="w-full bg-neutral-800 rounded-xl px-3 py-2"/>
          </div>
          <div className="bg-neutral-900 rounded-2xl p-4 shadow" title="Liberación de la envolvente (s)">
            <label className="block text-sm text-neutral-400 mb-1">Liberación (s)</label>
            <input type="number" min={0.05} max={0.8} step={0.01} value={release} onChange={e=>setRelease(parseFloat(e.target.value))} className="w-full bg-neutral-800 rounded-xl px-3 py-2"/>
          </div>
          <div className="bg-neutral-900 rounded-2xl p-4 shadow" title="Pausa entre A/B (s)">
            <label className="block text-sm text-neutral-400 mb-1">Gap A/B (s)</label>
            <input type="number" min={0.1} max={1.0} step={0.05} value={gapAB} onChange={e=>setGapAB(parseFloat(e.target.value))} className="w-full bg-neutral-800 rounded-xl px-3 py-2"/>
          </div>
        </div>

        {tab==='arm' ? (
        <>
        {/* Controles Armónicos */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-6">
          <div className="md:col-span-2 bg-neutral-900 rounded-2xl p-4 shadow">
            <label className="block text-sm text-neutral-400 mb-1">Nota o frecuencia</label>
            <input
              className="w-full bg-neutral-800 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 ring-indigo-500"
              placeholder="C4, A4, 261.63 ..."
              value={input}
              onChange={e => setInput(e.target.value)}
            />
            <div className="mt-2 text-sm text-neutral-400">Interpretado como: <span className="text-neutral-200">{parsed.label || "—"}</span></div>
          </div>

          <div className="bg-neutral-900 rounded-2xl p-4 shadow" title="Frecuencia de referencia para A4 (MIDI 69)">
            <label className="block text-sm text-neutral-400 mb-1">A4 (Hz)</label>
            <input
              type="number"
              className="w-full bg-neutral-800 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 ring-indigo-500"
              value={a4}
              min={380}
              max={466}
              step={0.1}
              onChange={e => setA4(parseFloat(e.target.value))}
            />
          </div>

          <div className="bg-neutral-900 rounded-2xl p-4 shadow" title="Duración de cada nota reproducida">
            <label className="block text-sm text-neutral-400 mb-1">Duración (s)</label>
            <input
              type="number"
              className="w-full bg-neutral-800 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 ring-indigo-500"
              value={duration}
              min={0.2}
              max={3}
              step={0.1}
              onChange={e => setDuration(parseFloat(e.target.value))}
            />
            <label className="block text-sm text-neutral-400 mb-1 mt-3">Armónicos</label>
            <input
              type="number"
              className="w-full bg-neutral-800 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 ring-indigo-500"
              value={count}
              min={5}
              max={40}
              step={1}
              onChange={e => setCount(parseInt(e.target.value || "20", 10))}
            />
          </div>

          <div className="bg-neutral-900 rounded-2xl p-4 shadow" title="Define si todo suena en la octava real del parcial (n·f₀) o en la octava base [1,2)">
            <label className="block text-sm text-neutral-400 mb-1">Reproducción</label>
            <div className="flex items-center gap-2">
              <input id="realOctave" type="checkbox" className="h-4 w-4" checked={realOctave} onChange={(e)=>setRealOctave(e.target.checked)} />
              <label htmlFor="realOctave" className="text-sm">Usar <b>octava real</b> (desactiva para octava base)</label>
            </div>
            <p className="text-xs text-neutral-400 mt-2">Octava real: Justo = n·f₀; EI/Pit/W3 = n·f₀ × 2^(desviación/1200). Octava base: todos como intervalo reducido.</p>
          </div>

          {/* Menú de columnas */}
          <div className="md:col-span-2 bg-neutral-900 rounded-2xl p-4 shadow" title="Elige qué columnas mostrar en la tabla">
            <label className="block text-sm text-neutral-400 mb-2">Ver columnas</label>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={showNote} onChange={e=>setShowNote(e.target.checked)} />Notas (12-TET)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showJustRatio} onChange={e=>setShowJustRatio(e.target.checked)} />Razón (J)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showJustCents} onChange={e=>setShowJustCents(e.target.checked)} />Cents (J)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showJustHz} onChange={e=>setShowJustHz(e.target.checked)} />Hz (J)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showEqual} onChange={e=>setShowEqual(e.target.checked)} />Temperamento Igual</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showPyth} onChange={e=>setShowPyth(e.target.checked)} />Pitagórico</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showW3} onChange={e=>setShowW3(e.target.checked)} />Werckmeister III</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showDeviations} onChange={e=>setShowDeviations(e.target.checked)} />Desviaciones (¢)</label>
            </div>
            <div className="mt-3 flex gap-2">
              <button className="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700" onClick={exportHarmonicsCSV} title="Exporta la tabla actual a CSV">Exportar CSV</button>
            </div>
            <p className="mt-2 text-xs text-neutral-500">Colores: <span className="text-emerald-300">&lt;5¢</span>, <span className="text-amber-300">5–15¢</span>, <span className="text-rose-300">&gt;15¢</span>.</p>
          </div>
        </div>

        {/* Tabla Armónicos */}
        <div className="overflow-x-auto bg-neutral-900 rounded-2xl shadow">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-neutral-900/95 backdrop-blur">
              <tr className="text-neutral-300">
                <TH title="# de armónico (n)">#</TH>
                {showNote && <TH title="Nombre de nota aproximado en 12-TET, relativo a la fundamental">Nota (12-TET)</TH>}
                {showJustRatio && <TH title="Intervalo del n-ésimo armónico octava-reducido (n/2^k)">Razón (Justo)</TH>}
                {showJustCents && <TH title="Tamaño del intervalo Justo respecto a la fundamental (en cents)">Cents (J)</TH>}
                {showJustHz && <TH title="Frecuencia del Justo (exacta): octava real = n·f₀; octava base = f₀×(n/2^k)">Hz (J, exacto)</TH>}

                {showEqual && <TH title="Frecuencia en temperamento igual (12-TET) para el mismo grado">Igual: Hz</TH>}
                {showDeviations && showEqual && <TH title="Diferencia en cents entre Igual y Justo (mínima, con signo)">Desv. EI vs J (¢)</TH>}

                {showPyth && <TH title="Frecuencia pitagórica (3-limit) más cercana al grado Justo">Pitagórico: Hz</TH>}
                {showPyth && <TH title="Razón 3-limit equivalente (2^a·3^b) reducida a fracción">(3-limit) razón</TH>}
                {showDeviations && showPyth && <TH title="Diferencia en cents entre Pitagórico y Justo (mínima, con signo)">Desv. P vs J (¢)</TH>}

                {showW3 && <TH title="Frecuencia en Werckmeister III para el grado más cercano">W3: Hz</TH>}
                {showDeviations && showW3 && <TH title="Diferencia en cents entre W3 y Justo (mínima, con signo)">Desv. W3 vs J (¢)</TH>}

                <TH title="Botones para escuchar (y A/B si el sistema está activo)">Escuchar</TH>
              </tr>
            </thead>
            <tbody>
              {harmonics.map((row:any) => {
                const jHz = realOctave ? row.harmonicHz : baseFreq * row.just.ratioVal;
                const eqHz = realOctave ? row.harmonicHz * fromCents(row.equal.delta) : row.equal.freqBase;
                const pythHz = realOctave ? row.harmonicHz * fromCents(row.pyth.delta) : row.pyth.freqBase;
                const w3Hz = realOctave ? row.harmonicHz * fromCents(row.w3.delta) : row.w3.freqBase;
                const steps = Math.round(row.just.cents / 100);
                const pc = (basePc + steps) % 12;
                const noteName = PC_NAMES[(pc + 12) % 12];
                return (
                <tr key={row.n} className="border-t border-neutral-800 hover:bg-neutral-800/50">
                  <td className="px-3 py-2 font-medium text-neutral-200">{row.n}</td>
                  {showNote && <td className="px-3 py-2">{noteName}</td>}
                  {showJustRatio && <td className="px-3 py-2 font-mono">{row.just.ratio}</td>}
                  {showJustCents && <td className="px-3 py-2">{row.just.cents.toFixed(1)} ¢</td>}
                  {showJustHz && <td className="px-3 py-2">{fmtJ(jHz)}</td>}

                  {showEqual && <td className="px-3 py-2">{fmt(eqHz, 3)}</td>}
                  {showDeviations && showEqual && <td className={`px-3 py-2 ${devColor(row.equal.delta)}`}>{row.equal.delta.toFixed(1)} ¢</td>}

                  {showPyth && <td className="px-3 py-2">{fmt(pythHz, 3)}</td>}
                  {showPyth && <td className="px-3 py-2 font-mono">{row.pyth.fraction}</td>}
                  {showDeviations && showPyth && <td className={`px-3 py-2 ${devColor(row.pyth.delta)}`}>{row.pyth.delta.toFixed(1)} ¢</td>}

                  {showW3 && <td className="px-3 py-2">{fmt(w3Hz, 3)}</td>}
                  {showDeviations && showW3 && <td className={`px-3 py-2 ${devColor(row.w3.delta)}`}>{row.w3.delta.toFixed(1)} ¢</td>}

                  <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                    <button className="px-2 py-1 rounded-xl bg-indigo-600/80 hover:bg-indigo-500 text-white" onClick={() => playOne(jHz, duration)} title="Justo (armónico)">J ▶</button>
                    {showEqual && <button className="px-2 py-1 rounded-xl bg-emerald-600/80 hover:bg-emerald-500 text-white" onClick={() => playOne(eqHz, duration)} title="Temperamento igual">EI ▶</button>}
                    {showPyth && <button className="px-2 py-1 rounded-xl bg-amber-600/80 hover:bg-amber-500 text-white" onClick={() => playOne(pythHz, duration)} title="Pitagórico">P ▶</button>}
                    {showW3 && <button className="px-2 py-1 rounded-xl bg-rose-600/80 hover:bg-rose-500 text-white" onClick={() => playOne(w3Hz, duration)} title="Werckmeister III">W3 ▶</button>}

                    {showEqual && <button className="px-2 py-1 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-white" onClick={() => playAB(jHz, eqHz, duration, gapAB)} title="A/B: Justo vs Igual">J⇄EI</button>}
                    {showPyth && <button className="px-2 py-1 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-white" onClick={() => playAB(jHz, pythHz, duration, gapAB)} title="A/B: Justo vs Pitagórico">J⇄P</button>}
                    {showW3 && <button className="px-2 py-1 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-white" onClick={() => playAB(jHz, w3Hz, duration, gapAB)} title="A/B: Justo vs Werckmeister III">J⇄W3</button>}
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-xs text-neutral-400 space-y-1">
          <p>• <b>Razón (J)</b>: intervalo del armónico n octava-reducido a [1,2). <b>Cents (J)</b>: tamaño de ese intervalo en cents.</p>
          <p>• <b>Hz (J)</b>: frecuencia del parcial (octava real) o del intervalo reducido (octava base). Mostrado a 6 decimales.</p>
          <p>• <b>Igual/Pitagórico/W3</b>: frecuencia en el sistema seleccionado para el mismo grado. <b>Desv.</b>: diferencia en cents contra Justo (mínima y con signo).</p>
        </div>
        </>
        ) : (
        // ================== COMPARADOR ==================
        <Comparador a4={a4} gapAB={gapAB} attack={attack} release={release} />
        )}

        <footer className="mt-6 text-xs text-neutral-500 text-right">
          Desarrollado por <b>Jaime Jaramillo Arias</b> — <b>UNIVERSIDAD DE CALDAS</b>
        </footer>
      </div>
    </div>
  );
}

// ================== Comparador ==================
function Comparador({a4, gapAB, attack, release}:{a4:number; gapAB:number; attack:number; release:number}){
  const [fund, setFund] = useLocalStorage<string>('cmp.fund','E4');
  const [targets, setTargets] = useLocalStorage<string>('cmp.targets','D#4');
  const [sys, setSys] = useLocalStorage<'just'|'equal'|'pyth'|'w3'>('cmp.sys','just');
  const [realOct, setRealOct] = useLocalStorage<boolean>('cmp.real', false);
  const [distMode, setDistMode] = useLocalStorage<'previous'|'first'>('cmp.dist','previous');

  const { playOne, playAB } = useAudio();

  const w3Positions = useMemo(() => werckmeisterIIIPositions(), []);

  const fFund = useMemo(()=> parseNoteOrHz(fund, a4).freq ?? 440, [fund, a4]);
  const list = useMemo(()=> targets.split(/[\\,\\s]+/).filter(Boolean), [targets]);

  type Row = {
    target: string; hzTarget: number; centsEI: number; ratioRed: number;
    sysName: string; sysFrac: string; sysCents: number; sysHz: number; dev: number;
    distFrac: string | null; distCents: number | null;
  };

  const rows: Row[] = useMemo(()=>{
    const out:Row[] = [];
    let firstSysRatio: number | null = null; let firstFrac: {n:number,d:number}|null = null;
    let prevSysRatio: number | null = null; let prevFrac: {n:number,d:number}|null = null;

    for(const t of list){
      const parsed = parseNoteOrHz(t, a4);
      if(!parsed.freq) continue;
      const f = parsed.freq;
      const ratioAbs = f / fFund;
      // Reducir a [1,2)
      const oct = Math.floor(log2(ratioAbs));
      const ratioRed = ratioAbs / Math.pow(2, oct);
      const centsEI = toCents(ratioRed);

      // Proyección al sistema elegido
      let sysRatio = ratioRed; let sysCents = centsEI; let sysName = ''; let sysFrac = ''; let sysFracPair: {n:number,d:number}|null = null;
      if(sys === 'equal'){
        const eq = equalTempNearest(centsEI); sysRatio = eq.ratio; sysCents = eq.cents; sysName = `${(eq.cents/100)|0} st`; sysFrac = `2^( ${eq.cents}/1200 )`;
      } else if(sys === 'just'){
        const j = nearestJust(centsEI); sysRatio = j.frac[0]/j.frac[1]; sysCents = j.cents; sysName = j.name; sysFrac = `${j.frac[0]}/${j.frac[1]}`; sysFracPair = {n:j.frac[0], d:j.frac[1]};
      } else if(sys === 'pyth'){
        const p = nearestPythagorean(centsEI); sysRatio = p.ratio; sysCents = p.cents; sysName = '3-limit'; sysFrac = p.fraction; const mf=p.fraction.split('/'); if(mf.length===2){ const n=parseInt(mf[0],10), d=parseInt(mf[1],10); if(Number.isFinite(n)&&Number.isFinite(d)) sysFracPair={n,d}; }
      } else if(sys === 'w3'){
        const w = nearestWerckmeister(centsEI, w3Positions); sysRatio = w.ratio; sysCents = w.cents; sysName = 'Werckmeister III'; sysFrac = `2^( ${w.cents.toFixed(1)}/1200 )`;
      }

      const sysHzBase = fFund * sysRatio; // octava base
      const sysHz = realOct ? sysHzBase * Math.pow(2, oct) : sysHzBase; // iguala octava del objetivo si realOct
      const dev = signedDelta(sysCents, centsEI); // EI − Sistema

      // Distancia según modo
      let refRatio: number | null = null; let refFrac: {n:number,d:number}|null = null;
      if(distMode==='previous'){ refRatio = prevSysRatio; refFrac = prevFrac; }
      else { refRatio = firstSysRatio; refFrac = firstFrac; }

      let distFrac: string | null = null; let distCents: number | null = null;
      if(refRatio != null){
        let rDist: number;
        if(sysFracPair && refFrac){
          const num = sysFracPair.n * refFrac.d; const den = sysFracPair.d * refFrac.n; const [rn, rd] = reduceFraction(num, den);
          rDist = rn/rd; const k = Math.floor(log2(rDist)); rDist /= Math.pow(2, k); distFrac = `${rn}/${rd}`; distCents = toCents(rDist);
        } else {
          rDist = sysRatio / refRatio; const k = Math.floor(log2(rDist)); rDist /= Math.pow(2, k); distCents = toCents(rDist); distFrac = `2^( ${distCents.toFixed(1)}/1200 )`;
        }
      }

      out.push({ target: parsed.label || t, hzTarget: f, centsEI, ratioRed, sysName, sysFrac, sysCents, sysHz, dev, distFrac, distCents });

      if(firstSysRatio==null) { firstSysRatio = sysRatio; firstFrac = sysFracPair; }
      prevSysRatio = sysRatio; prevFrac = sysFracPair;
    }
    return out;
  }, [list, a4, fFund, sys, w3Positions, realOct, distMode]);

  // Export CSV comparador
  const exportCmpCSV = () => {
    const header = ["Objetivo","Hz (objetivo)","Cents (EI)","Grado (sist)","Razón (sist)","Cents (sist)","Hz (sist)","Desv EI−S (¢)","Dist (razón)","Dist (¢)"];
    const data = rows.map(r=>[
      r.target, r.hzTarget.toFixed(6), r.centsEI.toFixed(1), r.sysName, r.sysFrac, r.sysCents.toFixed(1), r.sysHz.toFixed(6), r.dev.toFixed(1), r.distFrac ?? '—', r.distCents!=null? r.distCents.toFixed(1): '—'
    ]);
    downloadCSV("comparador.csv", [header, ...data]);
  };

  // Reproducción helpers
  const playFund = (dur=0.8)=> playOne(fFund, dur, 'triangle', attack, release);

  // Tests extra específicos del Comparador (solo una vez)
  useEffect(()=>{
    // Verifica 10/9 entre E y D con C como fundamental en Justo (aprox)
    const f0 = parseNoteOrHz('C4', 440).freq!;
    const e = parseNoteOrHz('E4', 440).freq!;
    const d = parseNoteOrHz('D4', 440).freq!;
    const rE = (e/f0) / Math.pow(2, Math.floor(log2(e/f0))); // ~5/4
    const rD = (d/f0) / Math.pow(2, Math.floor(log2(d/f0))); // ~9/8
    const rED = rE/rD; const k = Math.floor(log2(rED)); const red = rED/Math.pow(2,k);
    const approx = Math.abs(red - (10/9)) < 0.02;
    console.assert(approx, `Se espera 10/9 ~ 1.111..., obt=${red}`);
  }, []);

  return (
    <div className="bg-neutral-900 rounded-2xl p-4 shadow">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
        <div title="Define la referencia 1/1 para el análisis (nota o Hz)">
          <label className="block text-sm text-neutral-400 mb-1">Fundamental</label>
          <input className="w-full bg-neutral-800 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 ring-indigo-500" value={fund} onChange={e=>setFund(e.target.value)} placeholder="E4 o 329.627" />
          <div className="mt-2 flex gap-2">
            <button className="px-2 py-1 rounded-xl bg-indigo-600/80 hover:bg-indigo-500 text-white" onClick={()=>playFund()} title="Reproducir fundamental">f₀ ▶</button>
            <button className="px-2 py-1 rounded-xl bg-neutral-800 hover:bg-neutral-700" onClick={exportCmpCSV} title="Exportar resultados a CSV">Exportar CSV</button>
          </div>
        </div>
        <div className="md:col-span-2" title="Lista de objetivos a comparar respecto a la fundamental">
          <label className="block text-sm text-neutral-400 mb-1">Objetivos (separados por coma o espacio)</label>
          <input className="w-full bg-neutral-800 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 ring-indigo-500" value={targets} onChange={e=>setTargets(e.target.value)} placeholder="D#4, G5, 500 ..." />
          <p className="text-xs text-neutral-500 mt-1">Ej.: “D# de E” ⇒ fundamental = E, objetivo = D#.</p>
        </div>
        <div title="Elige el sistema para proyectar los intervalos y mostrar sus Hz/cents">
          <label className="block text-sm text-neutral-400 mb-1">Sistema</label>
          <select className="w-full bg-neutral-800 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 ring-indigo-500" value={sys} onChange={e=>setSys(e.target.value as any)}>
            <option value="just">Justo</option>
            <option value="equal">Igual (12-TET)</option>
            <option value="pyth">Pitagórico (3-limit)</option>
            <option value="w3">Werckmeister III</option>
          </select>
          <div className="mt-2 flex items-center gap-2" title="Empareja la octava del sistema con la del objetivo">
            <input type="checkbox" id="cmpRealOct" className="h-4 w-4" checked={realOct} onChange={e=>setRealOct(e.target.checked)} />
            <label htmlFor="cmpRealOct" className="text-sm">Usar <b>octava real</b></label>
          </div>
        </div>
        <div title="Cómo calcular la columna de distancia entre objetivos">
          <label className="block text-sm text-neutral-400 mb-1">Distancia entre objetivos</label>
          <select className="w-full bg-neutral-800 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 ring-indigo-500" value={distMode} onChange={e=>setDistMode(e.target.value as any)}>
            <option value="previous">Con el anterior</option>
            <option value="first">Con el primero</option>
          </select>
          <p className="text-xs text-neutral-500 mt-1">Se calcula <i>en el sistema</i> elegido y se reduce a [1,2).</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-neutral-300">
              <th className="px-3 py-2 text-left" title="Objetivo a comparar con la fundamental">Objetivo</th>
              <th className="px-3 py-2 text-left" title="Frecuencia real del objetivo (según su nombre o Hz)">Hz (objetivo)</th>
              <th className="px-3 py-2 text-left" title="Intervalo EI del objetivo respecto a la fundamental (octava-reducido)">Cents (EI)</th>
              <th className="px-3 py-2 text-left" title="Grado elegido en el sistema seleccionado">Grado (sistema)</th>
              <th className="px-3 py-2 text-left" title="Razón del sistema elegido para ese grado">Razón (sistema)</th>
              <th className="px-3 py-2 text-left" title="Cents del sistema para ese grado">Cents (sistema)</th>
              <th className="px-3 py-2 text-left" title="Frecuencia proyectada por el sistema para ese grado (sobre la fundamental)">Hz (sistema)</th>
              <th className="px-3 py-2 text-left" title="Diferencia mínima en cents entre EI y el sistema (signada)">Desv. EI−S (¢)</th>
              <th className="px-3 py-2 text-left" title={`Distancia ${distMode==='previous'?'con el objetivo anterior':'con el primero'} en el sistema (razón/cents)`}>Dist. ({distMode==='previous'? 'con anterior':'con primero'})</th>
              <th className="px-3 py-2 text-left" title="Escuchar fundamental, objetivo, proyección de sistema y A/B">Escuchar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i)=> (
              <tr key={i} className="border-t border-neutral-800 hover:bg-neutral-800/50">
                <td className="px-3 py-2">{r.target}</td>
                <td className="px-3 py-2">{r.hzTarget.toFixed(6)}</td>
                <td className="px-3 py-2">{r.centsEI.toFixed(1)}</td>
                <td className="px-3 py-2">{r.sysName}</td>
                <td className="px-3 py-2 font-mono">{r.sysFrac}</td>
                <td className="px-3 py-2">{r.sysCents.toFixed(1)}</td>
                <td className="px-3 py-2">{r.sysHz.toFixed(6)}</td>
                <td className={`px-3 py-2 ${devColor(r.dev)}`}>{r.dev.toFixed(1)}</td>
                <td className="px-3 py-2" title={i===0 && distMode==='previous' ? 'Primera fila: no hay referencia' : ''}>
                  { (i===0 && distMode==='previous') ? '—' : (<>
                    <span className="font-mono">{r.distFrac ?? '—'}</span>
                    <span className="text-neutral-400">&nbsp;{r.distCents!=null? `(~${r.distCents.toFixed(1)} ¢)` : ''}</span>
                  </>) }
                </td>
                <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                  <button className="px-2 py-1 rounded-xl bg-indigo-600/80 hover:bg-indigo-500 text-white" onClick={()=> playOne(fFund, 0.8)} title="Fundamental">f₀ ▶</button>
                  <button className="px-2 py-1 rounded-xl bg-sky-600/80 hover:bg-sky-500 text-white" onClick={()=> playOne(r.hzTarget, 0.8)} title="Objetivo real">Obj ▶</button>
                  <button className="px-2 py-1 rounded-xl bg-emerald-600/80 hover:bg-emerald-500 text-white" onClick={()=> playOne(r.sysHz, 0.8)} title="Proyección del sistema">Sist ▶</button>
                  <button className="px-2 py-1 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-white" onClick={()=> playAB(r.hzTarget, r.sysHz, 0.7, gapAB)} title="A/B objetivo vs sistema">Obj⇄S</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

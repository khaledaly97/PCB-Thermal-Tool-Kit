import React, { useMemo, useState } from "react";

// PCB Thermal Toolkit — single-file React component
// TailwindCSS styling; shadcn/ui not required. Paste into your project and render <PcbThermalToolkit />
// Calculators included:
// 1) IPC-2221 Trace Width (ΔT-based) + resistance & power loss
// 2) Copper resistance vs. temperature (with alpha)
// 3) Thermal via array conductive resistance (vertical)
// All units are SI-first; helpers show common PCB units.
// DISCLAIMER: These are engineering estimates based on public formulas (IPC-2221 curve-fit, basic materials physics).
// Always validate against lab measurements and your fab’s capabilities.

export default function PcbThermalToolkit() {
  return (
    <div className="w-full max-w-5xl mx-auto p-6 space-y-8">
      <Header />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="IPC‑2221 Trace Width (ΔT target)">
          <Ipc2221Calculator />
        </SectionCard>
        <SectionCard title="Copper Resistance vs Temperature">
          <CopperTempCalculator />
        </SectionCard>
        <SectionCard title="Thermal Via Array – Vertical Conduction Rth">
          <ThermalViaCalculator />
        </SectionCard>
        <SectionCard title="Quick Notes & Tips">
          <Notes />
        </SectionCard>
      </div>
      <Resources />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <div className="space-y-2">
      <h1 className="text-3xl font-bold tracking-tight">PCB Thermal Toolkit</h1>
      <p className="text-gray-600">Fast, unit‑aware calculators for trace sizing (IPC‑2221), copper losses, and thermal‑via conduction. Built to complement Altium workflows.</p>
    </div>
  );
}

function Footer() {
  return (
    <div className="text-xs text-gray-500 border-t pt-4">
      <p>Use responsibly. Verify with prototypes, IR measurements, and your fabricator’s rules. IPC‑2152 provides richer guidance than IPC‑2221 curves; use it when available.</p>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div className="bg-white border rounded-2xl shadow-sm p-5 space-y-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </div>
  );
}

// === Helpers (pure JS, no TS types) ===
const mmToMil = (mm) => mm / 0.0254;
const milToMm = (mil) => mil * 0.0254;
const ozToMm  = (oz) => oz * 0.0348; // 1 oz/ft^2 ≈ 34.8 µm


// IPC‑2221 parameters (curve‑fit to legacy charts)
const IPC_B = 0.44;
const IPC_C = 0.725;
const K_EXT = 0.048; // external
const K_INT = 0.024; // internal

// Copper properties (room temp)
const RHO_CU_20C = 1.68e-8; // Ω·m (HyperPhysics typical ETP copper)
const ALPHA_CU = 0.0039; // 1/°C temp coefficient around 20–25 °C
const K_CU = 385; // W/m·K thermal conductivity (typical)

function NumberField({ label, value, onChange, suffix, step = 0.01, min, max }) {
  return (
    <label className="grid grid-cols-[1fr_auto] gap-2 items-center text-sm mb-2">
      <span className="text-gray-700">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-32 px-2 py-1 border rounded-md"
          step={step}
          min={min}
          max={max}
        />
        {suffix && <span className="text-gray-500">{suffix}</span>}
      </div>
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="grid grid-cols-[1fr_auto] gap-2 items-center text-sm mb-2">
      <span className="text-gray-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-32 px-2 py-1 border rounded-md"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

// ===== 1) IPC‑2221 Calculator =====
function Ipc2221Calculator() {
  const [current, setCurrent] = useState(30); // A
  const [tempRise, setTempRise] = useState(10); // °C
  const [layer, setLayer] = useState("external");
  const [thicknessOz, setThicknessOz] = useState(2); // oz/ft^2
  const [length, setLength] = useState(50); // mm
  const [ambient, setAmbient] = useState(25); // °C

  const results = useMemo(() => {
    const k = layer === "external" ? K_EXT : K_INT;
    // Area [mils^2] from IPC‑2221 curve‑fit: I = k * (ΔT)^b * A^c  => A = (I/(k*ΔT^b))^(1/c)
    const area_mils2 = Math.pow(current / (k * Math.pow(tempRise, IPC_B)), 1 / IPC_C);
    const t_mm = ozToMm(thicknessOz);
    const width_mil = area_mils2 / (thicknessOz * 1.378); // 1 oz ≈ 1.378 mil thickness
    const width_mm = milToMm(width_mil);

    // Resistance @ 20°C and at (ambient + ΔT)
    const crossSection_m2 = (t_mm / 1000) * (width_mm / 1000);
    const length_m = length / 1000;
    const R20 = length_m * RHO_CU_20C / (crossSection_m2 || 1e-18);
    const topTemp = ambient + tempRise;
    const R_T = R20 * (1 + ALPHA_CU * (topTemp - 20));

    const P20 = current * current * R20;
    const P_T = current * current * R_T;
    const J = current / (crossSection_m2 || 1e-18); // A/m^2

    return {
      width_mm, width_mil, area_mils2, R20, R_T, P20, P_T, J,
    };
  }, [current, tempRise, layer, thicknessOz, length, ambient]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <SelectField
          label="Layer"
          value={layer}
          onChange={setLayer}
          options={[{ value: "external", label: "External" }, { value: "internal", label: "Internal" }]}
        />
        <NumberField label="Current" value={current} onChange={setCurrent} suffix="A" />
        <NumberField label="Allowable ΔT" value={tempRise} onChange={setTempRise} suffix="°C" />
        <NumberField label="Copper thickness" value={thicknessOz} onChange={setThicknessOz} suffix="oz" step={0.5} />
        <NumberField label="Trace length" value={length} onChange={setLength} suffix="mm" />
        <NumberField label="Ambient (estimate)" value={ambient} onChange={setAmbient} suffix="°C" />
      </div>
      <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
        <p><span className="font-medium">Required width:</span> {results.width_mm.toFixed(3)} mm ({results.width_mil.toFixed(1)} mil)</p>
        <p><span className="font-medium">Cross‑section @ {thicknessOz} oz:</span> {(ozToMm(thicknessOz)/1000 * results.width_mm/1000 * 1e12).toFixed(2)} mm²</p>
        <p><span className="font-medium">R @ 20°C:</span> {results.R20.toExponential(3)} Ω; <span className="font-medium">R @ {ambient + tempRise}°C:</span> {results.R_T.toExponential(3)} Ω</p>
        <p><span className="font-medium">I²R loss @ 20°C:</span> {results.P20.toFixed(3)} W; <span className="font-medium">@ {ambient + tempRise}°C:</span> {results.P_T.toFixed(3)} W</p>
        <p><span className="font-medium">Current density:</span> {(results.J/1e6).toFixed(1)} A/mm²</p>
        <p className="text-gray-500">Notes: IPC‑2221 is conservative/legacy; IPC‑2152 with geometry & environment often gives wider traces for the same ΔT. Use this as a first‑pass check.</p>
      </div>
    </div>
  );
}

// ===== 2) Copper Resistance vs Temperature =====
function CopperTempCalculator() {
  const [rho20, setRho20] = useState(RHO_CU_20C); // Ω·m
  const [alpha, setAlpha] = useState(ALPHA_CU); // 1/°C
  const [t1, setT1] = useState(20);
  const [t2, setT2] = useState(80);
  const [length, setLength] = useState(100); // mm
  const [width, setWidth] = useState(3); // mm
  const [thickness, setThickness] = useState(0.070); // mm (≈2 oz)

  const res = useMemo(() => {
    const A = (width/1000) * (thickness/1000);
    const L = length/1000;
    const R1 = (rho20 * (1 + alpha * (t1 - 20))) * L / (A || 1e-18);
    const R2 = (rho20 * (1 + alpha * (t2 - 20))) * L / (A || 1e-18);
    return { A, L, R1, R2 };
  }, [rho20, alpha, t1, t2, length, width, thickness]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <NumberField label="ρ at 20°C" value={rho20} onChange={setRho20} suffix="Ω·m" step={1e-10} />
        <NumberField label="α (temp coeff)" value={alpha} onChange={setAlpha} suffix="1/°C" step={0.0001} />
        <NumberField label="T1" value={t1} onChange={setT1} suffix="°C" />
        <NumberField label="T2" value={t2} onChange={setT2} suffix="°C" />
        <NumberField label="Length" value={length} onChange={setLength} suffix="mm" />
        <NumberField label="Width" value={width} onChange={setWidth} suffix="mm" />
        <NumberField label="Thickness" value={thickness} onChange={setThickness} suffix="mm" step={0.01} />
      </div>
      <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
        <p><span className="font-medium">Cross‑section:</span> {(res.A*1e6).toFixed(2)} mm²</p>
        <p><span className="font-medium">R @ {t1}°C:</span> {res.R1.toExponential(3)} Ω</p>
        <p><span className="font-medium">R @ {t2}°C:</span> {res.R2.toExponential(3)} Ω</p>
        <p className="text-gray-500">R(T) = R(20°C)·[1 + α·(T − 20°C)] with α≈0.0039 1/°C for copper near room temp.</p>
      </div>
    </div>
  );
}

// ===== 3) Thermal Via Array Calculator =====
function ThermalViaCalculator() {
  const [n, setN] = useState(16); // via count
  const [hole, setHole] = useState(0.3); // mm finished drill
  const [plate, setPlate] = useState(0.025); // mm plating thickness (~1 oz annular)
  const [boardT, setBoardT] = useState(1.6); // mm
  const [kCu, setKCu] = useState(K_CU); // W/mK

  const res = useMemo(() => {
    // Effective copper cross‑section of one via barrel: A = π/4 * (Do^2 − Di^2), where Do = hole + 2*plate
    const Do = hole + 2*plate; // mm
    const Di = hole; // mm
    const A_via_mm2 = Math.PI/4 * (Do*Do - Di*Di);
    const A_total_m2 = (A_via_mm2 * n) * 1e-6; // mm^2 → m^2
    const L = boardT / 1000; // m
    const Rth_cond = L / ((kCu) * (A_total_m2 || 1e-18)); // K/W (vertical conduction through via copper)

    return { Do, Di, A_via_mm2, A_total_m2, Rth_cond };
  }, [n, hole, plate, boardT, kCu]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <NumberField label="Via count" value={n} onChange={setN} />
        <NumberField label="Finished hole (Di)" value={hole} onChange={setHole} suffix="mm" step={0.05} />
        <NumberField label="Plating thickness" value={plate} onChange={setPlate} suffix="mm" step={0.005} />
        <NumberField label="Board thickness" value={boardT} onChange={setBoardT} suffix="mm" step={0.1} />
        <NumberField label="k of copper" value={kCu} onChange={setKCu} suffix="W/m·K" step={1} />
      </div>
      <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
        <p><span className="font-medium">One‑via copper area:</span> {res.A_via_mm2.toFixed(4)} mm² (Do={res.Do.toFixed(3)} mm)</p>
        <p><span className="font-medium">Total copper area:</span> {(res.A_total_m2*1e6).toFixed(2)} mm²</p>
        <p><span className="font-medium">Vertical conductive Rθ (via copper only):</span> {res.Rth_cond.toFixed(3)} K/W</p>
        <p className="text-gray-500">Note: This ignores spreading resistance in planes, pad/land contact resistance, solder fill, and dielectric conduction. Treat as a lower‑bound. Add vias and copper pour to reduce total Rθ.</p>
      </div>
    </div>
  );
}

function Notes() {
  return (
    <ul className="list-disc pl-5 text-sm text-gray-700 space-y-2">
      <li>IPC‑2221 is a legacy curve‑fit; IPC‑2152 (with environment, copper planes, adjacency) is more accurate for ampacity. Use ΔT ≤ 10–20°C for conservative designs.</li>
      <li>For high current rails, prefer short, wide copper pours, parallel paths, and stitched planes. Current density & hotspots dominate Joule heating (I²R).</li>
      <li>Thermal vias work best when tightly packed under the heat source (e.g., 0.3–0.4 mm drills, ~1.0–1.2 mm pitch) and tied to large internal/external planes.</li>
      <li>Validate with IR camera or thermocouples in worst‑case ambient. Consider airflow, enclosure, and nearby hot components.</li>
    </ul>
  );
}

function Resources() {
  const items = [
    { label: "Digi‑Key IPC‑2221 Trace Width Calculator (formulas)", href: "https://www.digikey.com/en/resources/conversion-calculators/conversion-calculator-pcb-trace-width" },
    { label: "Avnet PCB Trace Width Calculator (formulas shown)", href: "https://www.avnet.com/americas/solutions/product-and-solutions-design/design-hub/design-tools/calculators/pcb-trace-width/" },
    { label: "IPC‑2221 excerpt showing I = k·ΔT^0.44·A^0.725", href: "https://www-eng.lbl.gov/~shuman/NEXT/CURRENT_DESIGN/TP/MATERIALS/IPC-2221A%28L%29.pdf" },
    { label: "HyperPhysics – Copper resistivity & α", href: "https://hyperphysics.phy-astr.gsu.edu/hbase/Tables/rstiv.html" },
    { label: "Analog Devices – Thermally Enhanced Packages (thermal vias guidance)", href: "https://www.analog.com/media/en/technical-documentation/application-notes/application_notes_for_thermally_enhanced_leaded_packages.pdf" },
    { label: "TI SLUA566A – Using Thermal Calculation Tools", href: "https://www.ti.com/lit/slua566" },
    { label: "Altium – PCB Heat Dissipation Techniques", href: "https://resources.altium.com/p/pcb-heat-dissipation-techniques" },
  ];
  return (
    <div className="bg-white border rounded-2xl shadow-sm p-5">
      <h3 className="text-lg font-semibold mb-2">Resources & Further Reading</h3>
      <ul className="list-disc pl-5 text-sm text-blue-700">
        {items.map((it) => (
          <li key={it.href}><a href={it.href} target="_blank" rel="noreferrer" className="hover:underline">{it.label}</a></li>
        ))}
      </ul>
    </div>
  );
}

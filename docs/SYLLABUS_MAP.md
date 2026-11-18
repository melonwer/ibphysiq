# SixthPhysics Unified 3-Syllabus Specification & Crosswalk Map

This document is the authoritative specification and crosswalk reference for **SixthPhysics** across all three supported pre-university physics qualifications:

1. **IB Diploma Programme Physics (`ib`)** — First Assessment May 2025 (`SL` and `HL`)
2. **UK GCE AS & A-Level Physics (`alevel`)** — DfE Subject Content Core + AQA `7407/7408` with OCR Physics A (`H556`) and Cambridge International (`CIE 9702`) overlap (`Y12` and `Y13`)
3. **NCUK International Foundation Year Physics (`ncuk`)** — Official Module `IFYPH005` (`IFY-S1`, `IFY-S2`, and cumulative `IFY`)

Code implementation lives in [`lib/constants/syllabi/`](../lib/constants/syllabi/index.ts):
- Shared types & visual-domain hints: [`types.ts`](../lib/constants/syllabi/types.ts)
- IB Physics (2025) catalogue: [`ib-physics.ts`](../lib/constants/syllabi/ib-physics.ts) (detailed IB/A-Level notes in [`SYLLABUS_IB_ALEVEL.md`](./SYLLABUS_IB_ALEVEL.md))
- UK A-Level Physics catalogue: [`a-level-physics.ts`](../lib/constants/syllabi/a-level-physics.ts)
- NCUK IFY Physics (`IFYPH005`) catalogue & booklet constants: [`ncuk-physics.ts`](../lib/constants/syllabi/ncuk-physics.ts)
- Unified 56-concept crosswalk & slice query engine: [`crosswalk.ts`](../lib/constants/syllabi/crosswalk.ts)

---

## 1. Qualification & Assessment Comparison

| Attribute | IB Physics (`ib`) | UK A-Level Physics (`alevel`) | NCUK IFY Physics (`ncuk`) |
| :--- | :--- | :--- | :--- |
| **Awarding Body** | International Baccalaureate Organization (IBO) | AQA (`7407` AS / `7408` A-Level) + DfE Core / OCR `H556` / CIE `9702` | Northern Consortium UK Ltd (NCUK) |
| **Specification Code & Version** | `IB-DP-PHYSICS-2025` (First Assessment May 2025) | `AQA-7407-7408` (Reformed Linear GCE) | `IFYPH005` (2025–26 / 2026–27; superseding `IFYPH004`) |
| **Assessed Levels** | `SL` (110h), `HL` (180h) | `Y12` (AS), `Y13` (Full A-Level) | `IFY-S1` (Sem 1), `IFY-S2` (Sem 2), `IFY` (Cumulative Final) |
| **Written Exam Weighting** | **80%** (Paper 1A MCQ + Paper 1B Data + Paper 2 Structured) | **100%** of grade (Papers 1, 2, 3; Practical Endorsement reported separately) | **70%** (EoS1 Test **20%** + Cumulative Final Exam **50%**) |
| **Practical / Coursework** | **20%** Scientific Investigation (IA, 24 marks) | Pass/Fail Practical Endorsement (12 Required Practicals + Paper 3A) | **30%** Laboratory Coursework (2 reports × 100 marks, 1200–1500 words each) |
| **Calculator & Booklet** | Allowed on **all** papers (incl. Paper 1A MCQs) | Allowed on **all** papers | Allowed on **all** papers (graph paper supplied) |
| **Standard $g$ near Earth** | **$9.8\text{ m s}^{-2}$** (2 s.f.) | **$9.81\text{ m s}^{-2}$** (3 s.f.) | **$9.81\text{ m s}^{-2}$** (or $9.81\text{ N kg}^{-1}$, 3 s.f.) |
| **Significant Figures Rule** | Match least precise input datum (typically 2–3 s.f.) | Match input data precision (typically 2–3 s.f.) | **4 s.f. working, 3 s.f. final answer** (up to 1m paper-wide penalty) |

---

## 2. NCUK IFY Physics (`IFYPH005`) Specification & Assessment Structure

Grounded in the official NCUK `IFYPH005` specification, 2026–27 NCUK/INTO Manchester syllabus documents (`150h` guided teaching + `120h` independent study over two 15-week semesters; central NCUK programme guide lists `120h` guided + `130h` independent), Data, Formulae and Relationships booklet, and `IFYPH005` 2025–26 End of Semester 1 paper (`2526 V3`):

### 2.1 Assessment Blueprint

| Component (`paperId`) | Assessed Levels | Weight | Duration | Marks | Question Breakdown |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **End of Semester 1 Test (`ncuk-eos1`)** | `IFY-S1` | 20% | 90 min | 60 | **22 compulsory questions**: 10 × 1m MCQs (`10m`), 5 short-answer (`10m`), 5 application/calculation (`20m`), 2 × 10m extended structured/graph questions (`20m`) |
| **Practical Coursework (`ncuk-coursework`)** | `IFY-S1`, `IFY-S2`, `IFY` | 30% | Coursework | 200 (2 × 100) | Two supervised laboratory investigation reports (e.g. cell EMF & internal resistance), assessing planning, uncertainty propagation, best/worst-fit graphing, and evaluation |
| **Cumulative Final Exam (`ncuk-final`)** | `IFY`, `IFY-S1`, `IFY-S2` | 50% | 150 min | 100 | **40 compulsory questions across S1 + S2**: 20 × 1m MCQs (`20m`), 7 short-answer (`15m`), 10 application/calculation (`35m`), 3 × 10m extended structured questions (`30m`) |

### 2.2 NCUK Topic & Subtopic Inventory (`AC1`–`AC8` / `LO1`–`LO8`)

| Topic / LO | Subtopics & Titles | Delivery Window | Key Booklet Equations & Scope Boundaries | Visual Domains |
| :--- | :--- | :--- | :--- | :--- |
| **`AC1 / LO1`** Units, Uncertainties & Vectors *(12h / 10h)* | `AC1.1` SI Units & Uncertainties; `AC1.2` Graphs & Line of Worst Fit; `AC1.3` Scalars & Vectors | `IFY-S1` + `IFY` | Worst-case $\Delta(A\pm B)=\Delta A+\Delta B$, $\frac{\Delta y}{y}=\sum |a_i|\frac{\Delta A_i}{A_i}$, $y=mx+c$, $\Delta m = |m_{\text{best}}-m_{\text{worst}}|$, $\ln(x^n)=n\ln x$, cosine/parallelogram vectors | `graphs`, `mechanics` |
| **`AC2 / LO2`** Mechanics *(28h / 22h)* | `AC2.1` Kinematics & Projectiles; `AC2.2` Dynamics & Drag; `AC2.3` Statics, Moments & Couples; `AC2.4` Circular Motion; `AC2.5` Work, Energy & Power; `AC2.6` Momentum & Collisions | `IFY-S1` + `IFY` | 4 `suvat` equations, $F=ma=\Delta p/\Delta t$, $M=Fd_\perp$, $a=v^2/r=r\omega^2$, $E_k=\frac{1}{2}mv^2$, $E_p=mgh$, $P=Fv$, elastic/inelastic/plastic 1D & 2D collisions. *(Excludes $I\alpha$ rotational dynamics & special relativity)* | `mechanics`, `grav-astro`, `graphs` |
| **`AC3 / LO3`** Materials & Thermal Physics *(22h / 18h)* | `AC3.1` Matter, Density & Hydrostatics; `AC3.2` Hooke's Law & Young's Modulus; `AC3.3` SHC, Latent Heat & Internal Energy; `AC3.4` Ideal Gases & Kinetic Theory | `IFY-S1` + `IFY` | $\rho=m/V$, $\Delta p=\rho g\Delta h$, Archimedes upthrust, $F=-kx$, $E=\frac{FL}{Ae}=\frac{\sigma}{\varepsilon}$, $E=mc\Delta\theta$, $Q=L\Delta m$, $\Delta U=\Delta Q+\Delta W$, $pV=nRT=NkT$, $T/\text{K}=\theta/{}^\circ\text{C}+273.2$. *(Excludes adiabatic $PV^\gamma$ & Carnot cycles)* | `thermal`, `mechanics`, `graphs` |
| **`AC4 / LO4`** Electricity, Capacitance & EM *(30h / 24h)* | **S1**: `AC4.1` Current, Drift $I=nAve$ & Kirchhoff; `AC4.2` Ohm's Law, $\rho=RA/L$ & Dividers; `AC4.3` $V=\varepsilon-Ir$ & Power; `AC4.4` Capacitors & RC Discharge. **S2**: `AC4.5` E & B Fields; `AC4.6` Induction, Motors, Generators & Transformers | `AC4.1–4.4`: `IFY-S1` + `IFY`<br>`AC4.5–4.6`: `IFY-S2` + `IFY` | $I=nAve$, $V=\varepsilon-Ir$, $C_p=\sum C_i$, $\frac{1}{C_s}=\sum\frac{1}{C_i}$, $Q=Q_0e^{-t/RC}$, $F=\frac{Q_1Q_2}{4\pi\varepsilon_0 r^2}$, $V=\frac{Q}{4\pi\varepsilon_0 r}$, $E=V/d$, $F=Bqv$, $F=BIL\sin\theta$, $T=BIAn$, $N\Phi=NBA\cos\theta$, $\varepsilon=-N\Delta\Phi/\Delta t$, $\varepsilon=BLv$, $V_p/V_s=N_p/N_s$ | `circuits`, `fields`, `em-induction`, `graphs` |
| **`AC5 / LO5`** Gravitation, Astronomy & Cosmology *(16h / 13h)* | `AC5.1` Gravitation, Potential, Orbits & Kepler; `AC5.2` Stellar Evolution, HR Diagram & Blackbodies; `AC5.3` Cosmology, Redshift, Hubble & CMBR | `IFY-S2` + `IFY` | $F=\frac{GMm}{r^2}$, $V=-\frac{GM}{r}$, $\frac{1}{2}mv_{\text{esc}}^2=\frac{GMm}{r}$, $T^2=kr^3$, $\lambda_{\max}=b/T$, $L=4\pi r^2\sigma T^4$, $\frac{\Delta\lambda}{\lambda}\approx\frac{v}{c}$, $v=H_0d$. *(Compulsory for all NCUK students; excludes logarithmic magnitude $m-M$)* | `grav-astro`, `fields`, `thermal`, `waves`, `graphs` |
| **`AC6 / LO6`** Oscillations & Waves *(18h / 14h)* | `AC6.1` SHM, Damping & Resonance; `AC6.2` Waves, EM Spectrum & Malus's Law; `AC6.3` Reflection, Snell's Law, Dispersion & TIR; `AC6.4` Interference, Double Slit & Gratings; `AC6.5` Stationary Waves in Strings & Pipes | `IFY-S2` + `IFY` | $x=A\sin(\omega t)$, $a=-\omega^2x$, $v=\pm\omega\sqrt{A^2-x^2}$, $T=2\pi\sqrt{l/g}$, $T=2\pi\sqrt{m/k}$, $v=f\lambda$, $I=I_0\cos^2\theta$, $n=\frac{\sin i}{\sin r}=\frac{c}{v}$, $n=\frac{1}{\sin C}$, $w=\frac{\lambda D}{s}$, $d\sin\theta=n\lambda$. *(Excludes thin-lens $1/f=1/u+1/v$)* | `optics-shm`, `waves`, `graphs` |
| **`AC7 / LO7`** Nucleus, Radioactivity & Nuclear Energy *(12h / 10h)* | `AC7.1` Alpha Scattering, $R=r_0A^{1/3}$ & Nuclear Density; `AC7.2` $\alpha/\beta/\gamma$, Exponential Decay & Dating; `AC7.3` Mass Defect, Binding Energy, Fission & Fusion | `IFY-S2` + `IFY` | $R=r_0A^{1/3}$, $A=\lambda N$, $\lambda t_{1/2}=\ln 2$, $A=A_0e^{-\lambda t}$, $N=N_0e^{-\lambda t}$, $E=mc^2$, reactor moderator/control-rod/coolant/shielding functions | `quantum-nuclear`, `fields`, `graphs` |
| **`AC8 / LO8`** Quantum & Particle Physics *(12h / 9h)* | `AC8.1` Photons, Spectra & Photoelectric Effect; `AC8.2` de Broglie, Electron Diffraction & Heisenberg; `AC8.3` Standard Model, Quarks, Antimatter & $\beta^\mp$ Decay | `IFY-S2` + `IFY` | $E=hf=hc/\lambda$, $hf=\Phi+E_{k\max}$, $eV_s=E_{k\max}$, $\lambda=h/(mv)$, $\Delta x\,\Delta p\ge\frac{h}{4\pi}$, $p=uud$, $n=udd$, $d\to u+e^-+\bar{\nu}_e$, $u\to d+e^++\nu_e$. *(Excludes Compton scattering & strangeness)* | `quantum-nuclear`, `waves`, `graphs` |

---

## 3. Unified 56-Concept Crosswalk Matrix Across All 10 Visual/Solver Domains

Every canonical concept in [`SYLLABUS_CROSSWALK`](../lib/constants/syllabi/crosswalk.ts) binds to one primary deterministic solver/SVG domain (`VisualFamilyHint`) and records exact per-syllabus level and boundary constraints:

| # | `conceptId` | Primary Visual Domain | IB Physics (2025) | UK A-Level (AQA / OCR / CIE) | NCUK IFY (`IFYPH005`) | Key Scope / Convention Notes |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `si-units-dimensional-analysis` | `graphs` | `SL`, `HL` (`Tools`) | `Y12`, `Y13` (`3.1`) | `IFY-S1`, `IFY` (`AC1.1`) | Universal SI base units; NCUK enforces 3 s.f. final answers |
| 2 | `uncertainties-error-propagation` | `graphs` | `SL`, `HL` (`Tools`) | `Y12`, `Y13` (`3.1`) | `IFY-S1`, `IFY` (`AC1.1`) | Worst-case linear uncertainty propagation across all 3 |
| 3 | `graphical-linearization-gradients` | `graphs` | `SL`, `HL` (`Tools`) | `Y12`, `Y13` (`3.1`) | `IFY-S1`, `IFY` (`AC1.2`) | Log linearization is `HL` (IB) & `Y13` (A-Level), `IFY-S1` (NCUK) |
| 4 | `motion-graphs` | `graphs` | `SL`, `HL` (`A.1`) | `Y12`, `Y13` (`3.4.1`) | `IFY-S1`, `IFY` (`AC2.1`) | Universal $s$-$t$, $v$-$t$, $a$-$t$ gradient & signed area rules |
| 5 | `ohms-law-iv-characteristics` | `graphs` | `SL`, `HL` (`B.5`) | `Y12`, `Y13` (`3.5.1`) | `IFY-S1`, `IFY` (`AC4.2`) | Static $R=V/I$ on ohmic, filament-lamp & diode $I$-$V$ plots |
| 6 | `vectors-equilibrium-moments` | `mechanics` | `SL` ($\Sigma F$), `HL` (`A.4` $\Sigma\tau$) | `Y12`, `Y13` (`3.4.1`) | `IFY-S1`, `IFY` (`AC1.3, 2.3`) | Beam moments/couples are `Y12`/`IFY-S1`, but **`HL`-only** in IB |
| 7 | `kinematics-suvat` | `mechanics` | `SL`, `HL` (`A.1`) | `Y12`, `Y13` (`3.4.1`) | `IFY-S1`, `IFY` (`AC2.1`) | $g=9.8$ (IB) vs $9.81\text{ m s}^{-2}$ (A-Level & NCUK) |
| 8 | `projectile-motion` | `mechanics` | `SL`, `HL` (`A.1`) | `Y12`, `Y13` (`3.4.1`) | `IFY-S1`, `IFY` (`AC2.1`) | $g=9.8$ vs $9.81\text{ m s}^{-2}$; derive from orthogonal components |
| 9 | `newtonian-dynamics-friction` | `mechanics` | `SL`, `HL` (`A.2`) | `Y12`, `Y13` (`3.4.1`) | `IFY-S1`, `IFY` (`AC2.2`) | IB prints $\mu_s, \mu_d$; state $\mu$ explicitly if cross-tagging |
| 10 | `fluid-drag-buoyancy` | `mechanics` | `SL`, `HL` (`A.2, B.1`) | `Y12`, `Y13` (`3.4, Opt 3.12`) | `IFY-S1`, `IFY` (`AC2.2, 3.1`) | Stokes $6\pi\eta rv$ is IB core & AQA Opt `3.12` (not NCUK) |
| 11 | `linear-momentum-impulse` | `mechanics` | `SL`, `HL` (`A.2, A.3`) | `Y12`, `Y13` (`3.4.1`) | `IFY-S1`, `IFY` (`AC2.6`) | Universal 1D/2D collisions & $F$-$t$ impulse |
| 12 | `work-energy-power` | `mechanics` | `SL`, `HL` (`A.3`) | `Y12`, `Y13` (`3.4.1`) | `IFY-S1`, `IFY` (`AC2.5`) | $g=9.8$ (IB) vs $9.81\text{ m s}^{-2}$ (A-Level & NCUK) |
| 13 | `elasticity-young-modulus` | `mechanics` | `SL`, `HL` (`A.2, A.3` *Hooke only*) | `Y12`, `Y13` (`3.4.2`) | `IFY-S1`, `IFY` (`AC3.2`) | **Young's modulus $E=\sigma/\varepsilon$ is A-Level + NCUK only** (not IB) |
| 14 | `rigid-body-rotational-dynamics` | `mechanics` | `HL` (`A.4`) | `Y13` (`Opt 3.11` *struct*) | *Excluded* | Compulsory IB `HL` + AQA Option `3.11`; excluded from NCUK |
| 15 | `uniform-circular-motion` | `grav-astro` | `SL`, `HL` (`A.2`) | `Y13` (`3.6.1`) | `IFY-S1`, `IFY` (`AC2.4`) | `SL`/`IFY-S1` in IB & NCUK, deferred to `Y13` in A-Level |
| 16 | `gravitational-force-field` | `grav-astro` | `SL`, `HL` (`D.1`) | `Y13` (`3.7.2`) | `IFY-S2`, `IFY` (`AC5.1`) | Universal $F=GMm/r^2$ & $g=GM/r^2$ |
| 17 | `gravitational-potential-orbits` | `grav-astro` | `HL` (`D.1`) | `Y13` (`3.7.2`) | `IFY-S2`, `IFY` (`AC5.1`) | $V_g=-GM/r$ & $v_{\text{esc}}$ are IB `HL`, A-Level `Y13`, NCUK `S2` |
| 18 | `stellar-radiation-hr-diagram` | `grav-astro` | `SL`, `HL` (`B.1, E.5`) | `Y13` (`Opt 3.9` / OCR Core) | `IFY-S2`, `IFY` (`AC5.2`) | Wien, Stefan-Boltzmann & HR compulsory in IB & NCUK |
| 19 | `cosmology-hubble-law` | `grav-astro` | `HL` (`E.5`) | `Y13` (`Opt 3.9` / OCR Core) | `IFY-S2`, `IFY` (`AC5.3`) | Hubble $v=H_0d$ & CMBR; $z=R/R_0-1$ is IB `HL` |
| 20 | `specific-heat-latent-heat` | `thermal` | `SL`, `HL` (`B.1`) | `Y13` (`3.6.2`) | `IFY-S1`, `IFY` (`AC3.3`) | Kelvin offset: $+273$ (IB), $+273.15$ (AQA), $+273.2$ (NCUK) |
| 21 | `thermal-conduction-radiation` | `thermal` | `SL`, `HL` (`B.1`) | *Excluded* *(see #18)* | `IFY-S2`, `IFY` (`AC5.2` *rad*) | Fourier slab $\frac{\Delta Q}{\Delta t}=kA\frac{\Delta T}{\Delta x}$ is **IB-only** |
| 22 | `greenhouse-albedo-energy-balance` | `thermal` | `SL`, `HL` (`B.2`) | *Excluded* | *Excluded* | **IB-exclusive** planetary albedo & emissivity balance |
| 23 | `ideal-gas-kinetic-theory` | `thermal` | `SL`, `HL` (`B.3`) | `Y13` (`3.6.2`) | `IFY-S1`, `IFY` (`AC3.4`) | $pV=nRT=Nk_BT$ across all 3; supply $c_{\text{rms}}$ formula for NCUK |
| 24 | `ideal-gas-pv-cycles` | `thermal` | `SL`, `HL` (`B.3, B.4`) | `Y13` (`3.6.2, Opt 3.11`) | `IFY-S1`, `IFY` (`AC3.3, 3.4`) | **Work sign flip**: $Q=\Delta U+W$ (IB/AQA 3.11) vs $\Delta U=\Delta Q+\Delta W$ (NCUK) |
| 25 | `thermodynamics-entropy-engines` | `thermal` | `HL` (`B.4`) | `Y13` (`Opt 3.11` *struct*) | *Excluded* | Adiabatic $PV^\gamma$, Carnot $\eta$, entropy ($\Delta S, k_B\ln\Omega$ IB `HL`) |
| 26 | `charge-current-potential-difference` | `circuits` | `SL`, `HL` (`B.5`) | `Y12`, `Y13` (`3.5.1`) | `IFY-S1`, `IFY` (`AC4.1`) | Drift $I=nAve$ in NCUK & OCR/CIE booklets (supply for IB/AQA) |
| 27 | `resistivity-ohmic-conductors` | `circuits` | `SL`, `HL` (`B.5`) | `Y12`, `Y13` (`3.5.1`) | `IFY-S1`, `IFY` (`AC4.2`) | $\rho=RA/L$ universal; superconductivity $T_c$ is AQA-only |
| 28 | `kirchhoff-dc-circuits` | `circuits` | `SL`, `HL` (`B.5`) | `Y12`, `Y13` (`3.5.1, Opt 3.13`) | `IFY-S1`, `IFY` (`AC4.1`) | IEC symbols, multi-loop Kirchhoff & opposing cells across all 3 |
| 29 | `potential-divider-sensors` | `circuits` | `SL`, `HL` (`B.5`) | `Y12`, `Y13` (`3.5.1`) | `IFY-S1`, `IFY` (`AC4.2`) | Unloaded/loaded dividers, NTC thermistors & LDRs across all 3 |
| 30 | `emf-internal-resistance` | `circuits` | `SL`, `HL` (`B.5`) | `Y12`, `Y13` (`3.5.1`) | `IFY-S1`, `IFY` (`AC4.3`) | $V=\varepsilon-Ir$ and $V$-$I$ gradient/intercept identical across all 3 |
| 31 | `capacitor-networks-energy` | `circuits` | *Excluded (removed 2025)* | `Y13` (`3.7.4`) | `IFY-S1`, `IFY` (`AC4.4`) | $C=Q/V, W=\frac{1}{2}CV^2$, series/parallel (**A-Level + NCUK only**) |
| 32 | `capacitor-rc-decay` | `em-induction` | *Excluded (removed 2025)* | `Y13` (`3.7.4, Opt 3.13`) | `IFY-S1`, `IFY` (`AC4.4`) | $\tau=RC$, $X=X_0e^{-t/RC}$, $\ln V$-$t$ (**A-Level `Y13` + NCUK `S1`**) |
| 33 | `electrostatic-coulomb-uniform-fields` | `fields` | `SL`, `HL` (`D.2, D.3`) | `Y13` (`3.7.3`) | `IFY-S2`, `IFY` (`AC4.5`) | Coulomb inverse-square, $E=V/d$ & parabolic deflection |
| 34 | `electric-potential-equipotentials` | `fields` | `HL` (`D.2`) | `Y13` (`3.7.3`) | `IFY-S2`, `IFY` (`AC4.5`) | Radial $V_e=\frac{Q}{4\pi\varepsilon_0 r}$ is IB `HL`, A-Level `Y13`, NCUK `S2` |
| 35 | `magnetic-force-charges-currents` | `em-induction` | `SL`, `HL` (`D.3`) | `Y13` (`3.7.5, Opt 3.12`) | `IFY-S2`, `IFY` (`AC4.5`) | $F=BIL\sin\theta$, $F=Bqv$, cyclotron $r=\frac{mv}{Bq}$; NCUK adds $T=BIAn$ |
| 36 | `electromagnetic-induction-faraday-lenz` | `em-induction` | `HL` (`D.4`) | `Y13` (`3.7.5`) | `IFY-S2`, `IFY` (`AC4.6`) | $N\Phi=NBA\cos\theta$ ($\theta$ to normal), $\varepsilon=-N\Delta\Phi/\Delta t$, $\varepsilon=BLv$ |
| 37 | `ac-generators-transformers` | `em-induction` | `HL` (`D.4` *coil only*) | `Y13` (`3.7.5`) | `IFY-S2`, `IFY` (`AC4.6`) | Transformers $V_p/V_s=N_p/N_s$ in A-Level & NCUK (not IB); RMS $1/\sqrt{2}$ A-Level |
| 38 | `simple-harmonic-motion` | `optics-shm` | `SL`, `HL` (`C.1`) | `Y13` (`3.6.1`) | `IFY-S2`, `IFY` (`AC6.1`) | State $t=0$ phase explicitly ($\cos\omega t$ AQA vs $\sin\omega t$ NCUK/IB) |
| 39 | `forced-oscillations-resonance` | `optics-shm` | `SL`, `HL` (`C.4`) | `Y13` (`3.6.1`) | `IFY-S2`, `IFY` (`AC6.1`) | Light/critical/heavy damping & resonance curves across all 3 |
| 40 | `refraction-snell-tir` | `optics-shm` | `SL`, `HL` (`C.3`) | `Y12`, `Y13` (`3.3.2`) | `IFY-S2`, `IFY` (`AC6.3`) | Snell's law, $\sin\theta_c=n_2/n_1$, dispersion & step-index optical fibres |
| 41 | `thin-lenses-geometric-optics` | `optics-shm` | *Excluded (removed 2025)* | `Y13` (`Opt 3.9, 3.10` *struct*) | *Excluded* | **A-Level only** ($1/f=1/u+1/v$, real-is-positive convention) |
| 42 | `progressive-waves-polarization` | `waves` | `SL`, `HL` (`C.2`) | `Y12`, `Y13` (`3.3.1`) | `IFY-S2`, `IFY` (`AC6.2`) | $v=f\lambda, I\propto A^2$; Malus $I=I_0\cos^2\theta$ printed in NCUK & CIE |
| 43 | `double-slit-interference` | `waves` | `SL`, `HL` (`C.3`) | `Y12`, `Y13` (`3.3.2`) | `IFY-S2`, `IFY` (`AC6.4`) | **Symbol trap**: $s=\lambda D/d$ (IB) vs $w=\lambda D/s$ (AQA & NCUK) |
| 44 | `single-slit-diffraction-gratings` | `waves` | `HL` (`C.3`) | `Y12`, `Y13` (`3.3.2`) | `IFY-S2`, `IFY` (`AC6.4`) | $d\sin\theta=n\lambda$ shared (`HL` IB, `Y12` A-Level, `S2` NCUK); $\theta=\lambda/b$ IB `HL` |
| 45 | `standing-waves-harmonics` | `waves` | `SL`, `HL` (`C.4`) | `Y12`, `Y13` (`3.3.1`) | `IFY-S2`, `IFY` (`AC6.5`) | String, open-pipe & odd closed-pipe harmonics; $\frac{1}{2l}\sqrt{T/\mu}$ AQA booklet |
| 46 | `doppler-effect` | `waves` | `SL` (EM), `HL` (`C.5` sound) | `Y13` (`Opt 3.9` / CIE Core) | `IFY-S2`, `IFY` (`AC5.3` EM) | Optical $\Delta\lambda/\lambda\approx v/c$ shared; exact sound formula IB `HL` & CIE/OCR |
| 47 | `atomic-spectra-energy-levels` | `quantum-nuclear` | `SL`, `HL` (`E.1`) | `Y12`, `Y13` (`3.2.2`) | `IFY-S2`, `IFY` (`AC5.2, 8.1`) | $\Delta E=hf=hc/\lambda$ across all 3; Bohr $mvr=nh/2\pi$ IB `HL`-only |
| 48 | `rutherford-scattering-nuclear-radius` | `quantum-nuclear` | `HL` (`E.1`) | `Y13` (`3.8.1`) | `IFY-S2`, `IFY` (`AC7.1`) | Rutherford foil, $R=r_0A^{1/3}$ & constant nuclear density |
| 49 | `photoelectric-effect` | `quantum-nuclear` | `HL` (`E.2`) | `Y12`, `Y13` (`3.2.2`) | `IFY-S2`, `IFY` (`AC8.1`) | **Level inversion**: `Y12` (A-Level) vs `S2` (NCUK) vs `HL`-only (IB) |
| 50 | `wave-particle-duality-de-broglie` | `quantum-nuclear` | `HL` (`E.2`) | `Y12`, `Y13` (`3.2.2, Opt 3.12`) | `IFY-S2`, `IFY` (`AC8.2`) | $\lambda=h/(mv)=h/\sqrt{2m_eeV}$ & electron diffraction rings |
| 51 | `compton-scattering-heisenberg-uncertainty` | `quantum-nuclear` | `HL` (`E.2`) | *Excluded* | `IFY-S2`, `IFY` (`AC8.2` *Heisenberg*) | $\Delta x\,\Delta p\ge\frac{h}{4\pi}$ in IB `HL` + NCUK `S2`; Compton $\Delta\lambda$ **IB `HL`-only** |
| 52 | `radioactive-decay-half-life` | `quantum-nuclear` | `SL` ($2^{-n}$), `HL` (`E.3` $e^{-\lambda t}$) | `Y13` (`3.8.1`) | `IFY-S2`, `IFY` (`AC7.2`) | Continuous $N_0e^{-\lambda t}, A=\lambda N$ is IB `HL`, A-Level `Y13`, NCUK `S2` |
| 53 | `mass-defect-binding-energy` | `quantum-nuclear` | `SL`, `HL` (`E.3, E.4`) | `Y13` (`3.8.1`) | `IFY-S2`, `IFY` (`AC7.3`) | Supply $1\text{ u}=1.661\times 10^{-27}\text{ kg}=931.5\text{ MeV}/c^2$ in stems |
| 54 | `nuclear-fission-fusion` | `quantum-nuclear` | `SL`, `HL` (`E.4, E.5`) | `Y13` (`3.8.1`) | `IFY-S2`, `IFY` (`AC7.3`) | $Q$-values & moderator/control-rod/coolant/shielding across all 3 |
| 55 | `fundamental-particles-quarks-leptons` | `quantum-nuclear` | *Excluded (removed 2025)* | `Y12`, `Y13` (`3.2.1`) | `IFY-S2`, `IFY` (`AC8.3`) | Quarks ($uud/udd$), leptons, annihilation & quark $\beta^\mp$ (**A-Level + NCUK**) |
| 56 | `special-relativity-spacetime` | `quantum-nuclear` | `HL` (`A.5`) | `Y13` (`Opt 3.12` *struct*) | *Excluded* | Lorentz $\gamma$, time dilation & length contraction (IB `HL` + AQA `3.12`) |

*Note: All 56 canonical concepts are enumerated above; row ordering groups the five primary `graphs` concepts (`#1–5`) together while keeping each visual-domain block contiguous.*

---

## 4. Authoring & Verification Guardrails for Cross-Syllabus Packages

When generating or cross-tagging question packages across multiple syllabi, enforce these six rules:

1. **Gravitational Acceleration ($g$)**:
   - IB (`9.8 m s^-2`) differs from UK A-Level and NCUK (`9.81 m s^-2`) by `0.102%`.
   - Any multi-syllabus mechanics/thermal/optics-shm question should either state the value of $g$ to use in the stem or ensure MCQ distractors are separated by well above `1%` (never construct a distractor whose sole difference is `9.8` vs `9.81`).
2. **First Law of Thermodynamics Sign Convention**:
   - **IB HL (`B.4`) & AQA Option `3.11`**: $Q = \Delta U + W \implies \Delta U = Q - W$ ($+W$ = work done **by** the gas during expansion).
   - **NCUK (`AC3.3`) & CIE `9702`**: $\Delta U = \Delta Q + \Delta W$ ($+\Delta W$ = work done **on** the gas during compression).
   - Question stems and subparts must ask explicitly for *"work done by the gas"* or *"work done on the gas"* rather than bare symbol $W$.
3. **Young's Double-Slit Variable Naming**:
   - Symbol $s$ denotes **fringe spacing** in IB ($s = \lambda D / d$) but **slit separation** in AQA and NCUK ($w = \lambda D / s$). Always write out *"slit separation"* and *"fringe spacing"* in prose.
4. **SHM Initial Phase**:
   - AQA prints $x = A\cos(\omega t)$, NCUK prints $x = A\sin(\omega t)$, and IB HL prints $x = x_0\sin(\omega t + \phi)$. Always specify the oscillator's position and direction at $t = 0$ in the stem or graph.
5. **Calculus / Exponential / Natural-Log Scope**:
   - Concepts flagged `calculusOrExponentialRequired: true` (`graphical-linearization-gradients`, `thermodynamics-entropy-engines`, `capacitor-rc-decay`, `electromagnetic-induction-faraday-lenz`, `ac-generators-transformers`, `simple-harmonic-motion`, `radioactive-decay-half-life`) must respect algebraic-only limits when targeting `SL` (e.g. integer half-lives in `E.3`, algebraic $T^2$-vs-$L$ plots in `Tools`, qualitative/period SHM in `C.1`).
6. **Hard Exclusions (Never Cross-Tag)**:
   - **Never tag to IB 2025**: Capacitors & RC circuits (`capacitor-networks-energy`, `capacitor-rc-decay`), Young's modulus (`E = FL/Ae`), thin lenses (`thin-lenses-geometric-optics`), transformers & RMS $1/\sqrt{2}$, or quark/lepton particle classification (`fundamental-particles-quarks-leptons`).
   - **Never tag to NCUK IFY**: Rotational moment of inertia (`rigid-body-rotational-dynamics`), adiabatic/Carnot/quantitative entropy (`thermodynamics-entropy-engines`), planetary albedo (`greenhouse-albedo-energy-balance`), thin lenses (`thin-lenses-geometric-optics`), Compton scattering, or special relativity (`special-relativity-spacetime`).
   - **Never tag to UK A-Level**: Planetary greenhouse/albedo (`greenhouse-albedo-energy-balance`), quantitative Fourier slab conduction, Compton scattering, or Heisenberg uncertainty (`compton-scattering-heisenberg-uncertainty`).

---

## 5. Deterministic Query API Summary

Import from `@/lib/constants/syllabi`:

- `getSyllabusCatalogue(syllabus)` / `SYLLABUS_CATALOGUES` — Full typed specification, paper blueprints, conventions, and topic tree for `'ib'`, `'alevel'`, or `'ncuk'`.
- `getTopicsBySyllabus(syllabus, { level?, includeOptions? })` — Filters topics and subtopics to a target level (`'SL'`, `'HL'`, `'Y12'`, `'Y13'`, `'IFY-S1'`, `'IFY-S2'`, `'IFY'`) and optionally strips optional modules (`alevel-options-9-13`).
- `getCompatibleSyllabiForConcept(conceptId, { level?, format?, excludeOptionTopics?, requireNonCalculus?, requireNonRelativistic? })` — Returns narrowed `CrosswalkSyllabusMapping[]` compatible with all requested constraints.
- `getCrosswalkEntriesByVisualFamily(visualFamily, { includeSupporting? })` — Lists canonical concepts routed to any of the 10 deterministic solver/SVG domains.
- `getGeneratableSlices(filter?)` — Enumerates deduplicated `(conceptId, syllabus, level, format)` generation slices (`539` total slices across all 3 syllabi and 10 visual families; `532` compulsory core-only slices when `includeOptionTopics: false`).

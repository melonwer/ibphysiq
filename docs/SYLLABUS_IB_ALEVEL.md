# IB Physics (2025) & UK A-Level Physics Syllabus Specification Reference

This document records the authoritative specification versions, assessment structures, topic inventories, level boundaries (`SL` vs `HL`; `Y12` vs `Y13`), and cross-board divergences encoded in:

- [`lib/constants/syllabi/types.ts`](../lib/constants/syllabi/types.ts)
- [`lib/constants/syllabi/ib-physics.ts`](../lib/constants/syllabi/ib-physics.ts)
- [`lib/constants/syllabi/a-level-physics.ts`](../lib/constants/syllabi/a-level-physics.ts)

---

## 1. Official Specification Versions

| Syllabus ID | Qualification | Awarding Body & Code | Active Specification Version | Standard Free-Fall Acceleration |
| :--- | :--- | :--- | :--- | :--- |
| `ib` | IB Diploma Programme Physics (`SL` & `HL`) | International Baccalaureate Organization (`IB-DP-PHYSICS-2025`) | First Teaching August 2023 / **First Assessment May 2025** | $g = 9.8\text{ m s}^{-2}$ (2025 Data Booklet, 2 s.f.) |
| `alevel` | UK GCE AS & A-Level Physics (`Y12` & `Y13`) | DfE Subject Content Core + **AQA 7407 (AS) / 7408 (A-Level)**, annotated with **OCR Physics A (H556)** & **Cambridge International (CIE 9702)** | Reformed Linear GCE Specification (`7407/7408`) | $g = 9.81\text{ m s}^{-2}$ (AQA / OCR / CIE Data Booklets, 3 s.f.) |

### Migration Notes vs Legacy `lib/constants/ib-physics-topics.ts`
The legacy `IBPhysicsSubtopic` enum in `lib/types/question-generation.ts` mixed 2025 theme names with retired 2016 Option Topics:
1. **Paper 3 and all five Option Topics (`Relativity`, `Engineering Physics`, `Imaging`, `Astrophysics`, `Particle Physics`) were eliminated** in the May 2025 IB Physics specification. Selected concepts were integrated directly into compulsory HL/SL themes (`A.4`, `A.5`, `B.4`, `E.5`).
2. **Official 2025 subtopic numbering**: In Theme B, **`B.4` is Thermodynamics (HL only)** and **`B.5` is Current and circuits (SL + HL)**. In Theme E, **`E.2` is Quantum physics (HL only)**, followed by `E.3` Radioactive decay, `E.4` Fission, and `E.5` Fusion and stars.
3. **Removed 2016 IB topics**: Capacitors/RC circuits (former Topic 11.3), subatomic quark/lepton/Feynman particle classification (former Topic 7.3), and geometric lens optics (former Option C) are **not** in IB Physics 2025.

---

## 2. External Assessment & Paper Structures

### 2.1 IB Physics (First Assessment 2025)
External written papers account for **80%** of the qualification (with the 24-mark Scientific Investigation Internal Assessment accounting for **20%**). Calculators and the 2025 IB Physics Data Booklet are permitted in **all** papers; there is no negative marking on multiple-choice questions.

| Paper | Level | Format | Duration | Marks | Weighting | Scope & Structure |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Paper 1A** | SL | `mcq` (4 options A–D) | 90 min (combined sitting with 1B) | 25 | 20% (36% with 1B) | SL core across Themes A–E |
| **Paper 1B** | SL | `structured` (data-based) | (part of 90 min Paper 1) | 20 | 16% | Uncertainties, graphs, linearization & experimental skills |
| **Paper 2** | SL | `structured` (short + extended) | 90 min | 50 | 44% | Multi-step and synoptic SL questions across Themes A–E |
| **Paper 1A** | HL | `mcq` (4 options A–D) | 120 min (combined sitting with 1B) | 40 | 24% (36% with 1B) | SL core + HL-only subtopics + AHL extensions |
| **Paper 1B** | HL | `structured` (data-based) | (part of 120 min Paper 1) | 20 | 12% | Experimental data analysis including log/power linearization |
| **Paper 2** | HL | `structured` (short + extended) | 150 min | 90 | 44% | Deep multi-part & cross-theme analytical questions (SL + HL) |

### 2.2 UK GCE A-Level Physics (AQA 7407 / 7408)
All written papers allow calculators and provide the AQA Data and Formulae Booklet. At least **40% of marks** require Level 2+ mathematical skills. A separate non-exam **Practical Endorsement** (12 required practicals, Pass/Fail) accompanies the A-Level grade.

| Paper | Level | Format | Duration | Marks | Weighting | Scope & Structure |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **AS Paper 1 (7407/1)** | `Y12` (AS) | `structured` | 90 min | 70 | 50% of AS | Sections 1–5 (3.1–3.5) short and long structured questions |
| **AS Paper 2 (7407/2)** | `Y12` (AS) | `structured` + `mcq` | 90 min | 70 | 50% of AS | 20m practical/data + 20m structured + **30 MCQs** (Sections 1–5) |
| **A-Level Paper 1 (7408/1)** | `Y13` | `structured` + `mcq` | 120 min | 85 | 34% of A-Level | Sections 1–5 + 6.1 (Periodic motion): 60m structured + **25 MCQs** |
| **A-Level Paper 2 (7408/2)** | `Y13` | `structured` + `mcq` | 120 min | 85 | 34% of A-Level | Sections 6.2 (Thermal), 7 (Fields), 8 (Nuclear) + synoptic 1–6.1: 60m structured + **25 MCQs** |
| **A-Level Paper 3 (7408/3)** | `Y13` | `structured` | 120 min | 80 | 32% of A-Level | Section A (45m): Practical & data analysis; Section B (35m): **One Option (Sections 9–13)** |

---

## 3. IB Physics (2025) Complete Topic Inventory & SL/HL Boundaries

| Code | Subtopic Title | Entry Level | Levels Covered | HL Extension / Exclusivity Summary | Harness Visual Families |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `T.1–T.3` | Measurement, Uncertainties & Graphs | `SL` | `SL`, `HL` | HL adds semi-log and log-log linearization of exponential and power-law data | `graphs` |
| **Theme A** | **Space, time and motion** *(27h SL / 42h HL)* | | | | |
| `A.1` | Kinematics | `SL` | `SL`, `HL` | Shared core (1D SUVAT, motion graphs, 2D projectiles, qualitative fluid drag) | `mechanics`, `graphs` |
| `A.2` | Forces and momentum | `SL` | `SL`, `HL` | Shared core (Newton's laws, friction, Hooke, Stokes drag, buoyancy, 1D/2D momentum, circular motion) | `mechanics`, `graphs`, `grav-astro` |
| `A.3` | Work, energy and power | `SL` | `SL`, `HL` | Shared core ($W = Fs\cos\theta$, $E_k = p^2/2m$, $E_p$, $E_H$, $P = Fv$, efficiency) | `mechanics`, `graphs` |
| `A.4` | **Rigid body mechanics** | **`HL`** | **`HL` only** | Torque $\tau = Fr\sin\theta$, rotational SUVAT, $I = \sum mr^2$, $\tau = I\alpha$, $L = I\omega$, rolling without slipping | `mechanics`, `graphs` |
| `A.5` | **Galilean and special relativity** | **`HL`** | **`HL` only** | Lorentz factor $\gamma$, Lorentz transformations, velocity addition, time dilation, length contraction, Minkowski diagrams | `quantum-nuclear`, `graphs` |
| **Theme B** | **The particulate nature of matter** *(24h SL / 32h HL)* | | | | |
| `B.1` | Thermal energy transfers | `SL` | `SL`, `HL` | Shared core ($Q = mc\Delta T$, $Q = mL$, Fourier conduction, Stefan-Boltzmann & Wien laws) | `thermal`, `graphs` |
| `B.2` | Greenhouse effect | `SL` | `SL`, `HL` | Shared core (solar constant, planetary albedo $\alpha$, emissivity $e$, radiative balance) | `thermal`, `graphs` |
| `B.3` | Gas laws | `SL` | `SL`, `HL` | Shared core ($PV = nRT = Nk_BT$, $P = \frac{1}{3}\rho v_{\text{rms}}^2$, $U = \frac{3}{2}nRT$) | `thermal`, `graphs` |
| `B.4` | **Thermodynamics** | **`HL`** | **`HL` only** | First law $Q = \Delta U + W$, P-V cycles, monatomic adiabatic $PV^{5/3}=\text{const}$, entropy $\Delta S = \Delta Q/T$, $S = k_B\ln\Omega$, Carnot $\eta$ | `thermal`, `graphs` |
| `B.5` | Current and circuits | `SL` | `SL`, `HL` | Shared core (Ohm's law, resistivity, series/parallel/Kirchhoff DC circuits, potential dividers, $\varepsilon = I(R+r)$) | `circuits`, `graphs` |
| **Theme C** | **Wave behaviour** *(17h SL / 29h HL)* | | | | |
| `C.1` | Simple harmonic motion | `SL` | `SL`, `HL` | **AHL**: Phase angle $\phi$ in $x = x_0\sin(\omega t + \phi)$, $v = \pm\omega\sqrt{x_0^2 - x^2}$, quantitative $E_k(x)$ & $E_p(x)$ | `optics-shm`, `graphs` |
| `C.2` | Wave model | `SL` | `SL`, `HL` | Shared core ($v = f\lambda$, transverse/longitudinal, $I \propto A^2 \propto x^{-2}$) | `waves`, `graphs` |
| `C.3` | Wave phenomena | `SL` | `SL`, `HL` | **AHL**: Single-slit diffraction $\theta = \lambda/b$, diffraction gratings $n\lambda = d\sin\theta$, modulated double-slit intensity | `waves`, `optics-shm`, `graphs` |
| `C.4` | Standing waves and resonance | `SL` | `SL`, `HL` | Shared core (string, open-pipe & closed-pipe harmonics, damping & resonance curves) | `waves`, `optics-shm`, `graphs` |
| `C.5` | Doppler effect | `SL` | `SL`, `HL` | **AHL**: Moving-source & moving-observer sound equations ($f' = f\frac{v}{v \mp u_s}$, $f' = f\frac{v \pm u_o}{v}$); SL has $\Delta f/f \approx v/c$ | `waves`, `grav-astro` |
| **Theme D** | **Fields** *(19h SL / 38h HL)* | | | | |
| `D.1` | Gravitational fields | `SL` | `SL`, `HL` | **AHL**: Gravitational potential $V_g = -GM/r$, $E_p = -GMm/r$, $g = -\Delta V_g/\Delta r$, escape speed, orbital energy | `grav-astro`, `fields`, `graphs` |
| `D.2` | Electric and magnetic fields | `SL` | `SL`, `HL` | **AHL**: Radial electric potential $V_e = kQ/r$, $E_p = kQq/r$, $E = -\Delta V_e/\Delta r$, equipotentials | `fields`, `graphs` |
| `D.3` | Motion in electromagnetic fields | `SL` | `SL`, `HL` | Shared core ($F = qvB\sin\theta$, $F = BIL\sin\theta$, cyclotron orbits, crossed-field velocity selectors) | `em-induction`, `fields` |
| `D.4` | **Induction** | **`HL`** | **`HL` only** | Magnetic flux $\Phi = BA\cos\theta$, Faraday-Lenz $\varepsilon = -N\Delta\Phi/\Delta t$, motional emf $\varepsilon = BvL$, rotating AC coils | `em-induction`, `graphs` |
| **Theme E** | **Nuclear and quantum physics** *(23h SL / 39h HL)* | | | | |
| `E.1` | Structure of the atom | `SL` | `SL`, `HL` | **AHL**: Closest approach, Fermi nuclear radius $R = R_0 A^{1/3}$, nuclear density, Bohr hydrogen $E_n = -13.6/n^2\text{ eV}$ & $mvr = nh/2\pi$ | `quantum-nuclear`, `fields` |
| `E.2` | **Quantum physics** | **`HL`** | **`HL` only** | Photoelectric equation $E_{\max} = hf - \Phi = eV_s$, de Broglie $\lambda = h/p$, Compton shift $\Delta\lambda = \frac{h}{m_ec}(1-\cos\theta)$ | `quantum-nuclear`, `graphs` |
| `E.3` | Radioactive decay | `SL` | `SL`, `HL` | **AHL**: Exponential decay $N = N_0 e^{-\lambda t}$, $A = \lambda N$, $\lambda = \ln 2 / T_{1/2}$, $\beta$ spectra; SL covers integer half-lives & $E = mc^2$ | `quantum-nuclear`, `graphs` |
| `E.4` | Fission | `SL` | `SL`, `HL` | Shared core (induced thermal fission Q-values, binding energy per nucleon, moderator/control rods/coolant) | `quantum-nuclear`, `graphs` |
| `E.5` | Fusion and stars | `SL` | `SL`, `HL` | **AHL**: Qualitative Jeans criterion, s/r-process nucleosynthesis, cosmological redshift $z = R/R_0 - 1$ & Hubble law $v = H_0 d$ | `grav-astro`, `quantum-nuclear`, `graphs` |

---

## 4. UK A-Level Physics (DfE Core + AQA 7408) Topic Inventory & Y12/Y13 Boundaries

| AQA Section | Subtopic Code & Title | Level | Option? | OCR H556 & Cambridge CIE 9702 Alignment | Harness Visual Families |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Section 1** | `3.1.1–3.1.3` SI Units, Uncertainties & Estimation | `Y12` (`Y12`, `Y13`) | Core | Identical across OCR Module 1/2 & CIE Topic 1 | `graphs` |
| **Section 2** | `3.2.1` Particles, Antiparticles, Hadrons, Leptons & Quarks | `Y12` (`Y12`, `Y13`) | Core | OCR places Quarks in Y13 Module 6.4; CIE places Particle Physics in AS Topic 11 | `quantum-nuclear` |
| **Section 2** | `3.2.2` Photoelectric Effect, Excitation & de Broglie | `Y12` (`Y12`, `Y13`) | Core | OCR Module 4.5 (Y12); CIE places Quantum in A2 Topic 22 | `quantum-nuclear`, `graphs` |
| **Section 3** | `3.3.1` Progressive Waves, Polarisation & Stationary Waves | `Y12` (`Y12`, `Y13`) | Core | OCR Module 4.4 & CIE Topics 7–8 add Malus's law $I = I_0\cos^2\theta$ explicitly | `waves`, `graphs` |
| **Section 3** | `3.3.2` Interference, Gratings, Refraction & Optical Fibres | `Y12` (`Y12`, `Y13`) | Core | Core across all UK boards (Edexcel Topic 5 also includes thin lenses in core) | `waves`, `optics-shm`, `graphs` |
| **Section 4** | `3.4.1` Vectors, Moments, SUVAT, Projectiles, Momentum & Energy | `Y12` (`Y12`, `Y13`) | Core | Core across OCR Module 3 & CIE Topics 2–5 | `mechanics`, `graphs` |
| **Section 4** | `3.4.2` Bulk Properties of Solids, Hooke's Law & Young Modulus | `Y12` (`Y12`, `Y13`) | Core | Core across OCR Module 3.4 & CIE Topic 6 | `graphs`, `mechanics` |
| **Section 5** | `3.5.1` Current Electricity, Resistivity, DC Circuits & Internal $r$ | `Y12` (`Y12`, `Y13`) | Core | Core across OCR Module 4.1–4.3 (adds $I = nAvq$) & CIE Topics 9–10 | `circuits`, `graphs` |
| **Section 6** | `3.6.1` Circular Motion, Simple Harmonic Motion & Resonance | `Y13` only | Core | Core Year 13 across OCR Module 5.2–5.3 & CIE Topics 12, 17 | `optics-shm`, `mechanics`, `graphs` |
| **Section 6** | `3.6.2` Calorimetry, Ideal Gases & Molecular Kinetic Theory | `Y13` only | Core | Core Year 13 across OCR Module 5.1 & CIE Topics 15–16 | `thermal`, `graphs` |
| **Section 7** | `3.7.1–3.7.2` Gravitational Fields, Potential & Orbits | `Y13` only | Core | Core Year 13 across OCR Module 5.4 & CIE Topic 13 | `grav-astro`, `fields`, `graphs` |
| **Section 7** | `3.7.3` Electric Fields, Coulomb's Law & Electric Potential | `Y13` only | Core | Core Year 13 across OCR Module 6.2 & CIE Topic 18 (uniform E-field in CIE AS) | `fields`, `graphs`, `mechanics` |
| **Section 7** | `3.7.4` Capacitance, Dielectrics, Energy & RC Circuits | `Y13` only | Core | Core Year 13 across OCR Module 6.1 & CIE Topic 19 (OCR/CIE add series/parallel capacitors) | `em-induction`, `circuits`, `graphs` |
| **Section 7** | `3.7.5` Magnetic Fields, Induction, AC RMS & Transformers | `Y13` only | Core | Core Year 13 across OCR Module 6.3 & CIE Topics 20–21 (CIE adds rectification) | `em-induction`, `fields`, `graphs` |
| **Section 8** | `3.8.1–3.8.6` Nuclear Radius, Exponential Decay, Binding Energy, Fission & Fusion | `Y13` only | Core | Core Year 13 across OCR Module 6.4 & CIE Topic 23 | `quantum-nuclear`, `graphs` |
| **Option 9** | `3.9` Astrophysics (Lenses, Telescopes, Stars & Cosmology) | `Y13` only | **Option** | **Compulsory Core** in OCR Module 5.5 and CIE Topic 25 | `optics-shm`, `grav-astro`, `graphs` |
| **Option 10** | `3.10` Medical Physics (Eye Optics, Ultrasound, X-Ray, PET/MRI) | `Y13` only | **Option** | **Compulsory Core** in OCR Module 6.5 and CIE Topic 24 | `optics-shm`, `waves`, `graphs` |
| **Option 11** | `3.11` Engineering Physics (Rotational Dynamics & P-V Engines) | `Y13` only | **Option** | Matches compulsory IB HL `A.4` & `B.4` | `mechanics`, `thermal`, `graphs` |
| **Option 12** | `3.12` Turning Points (Electron $e/m$, Millikan, STM & Relativity) | `Y13` only | **Option** | Matches compulsory IB HL `A.5` (Special Relativity) | `quantum-nuclear`, `em-induction`, `graphs` |
| **Option 13** | `3.13` Electronics (MOSFETs, Op-Amps & Digital Logic) | `Y13` only | **Option** | Specialized option (historical CIE option overlap) | `circuits`, `graphs` |

---

## 5. Critical Divergences, Level Inversions & Generator Guardrails

Question-bank generators and crosswalk filters **must never equate topic-name overlap with syllabus compatibility**:

1. **Topics Exclusive to UK A-Level Core (Absent from IB Physics 2025)**:
   - **Capacitance & RC exponential transients (`3.7.4`)**: $C = Q/V$, $E = \frac{1}{2}CV^2$, $\tau = RC$, $Q = Q_0 e^{-t/RC}$ are compulsory Year 13 A-Level (and NCUK IFY), but **excluded** from IB 2025.
   - **Tensile Stress, Strain & Young Modulus (`3.4.2`)**: $\sigma = F/A$, $\varepsilon = \Delta L/L$, $E = \sigma/\varepsilon$, and ductile/brittle/polymeric stress-strain curves are compulsory Year 12 A-Level, whereas IB 2025 stops at spring Hooke's law $F_H = -kx$.
   - **Quarks, Leptons, Strangeness & Baryon/Lepton Conservation (`3.2.1`)**: Compulsory Year 12 AQA (and OCR/CIE), **excluded** from IB 2025.
   - **Stretched-String Tension/Mass-Density Formula (`3.3.1`)**: $f = \frac{1}{2l}\sqrt{\frac{T}{\mu}}$ is printed in the AQA Data Booklet; IB `C.4` only uses $v = f\lambda$ with geometric boundary conditions.

2. **Topics in IB Physics 2025 Core/HL Absent from AQA Core (`3.1–3.8`)**:
   - **Planetary Greenhouse Effect & Albedo (`B.2`)**: Compulsory IB SL/HL; absent from AQA core.
   - **Stokes Viscous Drag & Archimedes Buoyancy (`A.2`)**: Compulsory IB SL/HL; in AQA, Stokes' law appears only in Option 12 (Millikan oil-drop).
   - **Compton Scattering (`E.2` HL)**: $\Delta\lambda = \frac{h}{m_ec}(1 - \cos\theta)$ is compulsory IB HL; absent from AQA.
   - **Rotational Mechanics (`A.4`), Entropy/Adiabatic Cycles (`B.4`), Special Relativity (`A.5`), and Stellar/Hubble Astrophysics (`E.5`)**: Compulsory in IB (`E.5` at SL+HL; `A.4`, `A.5`, `B.4` at HL), whereas in AQA 7408 they reside in Paper 3 Options (`3.9`, `3.11`, `3.12`).

3. **Level Inversions Between IB (`SL`/`HL`) and UK A-Level (`Y12`/`Y13`)**:
   - **Photoelectric Effect & de Broglie Wavelength**: Entry-level **Year 12 (`Y12`)** in AQA `3.2.2`, but **HL-only (`HL`)** in IB `E.2`.
   - **Diffraction Gratings & Single-Slit Diffraction**: **Year 12 (`Y12`)** in AQA `3.3.2`, but **HL-only extension (`HL`)** in IB `C.3`.
   - **Moments, Couples & Rotational Equilibrium**: **Year 12 (`Y12`)** in AQA `3.4.1`, but **HL-only (`HL`)** in IB `A.4`.
   - **Uniform Circular Motion, Ideal Gas Law & Calorimetry**: **SL Core (`SL`)** in IB `A.2`, `B.1`, `B.3`, but **Year 13 only (`Y13`)** in AQA `3.6.1` & `3.6.2`.

4. **Numerical & Notation Conventions**:
   - **Free-fall acceleration $g$**: IB 2025 Data Booklet prints $g = 9.8\text{ m s}^{-2}$; UK A-Level Data Booklets print $g = 9.81\text{ m s}^{-2}$. Any cross-tagged mechanics question should either state $g$ explicitly in the stem or verify that MCQ distractors are separated by much more than $0.1\%$.
   - **SHM Phase Convention**: IB HL Data Booklet writes $x = x_0\sin(\omega t + \phi)$; AQA Data Booklet writes $x = A\cos(\omega t)$ (specifying $x = +A$ at $t = 0$). Question stems must always define initial boundary conditions explicitly.

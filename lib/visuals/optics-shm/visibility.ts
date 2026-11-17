import {
  DEFAULT_GRAVITY_MS2,
  DEFAULT_PENDULUM_BOB_MASS_KG,
  DEFAULT_SPEED_OF_LIGHT_MS,
  OpticsShmRenderOptions,
  OpticsShmScenarioKind,
  OpticsShmScenarioSpec,
  OpticsShmSolution,
  OpticsShmVisibilityControls,
  ShmCoreKinematics,
} from "./types";

const SUBSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "-": "₋",
};

const SUPERSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "-": "⁻",
};

export function toSubscript(value: number | string): string {
  return [...String(value)].map((ch) => SUBSCRIPT_DIGITS[ch] ?? ch).join("");
}

export function toSuperscriptInt(value: number): string {
  return [...String(Math.trunc(value))]
    .map((ch) => SUPERSCRIPT_DIGITS[ch] ?? ch)
    .join("");
}

const COMMON_ALIASES: Readonly<Record<string, string>> = {
  c: "vacuumSpeedMs",
  vacuumspeed: "vacuumSpeedMs",
  vacuumspeedms: "vacuumSpeedMs",
  lambda0: "vacuumWavelengthNm",
  vacuumwavelength: "vacuumWavelengthNm",
  vacuumwavelengthnm: "vacuumWavelengthNm",
  g: "gravityMs2",
  gravity: "gravityMs2",
  gravityms2: "gravityMs2",
};

const REFRACTION_ALIASES: Readonly<Record<string, string>> = {
  n1: "n1",
  refractiveindex1: "n1",
  n2: "n2",
  refractiveindex2: "n2",
  theta1: "incidentAngleDeg",
  theta_1: "incidentAngleDeg",
  thetai: "incidentAngleDeg",
  incidentangle: "incidentAngleDeg",
  incidentangledeg: "incidentAngleDeg",
  theta2: "refractedAngleDeg",
  theta_2: "refractedAngleDeg",
  thetar: "refractedAngleDeg",
  refractedangle: "refractedAngleDeg",
  refractedangledeg: "refractedAngleDeg",
  reflectedangle: "reflectedAngleDeg",
  reflectedangledeg: "reflectedAngleDeg",
  thetac: "criticalAngleDeg",
  theta_c: "criticalAngleDeg",
  criticalangle: "criticalAngleDeg",
  criticalangledeg: "criticalAngleDeg",
  deviation: "deviationAngleDeg",
  deviationangledeg: "deviationAngleDeg",
  signeddeviationdeg: "signedDeviationDeg",
  snellinvariant: "snellInvariant",
  regime: "regime",
  istotalinternalreflection: "regime",
  iscriticalangle: "regime",
  tir: "regime",
  transmittedtofinallayer: "transmittedToFinalLayer",
  v1: "speed1Ms",
  speed1: "speed1Ms",
  speed1ms: "speed1Ms",
  v2: "speed2Ms",
  speed2: "speed2Ms",
  speed2ms: "speed2Ms",
  speedratio: "speedRatioV2OverV1",
  speedratiov2overv1: "speedRatioV2OverV1",
  wavelengthratio: "wavelengthRatio2Over1",
  wavelengthratio2over1: "wavelengthRatio2Over1",
  f: "frequencyHz",
  frequency: "frequencyHz",
  frequencyhz: "frequencyHz",
  lambda1: "wavelength1Nm",
  wavelength1: "wavelength1Nm",
  wavelength1nm: "wavelength1Nm",
  lambda2: "wavelength2Nm",
  wavelength2: "wavelength2Nm",
  wavelength2nm: "wavelength2Nm",
  emergentangle: "emergentAngleDeg",
  emergentangledeg: "emergentAngleDeg",
  d: "lateralDisplacementM",
  lateraldisplacement: "lateralDisplacementM",
  lateraldisplacementm: "lateralDisplacementM",
  totalinteriorthickness: "totalInteriorThicknessM",
  totalinteriorthicknessm: "totalInteriorThicknessM",
  transverseshift: "totalTransverseShiftM",
  totaltransverseshiftm: "totalTransverseShiftM",
  tirinterfaceindex: "tirInterfaceIndex",
  tircriticalangledeg: "tirCriticalAngleDeg",
};

const FIBER_ALIASES: Readonly<Record<string, string>> = {
  ncore: "nCore",
  n_core: "nCore",
  ncladding: "nCladding",
  n_cladding: "nCladding",
  nclad: "nCladding",
  n_clad: "nCladding",
  nexternal: "nExternal",
  n_ext: "nExternal",
  next: "nExternal",
  thetain: "launchAngleDeg",
  theta_in: "launchAngleDeg",
  launchangle: "launchAngleDeg",
  launchangledeg: "launchAngleDeg",
  na: "numericalAperture",
  numericalaperture: "numericalAperture",
  thetamax: "acceptanceAngleDeg",
  theta_max: "acceptanceAngleDeg",
  acceptanceangle: "acceptanceAngleDeg",
  acceptanceangledeg: "acceptanceAngleDeg",
  thetac: "criticalAngleDeg",
  theta_c: "criticalAngleDeg",
  criticalangle: "criticalAngleDeg",
  criticalangledeg: "criticalAngleDeg",
  coreaxisangle: "coreAxisAngleDeg",
  coreaxisangledeg: "coreAxisAngleDeg",
  thetawall: "wallIncidentAngleDeg",
  theta_wall: "wallIncidentAngleDeg",
  theta_w: "wallIncidentAngleDeg",
  wallincidentangle: "wallIncidentAngleDeg",
  wallincidentangledeg: "wallIncidentAngleDeg",
  claddingrefractedangle: "claddingRefractedAngleDeg",
  claddingrefractedangledeg: "claddingRefractedAngleDeg",
  regime: "regime",
  isguidedbytir: "regime",
  l: "fiberLengthM",
  fiberlength: "fiberLengthM",
  fiberlengthm: "fiberLengthM",
  corediameter: "coreDiameterM",
  corediameterm: "coreDiameterM",
  axialtransittime: "axialTransitTimeS",
  axialtransittimes: "axialTransitTimeS",
  maxguidedtransittime: "maxGuidedTransitTimeS",
  maxguidedtransittimes: "maxGuidedTransitTimeS",
  modaldispersiondelay: "modalDispersionDelayS",
  modaldispersiondelays: "modalDispersionDelayS",
  deltat: "modalDispersionDelayS",
  raypathlength: "rayPathLengthM",
  raypathlengthm: "rayPathLengthM",
  raytransittime: "rayTransitTimeS",
  raytransittimes: "rayTransitTimeS",
  reflectioncount: "reflectionCount",
};

const LENS_ALIASES: Readonly<Record<string, string>> = {
  f: "focalLengthM",
  focallength: "focalLengthM",
  focallengthm: "focalLengthM",
  focallengthmagnitudem: "focalLengthMagnitudeM",
  p: "opticalPowerD",
  power: "opticalPowerD",
  opticalpower: "opticalPowerD",
  opticalpowerd: "opticalPowerD",
  u: "objectDistanceM",
  do: "objectDistanceM",
  objectdistance: "objectDistanceM",
  objectdistancem: "objectDistanceM",
  v: "imageDistanceM",
  di: "imageDistanceM",
  imagedistance: "imageDistanceM",
  imagedistancem: "imageDistanceM",
  ho: "objectHeightM",
  h_o: "objectHeightM",
  objectheight: "objectHeightM",
  objectheightm: "objectHeightM",
  hi: "imageHeightM",
  h_i: "imageHeightM",
  imageheight: "imageHeightM",
  imageheightm: "imageHeightM",
  m: "magnification",
  magnification: "magnification",
  absmagnification: "absMagnification",
  separation: "objectImageSeparationM",
  objectimageseparationm: "objectImageSeparationM",
  imagenature: "imageNature",
  nature: "imageNature",
  isimageatinfinity: "imageNature",
  orientation: "orientation",
  sizeclassification: "sizeClassification",
  lenstype: "lensType",
};

const SHM_ALIASES: Readonly<Record<string, string>> = {
  m: "massKg",
  mass: "massKg",
  masskg: "massKg",
  bobmass: "bobMassKg",
  bobmasskg: "bobMassKg",
  k: "springConstantNm",
  springconstant: "springConstantNm",
  springconstantnm: "springConstantNm",
  effectivespringconstantnm: "effectiveSpringConstantNm",
  l: "lengthM",
  length: "lengthM",
  lengthm: "lengthM",
  x0: "amplitudeM",
  x_0: "amplitudeM",
  a: "amplitudeM",
  amplitude: "amplitudeM",
  amplitudem: "amplitudeM",
  theta0: "maxAngleDeg",
  theta_0: "maxAngleDeg",
  maxangle: "maxAngleDeg",
  maxangledeg: "maxAngleDeg",
  maxanglerad: "maxAngleRad",
  t: "periodS",
  period: "periodS",
  periods: "periodS",
  f: "frequencyHz",
  frequency: "frequencyHz",
  frequencyhz: "frequencyHz",
  omega: "angularFrequencyRadS",
  angularfrequency: "angularFrequencyRadS",
  angularfrequencyrads: "angularFrequencyRadS",
  phi: "initialPhaseRad",
  initialphase: "initialPhaseRad",
  initialphaserad: "initialPhaseRad",
  vmax: "maxSpeedMs",
  v_max: "maxSpeedMs",
  maxspeed: "maxSpeedMs",
  maxspeedms: "maxSpeedMs",
  amax: "maxAccelerationMs2",
  a_max: "maxAccelerationMs2",
  maxacceleration: "maxAccelerationMs2",
  maxaccelerationms2: "maxAccelerationMs2",
  fmax: "maxRestoringForceN",
  f_max: "maxRestoringForceN",
  maxrestoringforce: "maxRestoringForceN",
  maxrestoringforcen: "maxRestoringForceN",
  etotal: "totalEnergyJ",
  e_total: "totalEnergyJ",
  etot: "totalEnergyJ",
  totalenergy: "totalEnergyJ",
  totalenergyj: "totalEnergyJ",
  ek: "kineticEnergyJ",
  e_k: "kineticEnergyJ",
  kineticenergy: "kineticEnergyJ",
  kineticenergyj: "kineticEnergyJ",
  kineticenergyatquerytimej: "kineticEnergyAtQueryTimeJ",
  kineticenergyatquerydisplacementj: "kineticEnergyAtQueryDisplacementJ",
  ep: "potentialEnergyJ",
  e_p: "potentialEnergyJ",
  potentialenergy: "potentialEnergyJ",
  potentialenergyj: "potentialEnergyJ",
  potentialenergyatquerytimej: "potentialEnergyAtQueryTimeJ",
  potentialenergyatquerydisplacementj: "potentialEnergyAtQueryDisplacementJ",
  energyoscillationfrequencyhz: "energyOscillationFrequencyHz",
  energyoscillationperiods: "energyOscillationPeriodS",
  equalenergydisplacementm: "equalEnergyDisplacementM",
  staticequilibriumextension: "staticEquilibriumExtensionM",
  staticequilibriumextensionm: "staticEquilibriumExtensionM",
  equilibriumtension: "equilibriumTensionN",
  equilibriumtensionn: "equilibriumTensionN",
  extremetension: "extremeTensionN",
  extremetensionn: "extremeTensionN",
  querytime: "queryTimeS",
  querytimes: "queryTimeS",
  x: "displacementAtQueryM",
  querydisplacement: "queryDisplacementM",
  querydisplacementm: "queryDisplacementM",
  displacementatquerytimem: "displacementAtQueryTimeM",
  v: "velocityAtQueryMs",
  velocityatquerytimems: "velocityAtQueryTimeMs",
  speedatquerydisplacementms: "speedAtQueryDisplacementMs",
  positivevelocityatquerydisplacementms:
    "positiveVelocityAtQueryDisplacementMs",
  negativevelocityatquerydisplacementms:
    "negativeVelocityAtQueryDisplacementMs",
  acc: "accelerationAtQueryMs2",
  accelerationatquerytimems2: "accelerationAtQueryTimeMs2",
  accelerationatquerydisplacementms2: "accelerationAtQueryDisplacementMs2",
  restoringforceatquerytimen: "restoringForceAtQueryTimeN",
};

const COMPANION_GROUPS: Readonly<
  Record<OpticsShmScenarioKind, ReadonlyArray<readonly string[]>>
> = {
  "planar-refraction": [],
  "multi-layer-slab": [],
  "optical-fiber": [],
  "thin-lens": [
    ["focalLengthM", "focalLengthMagnitudeM"],
    ["magnification", "absMagnification"],
  ],
  "mass-spring-shm": [["springConstantNm", "effectiveSpringConstantNm"]],
  "simple-pendulum-shm": [
    ["massKg", "bobMassKg"],
    ["maxAngleDeg", "maxAngleRad"],
  ],
  "kinematic-shm": [],
};

const SHM_SHORTHAND_EXPANSIONS: Readonly<Record<string, readonly string[]>> = {
  displacementAtQueryM: ["displacementAtQueryTimeM", "queryDisplacementM"],
  velocityAtQueryMs: [
    "velocityAtQueryTimeMs",
    "speedAtQueryDisplacementMs",
    "positiveVelocityAtQueryDisplacementMs",
    "negativeVelocityAtQueryDisplacementMs",
  ],
  accelerationAtQueryMs2: [
    "accelerationAtQueryTimeMs2",
    "accelerationAtQueryDisplacementMs2",
  ],
  kineticEnergyJ: [
    "kineticEnergyAtQueryTimeJ",
    "kineticEnergyAtQueryDisplacementJ",
  ],
  potentialEnergyJ: [
    "potentialEnergyAtQueryTimeJ",
    "potentialEnergyAtQueryDisplacementJ",
  ],
};

export function canonicalizeQuantityKey(
  rawKey: string,
  kind: OpticsShmScenarioKind,
): string {
  const trimmed = rawKey.trim();
  const normalized = trimmed.toLowerCase().replace(/\s+/g, "");

  if (kind === "multi-layer-slab") {
    const layerRefMatch = /^layers?\[(\d+)\]\.?(refractiveindex|n)$/i.exec(
      trimmed,
    );
    if (layerRefMatch) {
      return `layerN:${layerRefMatch[1]}`;
    }
    const shortNMatch = /^n_?(\d+)$/i.exec(trimmed);
    if (shortNMatch) {
      return `layerN:${shortNMatch[1]}`;
    }
    const thicknessMatch =
      /^(?:layers?\[(\d+)\]\.?(?:thicknessm|thickness)|t_?(\d+))$/i.exec(
        trimmed,
      );
    if (thicknessMatch) {
      return `layerThickness:${thicknessMatch[1] ?? thicknessMatch[2]}`;
    }
    const angleMatch = /^(?:theta|angle)_?(\d+)$/i.exec(trimmed);
    if (angleMatch) {
      const idx = Number(angleMatch[1]);
      return idx === 0 ? "incidentAngleDeg" : `layerAngle:${idx}`;
    }
  }

  if (Object.hasOwn(COMMON_ALIASES, normalized)) {
    return COMMON_ALIASES[normalized];
  }

  if (kind === "planar-refraction" || kind === "multi-layer-slab") {
    if (Object.hasOwn(REFRACTION_ALIASES, normalized)) {
      return REFRACTION_ALIASES[normalized];
    }
  } else if (kind === "optical-fiber") {
    if (Object.hasOwn(FIBER_ALIASES, normalized)) {
      return FIBER_ALIASES[normalized];
    }
  } else if (kind === "thin-lens") {
    if (Object.hasOwn(LENS_ALIASES, normalized)) {
      return LENS_ALIASES[normalized];
    }
  } else {
    if (Object.hasOwn(SHM_ALIASES, normalized)) {
      return SHM_ALIASES[normalized];
    }
  }

  return trimmed;
}

export function expandQuantityKeys(
  rawKey: string,
  kind: OpticsShmScenarioKind,
): string[] {
  const canonical = canonicalizeQuantityKey(rawKey, kind);
  const expanded = new Set<string>([rawKey.trim(), canonical]);

  for (const group of COMPANION_GROUPS[kind]) {
    if (group.includes(canonical)) {
      for (const peer of group) {
        expanded.add(peer);
      }
    }
  }

  if (
    kind === "mass-spring-shm" ||
    kind === "simple-pendulum-shm" ||
    kind === "kinematic-shm"
  ) {
    const shorthandMembers = SHM_SHORTHAND_EXPANSIONS[canonical];
    if (shorthandMembers) {
      for (const member of shorthandMembers) {
        expanded.add(member);
      }
    }
    for (const [groupKey, members] of Object.entries(SHM_SHORTHAND_EXPANSIONS)) {
      if (members.includes(canonical)) {
        // Keep exact member key distinct while allowing group-level queries via isAnyHidden
        void groupKey;
      }
    }
  }

  return [...expanded];
}

function collectShmCoreQuantities(
  sol: ShmCoreKinematics,
  out: Record<string, number>,
): void {
  out.angularFrequencyRadS = sol.angularFrequencyRadS;
  out.periodS = sol.periodS;
  out.frequencyHz = sol.frequencyHz;
  out.energyOscillationFrequencyHz = sol.energyOscillationFrequencyHz;
  out.energyOscillationPeriodS = sol.energyOscillationPeriodS;
  out.amplitudeM = sol.amplitudeM;
  out.initialPhaseRad = sol.initialPhaseRad;
  out.massKg = sol.massKg;
  out.effectiveSpringConstantNm = sol.effectiveSpringConstantNm;
  out.maxSpeedMs = sol.maxSpeedMs;
  out.maxAccelerationMs2 = sol.maxAccelerationMs2;
  out.maxRestoringForceN = sol.maxRestoringForceN;
  out.totalEnergyJ = sol.totalEnergyJ;
  out.equalEnergyDisplacementM = sol.equalEnergyDisplacementM;
  out.queryTimeS = sol.queryTimeS;
  out.displacementAtQueryTimeM = sol.displacementAtQueryTimeM;
  out.velocityAtQueryTimeMs = sol.velocityAtQueryTimeMs;
  out.accelerationAtQueryTimeMs2 = sol.accelerationAtQueryTimeMs2;
  out.restoringForceAtQueryTimeN = sol.restoringForceAtQueryTimeN;
  out.kineticEnergyAtQueryTimeJ = sol.kineticEnergyAtQueryTimeJ;
  out.potentialEnergyAtQueryTimeJ = sol.potentialEnergyAtQueryTimeJ;
  out.queryDisplacementM = sol.queryDisplacementM;
  out.speedAtQueryDisplacementMs = sol.speedAtQueryDisplacementMs;
  out.positiveVelocityAtQueryDisplacementMs =
    sol.positiveVelocityAtQueryDisplacementMs;
  out.negativeVelocityAtQueryDisplacementMs =
    sol.negativeVelocityAtQueryDisplacementMs;
  out.accelerationAtQueryDisplacementMs2 =
    sol.accelerationAtQueryDisplacementMs2;
  out.kineticEnergyAtQueryDisplacementJ = sol.kineticEnergyAtQueryDisplacementJ;
  out.potentialEnergyAtQueryDisplacementJ =
    sol.potentialEnergyAtQueryDisplacementJ;
}

export function extractOpticsShmQuantities(
  spec: OpticsShmScenarioSpec,
  sol: OpticsShmSolution,
): Record<string, number> {
  const out: Record<string, number> = {};

  switch (sol.kind) {
    case "planar-refraction": {
      const pSpec = spec as Extract<
        OpticsShmScenarioSpec,
        { kind: "planar-refraction" }
      >;
      out.n1 = sol.n1;
      out.n2 = sol.n2;
      out.incidentAngleDeg = sol.incidentAngleDeg;
      out.snellInvariant = sol.snellInvariant;
      if (sol.criticalAngleDeg !== null) {
        out.criticalAngleDeg = sol.criticalAngleDeg;
      }
      if (sol.refractedAngleDeg !== null) {
        out.refractedAngleDeg = sol.refractedAngleDeg;
      }
      out.reflectedAngleDeg = sol.reflectedAngleDeg;
      out.deviationAngleDeg = sol.deviationAngleDeg;
      if (sol.signedDeviationDeg !== null) {
        out.signedDeviationDeg = sol.signedDeviationDeg;
      }
      out.speed1Ms = sol.speed1Ms;
      out.speed2Ms = sol.speed2Ms;
      out.speedRatioV2OverV1 = sol.speedRatioV2OverV1;
      out.wavelengthRatio2Over1 = sol.wavelengthRatio2Over1;
      out.vacuumSpeedMs = pSpec.vacuumSpeedMs ?? DEFAULT_SPEED_OF_LIGHT_MS;
      if (pSpec.vacuumWavelengthNm !== undefined) {
        out.vacuumWavelengthNm = pSpec.vacuumWavelengthNm;
      }
      if (sol.frequencyHz !== null) {
        out.frequencyHz = sol.frequencyHz;
      }
      if (sol.wavelength1Nm !== null) {
        out.wavelength1Nm = sol.wavelength1Nm;
      }
      if (sol.wavelength2Nm !== null) {
        out.wavelength2Nm = sol.wavelength2Nm;
      }
      break;
    }

    case "multi-layer-slab": {
      const sSpec = spec as Extract<
        OpticsShmScenarioSpec,
        { kind: "multi-layer-slab" }
      >;
      out.incidentAngleDeg = sol.incidentAngleDeg;
      out.snellInvariant = sol.snellInvariant;
      if (sol.tirInterfaceIndex !== null) {
        out.tirInterfaceIndex = sol.tirInterfaceIndex;
      }
      if (sol.tirCriticalAngleDeg !== null) {
        out.tirCriticalAngleDeg = sol.tirCriticalAngleDeg;
      }
      if (sol.emergentAngleDeg !== null) {
        out.emergentAngleDeg = sol.emergentAngleDeg;
      }
      out.totalInteriorThicknessM = sol.totalInteriorThicknessM;
      out.totalTransverseShiftM = sol.totalTransverseShiftM;
      if (sol.lateralDisplacementM !== null) {
        out.lateralDisplacementM = sol.lateralDisplacementM;
      }
      out.vacuumSpeedMs = sSpec.vacuumSpeedMs ?? DEFAULT_SPEED_OF_LIGHT_MS;
      if (sSpec.vacuumWavelengthNm !== undefined) {
        out.vacuumWavelengthNm = sSpec.vacuumWavelengthNm;
      }
      sSpec.layers.forEach((layer, idx) => {
        out[`layerN:${idx}`] = layer.refractiveIndex;
        if (layer.thicknessM !== undefined) {
          out[`layerThickness:${idx}`] = layer.thicknessM;
        }
      });
      for (const step of sol.steps) {
        if (step.layerIndex > 0) {
          out[`layerAngle:${step.layerIndex}`] = step.angleDeg;
        }
        out[`layerSpeed:${step.layerIndex}`] = step.speedMs;
        if (step.wavelengthNm !== null) {
          out[`layerWavelength:${step.layerIndex}`] = step.wavelengthNm;
        }
        if (step.transverseShiftM !== null) {
          out[`layerShift:${step.layerIndex}`] = step.transverseShiftM;
        }
      }
      break;
    }

    case "optical-fiber": {
      const fSpec = spec as Extract<
        OpticsShmScenarioSpec,
        { kind: "optical-fiber" }
      >;
      out.nCore = sol.nCore;
      out.nCladding = sol.nCladding;
      out.nExternal = sol.nExternal;
      out.launchAngleDeg = sol.launchAngleDeg;
      out.numericalAperture = sol.numericalAperture;
      out.acceptanceAngleDeg = sol.acceptanceAngleDeg;
      out.criticalAngleDeg = sol.criticalAngleDeg;
      out.coreAxisAngleDeg = sol.coreAxisAngleDeg;
      out.wallIncidentAngleDeg = sol.wallIncidentAngleDeg;
      if (sol.claddingRefractedAngleDeg !== null) {
        out.claddingRefractedAngleDeg = sol.claddingRefractedAngleDeg;
      }
      out.fiberLengthM = sol.fiberLengthM;
      if (fSpec.coreDiameterM !== undefined) {
        out.coreDiameterM = fSpec.coreDiameterM;
      }
      out.vacuumSpeedMs = fSpec.vacuumSpeedMs ?? DEFAULT_SPEED_OF_LIGHT_MS;
      out.axialTransitTimeS = sol.axialTransitTimeS;
      out.maxGuidedTransitTimeS = sol.maxGuidedTransitTimeS;
      out.modalDispersionDelayS = sol.modalDispersionDelayS;
      out.rayPathLengthM = sol.rayPathLengthM;
      out.rayTransitTimeS = sol.rayTransitTimeS;
      if (sol.reflectionCount !== null) {
        out.reflectionCount = sol.reflectionCount;
      }
      break;
    }

    case "thin-lens": {
      out.focalLengthM = sol.focalLengthM;
      out.focalLengthMagnitudeM = sol.focalLengthMagnitudeM;
      out.opticalPowerD = sol.opticalPowerD;
      out.objectDistanceM = sol.objectDistanceM;
      out.objectHeightM = sol.objectHeightM;
      if (sol.imageDistanceM !== null) {
        out.imageDistanceM = sol.imageDistanceM;
      }
      if (sol.magnification !== null) {
        out.magnification = sol.magnification;
      }
      if (sol.absMagnification !== null) {
        out.absMagnification = sol.absMagnification;
      }
      if (sol.imageHeightM !== null) {
        out.imageHeightM = sol.imageHeightM;
      }
      if (sol.objectImageSeparationM !== null) {
        out.objectImageSeparationM = sol.objectImageSeparationM;
      }
      break;
    }

    case "mass-spring-shm": {
      const mSpec = spec as Extract<
        OpticsShmScenarioSpec,
        { kind: "mass-spring-shm" }
      >;
      collectShmCoreQuantities(sol, out);
      out.springConstantNm = sol.springConstantNm;
      out.gravityMs2 = mSpec.gravityMs2 ?? DEFAULT_GRAVITY_MS2;
      out.staticEquilibriumExtensionM = sol.staticEquilibriumExtensionM;
      break;
    }

    case "simple-pendulum-shm": {
      const pSpec = spec as Extract<
        OpticsShmScenarioSpec,
        { kind: "simple-pendulum-shm" }
      >;
      collectShmCoreQuantities(sol, out);
      out.lengthM = sol.lengthM;
      out.gravityMs2 = pSpec.gravityMs2 ?? DEFAULT_GRAVITY_MS2;
      out.bobMassKg = pSpec.bobMassKg ?? DEFAULT_PENDULUM_BOB_MASS_KG;
      out.maxAngleRad = sol.maxAngleRad;
      out.maxAngleDeg = sol.maxAngleDeg;
      out.equilibriumTensionN = sol.equilibriumTensionN;
      out.extremeTensionN = sol.extremeTensionN;
      break;
    }

    case "kinematic-shm": {
      collectShmCoreQuantities(sol, out);
      break;
    }
  }

  return out;
}

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character] ?? character;
  });
}

export function formatCoord(value: number): string {
  const rounded = Number(value.toFixed(3));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function formatMetric(value: number, sigFigs = 3): string {
  if (!Number.isFinite(value)) {
    throw new Error("Cannot format non-finite metric");
  }
  if (Math.abs(value) < 1e-12) return "0";
  const absVal = Math.abs(value);
  if (absVal >= 1e4 || absVal < 1e-3) {
    const expStr = Number(value.toPrecision(sigFigs)).toExponential();
    const [mantissa, rawExp] = expStr.split("e");
    return `${mantissa} × 10${toSuperscriptInt(Number(rawExp))}`;
  }
  const rounded = Number(value.toPrecision(sigFigs));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export interface VisibilityController {
  readonly mode: "student" | "teacher";
  readonly showSymbolicHiddenLabels: boolean;
  isHidden(key: string): boolean;
  isVisible(key: string): boolean;
  isZeroHidden(): boolean;
  matchesHiddenValue(value: number): boolean;
  canShowValue(key: string, value: number): boolean;
  formatLabel(
    key: string,
    symbol: string,
    valueWithUnit: string,
    numericValue?: number,
  ): string | null;
  formatNumericLabel(
    key: string,
    symbol: string,
    value: number,
    unit?: string,
  ): string | null;
}

export function createVisibilityController(
  kind: OpticsShmScenarioKind,
  specControls: OpticsShmVisibilityControls,
  renderOptions?: OpticsShmRenderOptions,
  quantities: Readonly<Record<string, number>> = {},
): VisibilityController {
  const mode = renderOptions?.mode ?? specControls.mode ?? "student";
  const showSymbolicHiddenLabels =
    renderOptions?.showSymbolicHiddenLabels ??
    specControls.showSymbolicHiddenLabels ??
    true;

  const rawHidden = [
    ...(specControls.hiddenQuantities ?? []),
    ...(renderOptions?.hiddenQuantities ?? []),
  ];
  const hiddenSet = new Set<string>();
  for (const item of rawHidden) {
    for (const expanded of expandQuantityKeys(item, kind)) {
      hiddenSet.add(expanded);
    }
  }

  let zeroIsHidden = false;
  const hiddenMagnitudes: number[] = [];
  const hiddenFormattedMagnitudes = new Set<string>();

  if (mode !== "teacher") {
    for (const hKey of hiddenSet) {
      const val = quantities[hKey];
      if (typeof val === "number" && Number.isFinite(val)) {
        if (Math.abs(val) < 1e-12) {
          zeroIsHidden = true;
        } else {
          const mag = Math.abs(val);
          hiddenMagnitudes.push(mag);
          hiddenFormattedMagnitudes.add(formatMetric(mag, 3));
        }
      }
    }
  }

  const rawVisible =
    renderOptions?.visibleQuantities ?? specControls.visibleQuantities;
  const visibilityMode =
    renderOptions?.visibilityMode ??
    specControls.visibilityMode ??
    (rawVisible !== undefined ? "allowlist" : "all-except-hidden");

  const visibleSet = new Set<string>();
  if (rawVisible) {
    for (const item of rawVisible) {
      for (const expanded of expandQuantityKeys(item, kind)) {
        visibleSet.add(expanded);
      }
    }
  }

  const customLabels: Record<string, string> = {
    ...(specControls.customLabels ?? {}),
    ...(renderOptions?.customLabels ?? {}),
  };
  const canonicalCustomLabels = new Map<string, string>();
  for (const [k, v] of Object.entries(customLabels)) {
    for (const expanded of expandQuantityKeys(k, kind)) {
      canonicalCustomLabels.set(expanded, v);
    }
  }

  const isHidden = (key: string): boolean => {
    if (mode === "teacher") return false;
    const expanded = expandQuantityKeys(key, kind);
    return expanded.some((k) => hiddenSet.has(k));
  };

  const isVisible = (key: string): boolean => {
    if (mode === "teacher") return true;
    if (isHidden(key)) return false;
    if (visibilityMode === "allowlist") {
      const expanded = expandQuantityKeys(key, kind);
      return expanded.some((k) => visibleSet.has(k));
    }
    return true;
  };

  const isZeroHidden = (): boolean => mode !== "teacher" && zeroIsHidden;

  const matchesHiddenValue = (value: number): boolean => {
    if (mode === "teacher" || !Number.isFinite(value)) return false;
    if (Math.abs(value) < 1e-12) return zeroIsHidden;
    const mag = Math.abs(value);
    if (hiddenFormattedMagnitudes.has(formatMetric(mag, 3))) {
      return true;
    }
    return hiddenMagnitudes.some(
      (hMag) => Math.abs(mag - hMag) <= 1e-6 * Math.max(mag, hMag),
    );
  };

  const canShowValue = (key: string, value: number): boolean =>
    isVisible(key) && !matchesHiddenValue(value);

  const customLabelLeaksHidden = (text: string): boolean => {
    if (mode === "teacher") return false;
    if (zeroIsHidden && /(?<![\d.])0(?![\d.])/.test(text)) {
      return true;
    }
    for (const fmt of hiddenFormattedMagnitudes) {
      const escaped = fmt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(?<![\\d.])${escaped}(?![\\d.])`).test(text)) {
        return true;
      }
    }
    return false;
  };

  const formatLabel = (
    key: string,
    symbol: string,
    valueWithUnit: string,
    numericValue?: number,
  ): string | null => {
    const allowed =
      numericValue !== undefined
        ? canShowValue(key, numericValue)
        : isVisible(key);
    if (allowed) {
      const canonical = canonicalizeQuantityKey(key, kind);
      const custom =
        canonicalCustomLabels.get(key) ?? canonicalCustomLabels.get(canonical);
      if (custom !== undefined) {
        if (customLabelLeaksHidden(custom)) {
          return showSymbolicHiddenLabels ? symbol : null;
        }
        return custom;
      }
      return `${symbol} = ${valueWithUnit}`;
    }
    return showSymbolicHiddenLabels ? symbol : null;
  };

  const formatNumericLabel = (
    key: string,
    symbol: string,
    value: number,
    unit?: string,
  ): string | null => {
    const formattedNum = formatMetric(value, 3);
    const valueWithUnit =
      unit === undefined || unit === ""
        ? formattedNum
        : unit === "°"
          ? `${formattedNum}°`
          : `${formattedNum} ${unit}`;
    return formatLabel(key, symbol, valueWithUnit, value);
  };

  return {
    mode,
    showSymbolicHiddenLabels,
    isHidden,
    isVisible,
    isZeroHidden,
    matchesHiddenValue,
    canShowValue,
    formatLabel,
    formatNumericLabel,
  };
}

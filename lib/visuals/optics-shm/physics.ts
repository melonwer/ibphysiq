import { Point2D } from "../types";
import {
  DEFAULT_GRAVITY_MS2,
  DEFAULT_PENDULUM_BOB_MASS_KG,
  DEFAULT_SPEED_OF_LIGHT_MS,
  KinematicShmSolution,
  KinematicShmSpec,
  MassSpringShmSolution,
  MassSpringShmSpec,
  MultiLayerSlabSolution,
  MultiLayerSlabSpec,
  OpticalFiberRegime,
  OpticalFiberSolution,
  OpticalFiberSpec,
  OpticsShmScenarioSpec,
  OpticsShmSolution,
  PlanarRefractionSolution,
  PlanarRefractionSpec,
  PrincipalRayGeometry,
  RefractionRegime,
  ShmCommonControls,
  ShmCoreKinematics,
  ShmDisplacementSample,
  ShmPhaseConvention,
  ShmTimeSample,
  SimplePendulumShmSolution,
  SimplePendulumShmSpec,
  SlabLayerStep,
  ThinLensSolution,
  ThinLensSpec,
} from "./types";
import { validateOpticsShmScenario } from "./validation";

const BOUNDARY_EPS = 1e-12;

function normalizeZero(value: number): number {
  return Math.abs(value) < 1e-15 ? 0 : value;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function unitVector(dx: number, dy: number): Point2D {
  const mag = Math.hypot(dx, dy);
  return { x: dx / mag, y: dy / mag };
}

export function criticalAngleDeg(n1: number, n2: number): number | null {
  if (n1 <= n2) return null;
  return radToDeg(Math.asin(Math.min(1, n2 / n1)));
}

export function snellsLawAngleDeg(
  n1: number,
  n2: number,
  incidentAngleDeg: number,
): number | null {
  const sinTheta2 = (n1 * Math.sin(degToRad(incidentAngleDeg))) / n2;
  if (sinTheta2 > 1 + BOUNDARY_EPS) return null;
  if (Math.abs(sinTheta2 - 1) <= BOUNDARY_EPS) return 90;
  return radToDeg(Math.asin(Math.min(1, Math.max(0, sinTheta2))));
}

function solvePlanarRefraction(
  spec: PlanarRefractionSpec,
): PlanarRefractionSolution {
  const c = spec.vacuumSpeedMs ?? DEFAULT_SPEED_OF_LIGHT_MS;
  const theta1Rad = degToRad(spec.incidentAngleDeg);
  const snellInvariant = spec.n1 * Math.sin(theta1Rad);
  const critDeg = criticalAngleDeg(spec.n1, spec.n2);
  const sinTheta2 = snellInvariant / spec.n2;

  let regime: RefractionRegime;
  let isTotalInternalReflection = false;
  let isCriticalAngle = false;
  let refractedAngleDeg: number | null;
  let deviationAngleDeg: number;
  let signedDeviationDeg: number | null;

  if (sinTheta2 > 1 + BOUNDARY_EPS) {
    regime = "total-internal-reflection";
    isTotalInternalReflection = true;
    refractedAngleDeg = null;
    deviationAngleDeg = 180 - 2 * spec.incidentAngleDeg;
    signedDeviationDeg = null;
  } else if (spec.n1 > spec.n2 && Math.abs(sinTheta2 - 1) <= BOUNDARY_EPS) {
    regime = "critical-angle";
    isCriticalAngle = true;
    refractedAngleDeg = 90;
    signedDeviationDeg = 90 - spec.incidentAngleDeg;
    deviationAngleDeg = Math.abs(signedDeviationDeg);
  } else {
    regime = "refraction";
    refractedAngleDeg = normalizeZero(
      radToDeg(Math.asin(Math.min(1, Math.max(0, sinTheta2)))),
    );
    signedDeviationDeg = normalizeZero(
      refractedAngleDeg - spec.incidentAngleDeg,
    );
    deviationAngleDeg = Math.abs(signedDeviationDeg);
  }

  const speed1Ms = c / spec.n1;
  const speed2Ms = c / spec.n2;
  const ratio = spec.n1 / spec.n2;

  const hasLambda = spec.vacuumWavelengthNm !== undefined;
  const frequencyHz = hasLambda
    ? (c * 1e9) / spec.vacuumWavelengthNm!
    : null;
  const wavelength1Nm = hasLambda ? spec.vacuumWavelengthNm! / spec.n1 : null;
  const wavelength2Nm = hasLambda ? spec.vacuumWavelengthNm! / spec.n2 : null;

  return {
    kind: "planar-refraction",
    n1: spec.n1,
    n2: spec.n2,
    incidentAngleDeg: spec.incidentAngleDeg,
    snellInvariant: normalizeZero(snellInvariant),
    criticalAngleDeg: critDeg,
    regime,
    isTotalInternalReflection,
    isCriticalAngle,
    refractedAngleDeg,
    reflectedAngleDeg: spec.incidentAngleDeg,
    deviationAngleDeg: normalizeZero(deviationAngleDeg),
    signedDeviationDeg,
    speed1Ms,
    speed2Ms,
    speedRatioV2OverV1: ratio,
    wavelengthRatio2Over1: ratio,
    frequencyHz,
    wavelength1Nm,
    wavelength2Nm,
  };
}

function solveMultiLayerSlab(spec: MultiLayerSlabSpec): MultiLayerSlabSolution {
  const c = spec.vacuumSpeedMs ?? DEFAULT_SPEED_OF_LIGHT_MS;
  const n0 = spec.layers[0].refractiveIndex;
  const theta0Rad = degToRad(spec.incidentAngleDeg);
  const snellInvariant = n0 * Math.sin(theta0Rad);

  const steps: SlabLayerStep[] = [];
  let transmittedToFinalLayer = true;
  let tirInterfaceIndex: number | null = null;
  let tirCriticalAngleDeg: number | null = null;
  let totalInteriorThicknessM = 0;
  let totalTransverseShiftM = 0;

  for (let i = 0; i < spec.layers.length; i++) {
    const layer = spec.layers[i];
    const n = layer.refractiveIndex;
    let angleDeg: number;

    if (i === 0) {
      angleDeg = spec.incidentAngleDeg;
    } else {
      const sinTheta = snellInvariant / n;
      if (sinTheta > 1 + BOUNDARY_EPS) {
        transmittedToFinalLayer = false;
        tirInterfaceIndex = i - 1;
        const prevN = spec.layers[i - 1].refractiveIndex;
        tirCriticalAngleDeg = radToDeg(Math.asin(Math.min(1, n / prevN)));
        break;
      }
      angleDeg =
        Math.abs(sinTheta - 1) <= BOUNDARY_EPS
          ? 90
          : normalizeZero(
              radToDeg(Math.asin(Math.min(1, Math.max(0, sinTheta)))),
            );
    }

    const isInterior = i > 0 && i < spec.layers.length - 1;
    const thicknessM =
      isInterior && layer.thicknessM !== undefined ? layer.thicknessM : null;
    let transverseShiftM: number | null = null;

    if (thicknessM !== null && angleDeg < 89.999999) {
      transverseShiftM = normalizeZero(thicknessM * Math.tan(degToRad(angleDeg)));
      totalInteriorThicknessM += thicknessM;
      totalTransverseShiftM += transverseShiftM;
    }

    steps.push({
      layerIndex: i,
      name: layer.name ?? `Medium ${i + 1}`,
      refractiveIndex: n,
      angleDeg,
      speedMs: c / n,
      wavelengthNm:
        spec.vacuumWavelengthNm !== undefined
          ? spec.vacuumWavelengthNm / n
          : null,
      thicknessM,
      transverseShiftM,
    });

    if (i > 0 && i < spec.layers.length - 1 && angleDeg === 90) {
      transmittedToFinalLayer = false;
      break;
    }
  }

  const emergentAngleDeg = transmittedToFinalLayer
    ? steps[steps.length - 1].angleDeg
    : null;

  const finalN = spec.layers[spec.layers.length - 1].refractiveIndex;
  let lateralDisplacementM: number | null = null;
  if (
    transmittedToFinalLayer &&
    Math.abs(finalN - n0) <= 1e-9 &&
    totalInteriorThicknessM > 0
  ) {
    const unrefractedShift = totalInteriorThicknessM * Math.tan(theta0Rad);
    lateralDisplacementM = normalizeZero(
      Math.abs(unrefractedShift - totalTransverseShiftM) * Math.cos(theta0Rad),
    );
  }

  return {
    kind: "multi-layer-slab",
    incidentAngleDeg: spec.incidentAngleDeg,
    snellInvariant: normalizeZero(snellInvariant),
    steps,
    transmittedToFinalLayer,
    tirInterfaceIndex,
    tirCriticalAngleDeg,
    emergentAngleDeg,
    totalInteriorThicknessM: normalizeZero(totalInteriorThicknessM),
    totalTransverseShiftM: normalizeZero(totalTransverseShiftM),
    lateralDisplacementM,
  };
}

function solveOpticalFiber(spec: OpticalFiberSpec): OpticalFiberSolution {
  const nExternal = spec.nExternal ?? 1;
  const fiberLengthM = spec.fiberLengthM ?? 1;
  const c = spec.vacuumSpeedMs ?? DEFAULT_SPEED_OF_LIGHT_MS;

  const numericalAperture = Math.sqrt(
    spec.nCore * spec.nCore - spec.nCladding * spec.nCladding,
  );
  const sinAccept = numericalAperture / nExternal;
  const acceptanceAngleDeg =
    sinAccept >= 1 - BOUNDARY_EPS ? 90 : radToDeg(Math.asin(sinAccept));
  const critDeg = radToDeg(Math.asin(spec.nCladding / spec.nCore));

  const sinCoreAxis =
    (nExternal * Math.sin(degToRad(spec.launchAngleDeg))) / spec.nCore;
  const coreAxisAngleRad = Math.asin(Math.min(1, Math.max(0, sinCoreAxis)));
  const coreAxisAngleDeg = normalizeZero(radToDeg(coreAxisAngleRad));
  const wallIncidentAngleDeg = normalizeZero(90 - coreAxisAngleDeg);
  const sinCladding =
    (spec.nCore * Math.sin(degToRad(wallIncidentAngleDeg))) / spec.nCladding;

  let regime: OpticalFiberRegime;
  let isGuidedByTir: boolean;
  let claddingRefractedAngleDeg: number | null;

  if (sinCladding > 1 + BOUNDARY_EPS) {
    regime = "guided-tir";
    isGuidedByTir = true;
    claddingRefractedAngleDeg = null;
  } else if (Math.abs(sinCladding - 1) <= BOUNDARY_EPS) {
    regime = "critical-grazing";
    isGuidedByTir = true;
    claddingRefractedAngleDeg = 90;
  } else {
    regime = "cladding-leakage";
    isGuidedByTir = false;
    claddingRefractedAngleDeg = normalizeZero(
      radToDeg(Math.asin(Math.min(1, Math.max(0, sinCladding)))),
    );
  }

  const axialTransitTimeS = (spec.nCore * fiberLengthM) / c;
  const maxGuidedTransitTimeS =
    (spec.nCore * spec.nCore * fiberLengthM) / (c * spec.nCladding);
  const modalDispersionDelayS = normalizeZero(
    maxGuidedTransitTimeS - axialTransitTimeS,
  );
  const rayPathLengthM = fiberLengthM / Math.cos(coreAxisAngleRad);
  const rayTransitTimeS = (spec.nCore * rayPathLengthM) / c;

  let reflectionCount: number | null = null;
  if (spec.coreDiameterM !== undefined && isGuidedByTir) {
    if (coreAxisAngleRad < 1e-12) {
      reflectionCount = 0;
    } else {
      reflectionCount = Math.floor(
        (fiberLengthM * Math.tan(coreAxisAngleRad)) / spec.coreDiameterM + 0.5,
      );
    }
  }

  return {
    kind: "optical-fiber",
    nCore: spec.nCore,
    nCladding: spec.nCladding,
    nExternal,
    launchAngleDeg: spec.launchAngleDeg,
    numericalAperture,
    acceptanceAngleDeg,
    criticalAngleDeg: critDeg,
    coreAxisAngleDeg,
    wallIncidentAngleDeg,
    claddingRefractedAngleDeg,
    isGuidedByTir,
    regime,
    fiberLengthM,
    axialTransitTimeS,
    maxGuidedTransitTimeS,
    modalDispersionDelayS,
    rayPathLengthM,
    rayTransitTimeS,
    reflectionCount,
  };
}

export function solveThinLens(spec: ThinLensSpec): ThinLensSolution {
  const signedFocalLengthM =
    spec.lensType === "diverging"
      ? -Math.abs(spec.focalLengthM)
      : spec.focalLengthM;
  const focalLengthMagnitudeM = Math.abs(signedFocalLengthM);
  const opticalPowerD = 1 / signedFocalLengthM;
  const u = spec.objectDistanceM;
  const ho = spec.objectHeightM ?? 0.04;

  const atFocalPoint =
    signedFocalLengthM > 0 &&
    Math.abs(u - signedFocalLengthM) <=
      BOUNDARY_EPS * Math.max(1, focalLengthMagnitudeM);

  if (atFocalPoint) {
    const slope = -ho / signedFocalLengthM;
    const dir = unitVector(1, slope);
    const principalRays: PrincipalRayGeometry[] = [
      {
        id: "parallel-focus",
        incidentStart: { x: -u, y: ho },
        lensHit: { x: 0, y: ho },
        transmittedDirection: dir,
        virtualExtensionEnd: null,
        frontFocusGuideStart: null,
      },
      {
        id: "optical-center",
        incidentStart: { x: -u, y: ho },
        lensHit: { x: 0, y: 0 },
        transmittedDirection: dir,
        virtualExtensionEnd: null,
        frontFocusGuideStart: null,
      },
    ];

    return {
      kind: "thin-lens",
      lensType: spec.lensType,
      focalLengthM: signedFocalLengthM,
      focalLengthMagnitudeM,
      opticalPowerD,
      objectDistanceM: u,
      objectHeightM: ho,
      isImageAtInfinity: true,
      imageDistanceM: null,
      magnification: null,
      absMagnification: null,
      imageHeightM: null,
      objectImageSeparationM: null,
      imageNature: "at-infinity",
      orientation: "none",
      sizeClassification: "infinite",
      principalRays,
    };
  }

  const v = (u * signedFocalLengthM) / (u - signedFocalLengthM);
  const m = normalizeZero(-v / u);
  const absM = Math.abs(m);
  const hi = normalizeZero(m * ho);
  const separation = Math.abs(u + v);

  const imageNature = v > 0 ? "real" : "virtual";
  const orientation = m < 0 ? "inverted" : "upright";
  const sizeClassification =
    Math.abs(absM - 1) <= 1e-9
      ? "same-size"
      : absM > 1
        ? "magnified"
        : "diminished";

  const ray1Slope = -ho / signedFocalLengthM;
  const ray1VirtualEnd =
    v < 0
      ? signedFocalLengthM < 0
        ? { x: signedFocalLengthM, y: 0 }
        : { x: v, y: hi }
      : null;

  const ray2VirtualEnd = v < -u ? { x: v, y: hi } : null;

  const ray3VirtualEnd = v < 0 ? { x: v, y: hi } : null;
  const ray3FocusGuide =
    signedFocalLengthM > 0 && u < signedFocalLengthM
      ? { x: -signedFocalLengthM, y: 0 }
      : signedFocalLengthM < 0
        ? { x: -signedFocalLengthM, y: 0 }
        : null;

  const principalRays: PrincipalRayGeometry[] = [
    {
      id: "parallel-focus",
      incidentStart: { x: -u, y: ho },
      lensHit: { x: 0, y: ho },
      transmittedDirection: unitVector(1, ray1Slope),
      virtualExtensionEnd: ray1VirtualEnd,
      frontFocusGuideStart: null,
    },
    {
      id: "optical-center",
      incidentStart: { x: -u, y: ho },
      lensHit: { x: 0, y: 0 },
      transmittedDirection: unitVector(1, -ho / u),
      virtualExtensionEnd: ray2VirtualEnd,
      frontFocusGuideStart: null,
    },
    {
      id: "focus-parallel",
      incidentStart: { x: -u, y: ho },
      lensHit: { x: 0, y: hi },
      transmittedDirection: { x: 1, y: 0 },
      virtualExtensionEnd: ray3VirtualEnd,
      frontFocusGuideStart: ray3FocusGuide,
    },
  ];

  return {
    kind: "thin-lens",
    lensType: spec.lensType,
    focalLengthM: signedFocalLengthM,
    focalLengthMagnitudeM,
    opticalPowerD,
    objectDistanceM: u,
    objectHeightM: ho,
    isImageAtInfinity: false,
    imageDistanceM: normalizeZero(v),
    magnification: m,
    absMagnification: absM,
    imageHeightM: hi,
    objectImageSeparationM: normalizeZero(separation),
    imageNature,
    orientation,
    sizeClassification,
    principalRays,
  };
}

export function shmStateAtTime(params: {
  amplitudeM: number;
  angularFrequencyRadS: number;
  initialPhaseRad: number;
  phaseConvention: ShmPhaseConvention;
  massKg: number;
  timeS: number;
}): ShmTimeSample {
  const {
    amplitudeM: x0,
    angularFrequencyRadS: omega,
    initialPhaseRad: phi,
    phaseConvention,
    massKg: m,
    timeS: t,
  } = params;
  const phase = omega * t + phi;
  const kEff = m * omega * omega;
  const totalEnergyJ = 0.5 * kEff * x0 * x0;

  let x: number;
  let v: number;
  if (phaseConvention === "sine") {
    x = x0 * Math.sin(phase);
    v = omega * x0 * Math.cos(phase);
  } else {
    x = x0 * Math.cos(phase);
    v = -omega * x0 * Math.sin(phase);
  }
  const a = -omega * omega * x;
  const potentialEnergyJ = 0.5 * kEff * x * x;
  const kineticEnergyJ = Math.max(0, totalEnergyJ - potentialEnergyJ);

  return {
    timeS: normalizeZero(t),
    displacementM: normalizeZero(x),
    velocityMs: normalizeZero(v),
    accelerationMs2: normalizeZero(a),
    kineticEnergyJ: normalizeZero(kineticEnergyJ),
    potentialEnergyJ: normalizeZero(potentialEnergyJ),
    totalEnergyJ: normalizeZero(totalEnergyJ),
  };
}

export function shmSpeedAtDisplacement(
  angularFrequencyRadS: number,
  amplitudeM: number,
  displacementM: number,
): number {
  const rad = Math.max(0, amplitudeM * amplitudeM - displacementM * displacementM);
  return normalizeZero(angularFrequencyRadS * Math.sqrt(rad));
}

function computeShmCoreKinematics(
  omega: number,
  amplitudeM: number,
  massKg: number,
  controls: ShmCommonControls,
): ShmCoreKinematics {
  const periodS = (2 * Math.PI) / omega;
  const frequencyHz = 1 / periodS;
  const initialPhaseRad = controls.initialPhaseRad ?? 0;
  const phaseConvention = controls.phaseConvention ?? "cosine";
  const effectiveSpringConstantNm = massKg * omega * omega;
  const maxSpeedMs = omega * amplitudeM;
  const maxAccelerationMs2 = omega * omega * amplitudeM;
  const maxRestoringForceN = effectiveSpringConstantNm * amplitudeM;
  const totalEnergyJ = 0.5 * effectiveSpringConstantNm * amplitudeM * amplitudeM;
  const equalEnergyDisplacementM = amplitudeM / Math.SQRT2;

  const queryTimeS = controls.queryTimeS ?? 0;
  const atQueryTime = shmStateAtTime({
    amplitudeM,
    angularFrequencyRadS: omega,
    initialPhaseRad,
    phaseConvention,
    massKg,
    timeS: queryTimeS,
  });

  const queryDisplacementM =
    controls.queryDisplacementM !== undefined
      ? Math.max(-amplitudeM, Math.min(amplitudeM, controls.queryDisplacementM))
      : atQueryTime.displacementM;
  const speedAtX = shmSpeedAtDisplacement(
    omega,
    amplitudeM,
    queryDisplacementM,
  );
  const accelAtX = normalizeZero(-omega * omega * queryDisplacementM);
  const epAtX = normalizeZero(
    0.5 * effectiveSpringConstantNm * queryDisplacementM * queryDisplacementM,
  );
  const ekAtX = normalizeZero(Math.max(0, totalEnergyJ - epAtX));

  const cycles = controls.cyclesToRender ?? 2;
  const durationS = cycles * periodS;
  const timeStepCount = 120;
  const timeSeries: ShmTimeSample[] = Array.from(
    { length: timeStepCount + 1 },
    (_, i) =>
      shmStateAtTime({
        amplitudeM,
        angularFrequencyRadS: omega,
        initialPhaseRad,
        phaseConvention,
        massKg,
        timeS: (durationS * i) / timeStepCount,
      }),
  );

  const dispStepCount = 80;
  const displacementSeries: ShmDisplacementSample[] = Array.from(
    { length: dispStepCount + 1 },
    (_, i) => {
      const x = -amplitudeM + (2 * amplitudeM * i) / dispStepCount;
      const spd = shmSpeedAtDisplacement(omega, amplitudeM, x);
      const ep = 0.5 * effectiveSpringConstantNm * x * x;
      const ek = Math.max(0, totalEnergyJ - ep);
      return {
        displacementM: normalizeZero(x),
        speedMs: spd,
        accelerationMs2: normalizeZero(-omega * omega * x),
        kineticEnergyJ: normalizeZero(ek),
        potentialEnergyJ: normalizeZero(ep),
        totalEnergyJ: normalizeZero(totalEnergyJ),
      };
    },
  );

  return {
    angularFrequencyRadS: omega,
    periodS,
    frequencyHz,
    energyOscillationFrequencyHz: 2 * frequencyHz,
    energyOscillationPeriodS: periodS / 2,
    amplitudeM,
    initialPhaseRad,
    phaseConvention,
    massKg,
    effectiveSpringConstantNm,
    maxSpeedMs,
    maxAccelerationMs2,
    maxRestoringForceN,
    totalEnergyJ,
    equalEnergyDisplacementM,
    queryTimeS,
    displacementAtQueryTimeM: atQueryTime.displacementM,
    velocityAtQueryTimeMs: atQueryTime.velocityMs,
    accelerationAtQueryTimeMs2: atQueryTime.accelerationMs2,
    restoringForceAtQueryTimeN: normalizeZero(
      -effectiveSpringConstantNm * atQueryTime.displacementM,
    ),
    kineticEnergyAtQueryTimeJ: atQueryTime.kineticEnergyJ,
    potentialEnergyAtQueryTimeJ: atQueryTime.potentialEnergyJ,
    queryDisplacementM: normalizeZero(queryDisplacementM),
    speedAtQueryDisplacementMs: speedAtX,
    positiveVelocityAtQueryDisplacementMs: speedAtX,
    negativeVelocityAtQueryDisplacementMs: normalizeZero(-speedAtX),
    accelerationAtQueryDisplacementMs2: accelAtX,
    kineticEnergyAtQueryDisplacementJ: ekAtX,
    potentialEnergyAtQueryDisplacementJ: epAtX,
    timeSeries,
    displacementSeries,
  };
}

function solveMassSpringShm(spec: MassSpringShmSpec): MassSpringShmSolution {
  const orientation = spec.orientation ?? "horizontal";
  const gravityMs2 = spec.gravityMs2 ?? DEFAULT_GRAVITY_MS2;
  const omega = Math.sqrt(spec.springConstantNm / spec.massKg);
  const core = computeShmCoreKinematics(
    omega,
    spec.amplitudeM,
    spec.massKg,
    spec,
  );
  const staticEquilibriumExtensionM =
    orientation === "vertical"
      ? (spec.massKg * gravityMs2) / spec.springConstantNm
      : 0;

  return {
    kind: "mass-spring-shm",
    ...core,
    orientation,
    springConstantNm: spec.springConstantNm,
    gravityMs2,
    staticEquilibriumExtensionM: normalizeZero(staticEquilibriumExtensionM),
  };
}

function solveSimplePendulumShm(
  spec: SimplePendulumShmSpec,
): SimplePendulumShmSolution {
  const gravityMs2 = spec.gravityMs2 ?? DEFAULT_GRAVITY_MS2;
  const bobMassKg = spec.bobMassKg ?? DEFAULT_PENDULUM_BOB_MASS_KG;
  const maxAngleDeg =
    spec.maxAngleDeg !== undefined
      ? spec.maxAngleDeg
      : radToDeg(spec.amplitudeM! / spec.lengthM);
  const maxAngleRad = degToRad(maxAngleDeg);
  const amplitudeM =
    spec.amplitudeM !== undefined
      ? spec.amplitudeM
      : spec.lengthM * maxAngleRad;

  const omega = Math.sqrt(gravityMs2 / spec.lengthM);
  const core = computeShmCoreKinematics(omega, amplitudeM, bobMassKg, spec);

  const equilibriumTensionN =
    bobMassKg * (gravityMs2 + (core.maxSpeedMs * core.maxSpeedMs) / spec.lengthM);
  const extremeTensionN = bobMassKg * gravityMs2 * Math.cos(maxAngleRad);

  return {
    kind: "simple-pendulum-shm",
    ...core,
    lengthM: spec.lengthM,
    gravityMs2,
    bobMassKg,
    maxAngleRad,
    maxAngleDeg,
    equilibriumTensionN,
    extremeTensionN,
  };
}

function solveKinematicShm(spec: KinematicShmSpec): KinematicShmSolution {
  const omega =
    spec.angularFrequencyRadS !== undefined
      ? spec.angularFrequencyRadS
      : spec.frequencyHz !== undefined
        ? 2 * Math.PI * spec.frequencyHz
        : (2 * Math.PI) / spec.periodS!;
  const massKg = spec.massKg ?? 1;
  const core = computeShmCoreKinematics(omega, spec.amplitudeM, massKg, spec);

  return {
    kind: "kinematic-shm",
    ...core,
  };
}

export function solveOpticsShmScenario(
  spec: OpticsShmScenarioSpec,
): OpticsShmSolution {
  const validation = validateOpticsShmScenario(spec);
  if (!validation.valid) {
    throw new Error(
      `Invalid optics-shm scenario (${spec.kind}): ${validation.issues
        .map((issue) => `${issue.path || "spec"}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  switch (spec.kind) {
    case "planar-refraction":
      return solvePlanarRefraction(spec);
    case "multi-layer-slab":
      return solveMultiLayerSlab(spec);
    case "optical-fiber":
      return solveOpticalFiber(spec);
    case "thin-lens":
      return solveThinLens(spec);
    case "mass-spring-shm":
      return solveMassSpringShm(spec);
    case "simple-pendulum-shm":
      return solveSimplePendulumShm(spec);
    case "kinematic-shm":
      return solveKinematicShm(spec);
    default: {
      const exhaustive: never = spec;
      throw new Error(`Unsupported optics-shm scenario: ${String(exhaustive)}`);
    }
  }
}

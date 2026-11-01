import {ratios,compensatedY} from './transmission.mjs';

export const transitionMs=1050;
// Zero velocity and acceleration at both ends; clamp frame timestamps too.
export function ease(progress){
  const t=Math.max(0,Math.min(1,progress));
  return t*t*t*(t*(t*6-15)+10);
}

// Display zero: align the exported axle with the plate's CAD +X edge.
// Move both inputs along a compensated steering path, preserving every mesh
// constraint and the wheel's phase relative to the fork. Not hardware calibration.
export function displayOrigin(axleDirection){
  const carrier=-Math.atan2(axleDirection[1],axleDirection[0]);
  const B=carrier/ratios.steer;
  return {B,Y:compensatedY(B),carrier};
}

// Drain OrbitControls' pending inertia through its public API, without moving
// the displayed pose. Programmatic animation then has sole camera ownership.
export function clearOrbitInertia(camera,controls){
  const position=camera.position.clone(),target=controls.target.clone();
  const damping=controls.enableDamping;
  controls.enableDamping=false;
  controls.update();
  camera.position.copy(position);controls.target.copy(target);
  controls.update();
  controls.enableDamping=damping;
}

import {ratios,compensatedY} from './transmission.25e55b2717cf.mjs';

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

// Interpolate orbit angles, not Cartesian positions: a straight position lerp
// concentrates the azimuth change at the very end of a near-vertical view.
export function cameraFlight(camera,controls,target,position){
  const from=camera.position.clone().sub(controls.target),to=position.clone().sub(target);
  const r0=from.length(),r1=to.length();
  const yaw0=Math.atan2(from.y,from.x),yaw1=Math.atan2(to.y,to.x);
  return {targetFrom:controls.target.clone(),target:target.clone(),r0,r1,yaw0,
    yawDelta:Math.atan2(Math.sin(yaw1-yaw0),Math.cos(yaw1-yaw0)),
    tilt0:Math.acos(Math.max(-1,Math.min(1,from.z/r0))),
    tilt1:Math.acos(Math.max(-1,Math.min(1,to.z/r1)))};
}
export function applyCameraFlight(flight,t,camera,controls){
  const {r0,r1,yaw0,yawDelta,tilt0,tilt1}=flight;
  const radius=r0+(r1-r0)*t,yaw=yaw0+yawDelta*t,tilt=tilt0+(tilt1-tilt0)*t;
  controls.target.lerpVectors(flight.targetFrom,flight.target,t);
  camera.position.set(radius*Math.sin(tilt)*Math.cos(yaw),radius*Math.sin(tilt)*Math.sin(yaw),radius*Math.cos(tilt)).add(controls.target);
  camera.lookAt(controls.target);
}

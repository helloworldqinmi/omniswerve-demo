// CAD display configuration. These are not firmware commissioning parameters.
export const teeth = Object.freeze({B1:12,B2:36,B3:18,B4:72,Y1:28,Y2:20,Y3:23,Y4:23,Y5:15,Y6:60});
export const ratios = Object.freeze({steer:teeth.B1/teeth.B2*teeth.B3/teeth.B4,
  belt:teeth.Y1/teeth.Y2, spur:teeth.Y3/teeth.Y4, bevel:teeth.Y5/teeth.Y6});
// Inputs: finite continuous output-shaft angles (rad), or rates (rad/s).
// The same linear map applies to both. Planet angle is relative to the carrier.
export function transmission(B,Y) {
  const carrier = ratios.steer*B;
  const Y23 = ratios.belt*Y;
  const planet = -ratios.spur*(Y23-carrier);
  return {B1:B,B23:-teeth.B1/teeth.B2*B,carrier,Y1:Y,Y23,planet,
    planetAbsolute:carrier+planet,wheel:-ratios.bevel*planet};
}
export const compensatedY = B => ratios.steer*B/ratios.belt;
export const rpmToRadians = rpm => rpm*Math.PI/30;
export const radiansToRpm = radians => radians*30/Math.PI;

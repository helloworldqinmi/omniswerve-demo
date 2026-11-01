import {teeth,ratios} from './transmission.mjs';

const n=value=>`<mn>${value}</mn>`;
const op=value=>`<mo>${value}</mo>`;
const row=value=>`<mrow>${value}</mrow>`;
const frac=(a,b)=>`<mfrac>${row(a)}${row(b)}</mfrac>`;
const w=label=>`<msub><mi>ω</mi><mtext>${label}</mtext></msub>`;
const times=op('·'),eq=op('='),minus=op('−');
const ratio=(a,b)=>frac(n(teeth[a]),n(teeth[b]));
const difference=row(op('(')+w('Y3')+minus+w('转向')+op(')'));
const math=(label,content)=>`<math xmlns="http://www.w3.org/1998/Math/MathML" display="block" aria-label="${label}">${row(content)}</math>`;
const path=text=>`<div class="chain-path">${text}</div>`;

export const lessonFormulas=[
  path('B → 两级齿轮 → 转向架')+path('Y → 同步带 → 直齿轮 → 锥齿轮 → 轮子'),
  path(`B1 · ${teeth.B1} 齿 → B2 · ${teeth.B2} 齿`)+math('B2 角速度等于负的 12 比 36 乘 B 电机角速度',w('B2')+eq+minus+ratio('B1','B2')+times+w('B')),
  path(`B3 · ${teeth.B3} 齿 → B4 · ${teeth.B4} 齿`)+math('转向角速度等于两级齿数比乘 B 电机角速度',w('转向')+eq+ratio('B1','B2')+times+ratio('B3','B4')+times+w('B')+eq+frac(w('B'),n(1/ratios.steer))),
  path(`Y1 · ${teeth.Y1} 齿 → Y2 · ${teeth.Y2} 齿`)+math('Y2 角速度等于 28 比 20 乘 Y 电机角速度，也就是 1.4 倍',w('Y2')+eq+ratio('Y1','Y2')+times+w('Y')+eq+n(ratios.belt)+times+w('Y')),
  path(`Y3 · ${teeth.Y3} 齿 → Y4 · ${teeth.Y4} 齿`)+math('Y4 相对轮架角速度等于负齿数比乘中心齿轮与转向架的速度差',w('Y4, 相对')+eq+minus+ratio('Y3','Y4')+times+difference),
  path(`Y5 · ${teeth.Y5} 齿 → Y6 · ${teeth.Y6} 齿 → 轮子`)+math('轮速等于锥齿轮减速比乘中心齿轮与转向架的速度差',w('轮')+eq+ratio('Y5','Y6')+times+difference),
];
export function couplingFormula(compensate){
  if(compensate)return math('补偿时，Y 电机角速度等于 B 电机角速度除以 16.8',w('Y')+eq+frac(w('B'),n(Number((ratios.belt/ratios.steer).toFixed(8)))));
  return math('轮子角速度等于 1.4 倍 Y 电机角速度减去 B 电机角速度的十二分之一，再除以四',w('轮')+eq+frac(n(ratios.belt)+times+w('Y')+minus+frac(w('B'),n(1/ratios.steer)),n(1/(ratios.spur*ratios.bevel))));
}

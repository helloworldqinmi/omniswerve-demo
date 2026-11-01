import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {transmission,compensatedY,rpmToRadians,ratios} from './transmission.mjs';
import {ease,transitionMs,displayOrigin,clearOrbitInertia} from './presentation.mjs';
import {lessonFormulas,couplingFormula} from './formulas.mjs';

const $=id=>document.getElementById(id);
const lessons=[
  {title:'两路输入，一个轮组',short:'整个传动链',body:'蓝色链决定转向架的朝向；黄色链把动力传到轮子。两条链在随转向架移动的驱动轴处耦合。',insight:'移开顶板观察内部，或选择“只看传动”。右侧选择传动级，点击齿轮也能查看对应说明。',roles:null,camera:'iso'},
  {title:'第一对，反向减速',short:'B1 → B2',body:'12 齿的小齿轮带动 36 齿的大齿轮。外啮合让它们反向旋转，大齿轮只转输入速度的三分之一。',insight:'B2 与下一层的 B3 固连在同一根轴上，二者没有相对转动。',roles:['B1','B23'],camera:'first'},
  {title:'第二对，带动转向架',short:'B3 → B4',body:'同轴的 18 齿小轮，再带动中心的 72 齿大轮。两次外啮合后，转向架与 B 电机同向。',insight:'B 电机输出轴转 12 圈，转向架转 1 圈。轮架及偏心驱动轴一起绕中心转动。',roles:['B23','B4','fork'],camera:'steer'},
  {title:'同步带，同向传动',short:'Y1 → Y2',body:'这份 CAD 中，电机端为 28 齿，中心带轮为 20 齿。开口同步带让两个带轮同向旋转。',insight:'带轮 Y2 与下方直齿轮 Y3 是同一个刚体。亮点表示带的行进方向；带体保留原始形状。',roles:['Y1','Y23','belt'],camera:'belt'},
  {title:'看相对转动',short:'Y3 → Y4',body:'中心 23 齿轮带动偏心轴上的 23 齿轮。两者大小相同，但偏心轴还会跟着转向架公转。啮合关系必须在转向架内计算。',insight:'试试“只转向”：即使 Y 电机停住，Y4 仍会沿着中心齿轮滚动。',roles:['Y23','Y4','B4','fork'],camera:'planet'},
  {title:'转过直角，送到轮轴',short:'Y5 → Y6',body:'Y4 与竖直锥齿轮 Y5 固连。15 / 60 的锥齿轮副把运动传到水平轮轴，再减速到四分之一。',insight:'轮子的转速始终相对转向架定义。转向架的公转，不算作轮子的滚动。',roles:['Y4','Y5','Y6','wheel'],camera:'bevel'},

];
const roleNames={B1:'B1 · 12 齿输入',B23:'B2 / B3 · 36 / 18 齿',B4:'B4 · 72 齿转向',Y1:'Y1 · 28 齿带轮',Y23:'Y2 / Y3 · 20 / 23 齿',Y4:'Y4 · 23 齿行星轴',Y5:'Y5 · 15 齿锥齿轮',Y6:'Y6 · 60 齿锥齿轮',wheel:'轮子 · 相对轮架滚动',fork:'转向架',belt:'同步带 · 同向传动',motor:'电机外壳 · 固定',plate:'底盘板 · 固定',frame:'固定支承',hardware:'装配支承件'};
const roleLesson={B1:1,B23:1,B4:2,Y1:3,Y23:3,Y4:4,Y5:5,Y6:5,wheel:5,fork:0,belt:3};
let chapter=0,view='full',ready=false,playing=false,time=0,angleB=0,angleY=0;
const state={B:24,Y:8,compensate:false};
// Mirrors Common/MotionConfig.hpp's rated output-shaft command ceiling.
const motorLimitRpm=540;
// Pointer interaction tolerance only; not a controller deadband.
const zeroSnapRpm=10;
const viewport=$('viewport');
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(33,1,.001,4);camera.up.set(0,0,1);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0,0);
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
viewport.prepend(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.09;controls.minDistance=.04;controls.maxDistance=.8;controls.target.set(.017,.015,-.014);
const env=new RoomEnvironment();const pmrem=new THREE.PMREMGenerator(renderer);const environment=pmrem.fromScene(env,.04);scene.environment=environment.texture;env.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xffffff,0x778070,1));
const sun=new THREE.DirectionalLight(0xfff8e8,1.8);sun.position.set(.1,-.15,.3);scene.add(sun);
const fill=new THREE.DirectionalLight(0xb8d5ff,.8);fill.position.set(-.2,.1,.12);scene.add(fill);
const grid=new THREE.GridHelper(.34,34,0xcbd6c6,0xe0e7dc);grid.rotation.x=Math.PI/2;grid.position.z=-.077;grid.material.transparent=true;grid.material.opacity=.42;scene.add(grid);
// Floor reference and steering arc lie outside the wheel. No simulated contact force.
const arcPoints=Array.from({length:129},(_,i)=>new THREE.Vector3(.046*Math.cos(i/128*Math.PI*2),.046*Math.sin(i/128*Math.PI*2),-.076));
const ring=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(arcPoints),new THREE.LineBasicMaterial({color:0x8fa38b,transparent:true,opacity:.45}));scene.add(ring);
const heading=new THREE.Group();scene.add(heading);
const direction=new THREE.ArrowHelper(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,-.0755),.055,0x5f8465,.008,.004);heading.add(direction);
const modelRoot=new THREE.Group();scene.add(modelRoot);
const groups={},partObjects=[],labels=[],pickable=[],beltDots=[],tracers=[];
let assembly,axle,beltCurve,origin;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let cameraTransition=null,presentationTransition=null;
controls.addEventListener('start',()=>{cameraTransition=null;});
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const cameras={iso:{target:[.016,.014,-.017],offset:[.18,-.24,.20]},first:{target:[.047,.012,.013],offset:[.025,-.10,.21]},steer:{target:[.013,0,.003],offset:[.18,-.28,.15]},belt:{target:[.016,.024,.014],offset:[.06,-.08,.23]},planet:{target:[.010,0,-.002],offset:[.12,-.13,.18]},bevel:{target:[.012,.002,-.034],offset:[.11,-.19,.055]}};
function moveCamera(target,position,instant=false){
  clearOrbitInertia(camera,controls);
  if(instant||reducedMotion.matches){controls.target.copy(target);camera.position.copy(position);controls.update();cameraTransition=null;return;}
  cameraTransition={start:performance.now(),from:camera.position.clone(),targetFrom:controls.target.clone(),to:position,target};
}
function cameraView(name,instant=false){
  const v=cameras[view==='cut'?name:'iso'];
  const target=new THREE.Vector3(...v.target);
  moveCamera(target,target.clone().add(new THREE.Vector3(...v.offset).multiplyScalar(view==='cut'?1:1.3)),instant);
}
cameraView('iso',true);
new ResizeObserver(()=>{const w=viewport.clientWidth,h=viewport.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);}).observe(viewport);

function setChapter(index,apply=true){
  chapter=Math.max(0,Math.min(index,lessons.length-1));const item=lessons[chapter];
  $('lesson-kicker').textContent=chapter===0?'MECHANISM / 传动总览':'TRANSMISSION / 局部观察';
  $('lesson-title').textContent=item.title;$('details-title').textContent=item.title;
  $('lesson-summary').textContent=['转向与驱动，在这里看清。','12 → 36 齿，反向减速。','两级减速，带动轮架转向。','28 → 20 齿，同向传动。','跟随轮架公转，同时自转。','15 → 60 齿，把动力送到轮轴。'][chapter];$('lesson-body').textContent=item.body;$('lesson-chain').innerHTML=lessonFormulas[chapter];$('lesson-insight').textContent=item.insight;
  $('stage-index').textContent=item.short;
  $('back-overview').hidden=chapter===0;
  document.querySelector('.interaction-hint').textContent=chapter===0?'拖动旋转 · 滚轮缩放 · 右键平移 · 点击零件':'点空白处或按 Esc 返回整体 · 拖动旋转';
  if(chapter===0)$('selected-part').textContent='选择零件，查看它的作用';
  $('focus-select').value=String(chapter);
  $('bevel-check').hidden=chapter!==5;
  if(apply){
    if(chapter>0&&view!=='cut')setView('cut');
    else {refreshVisibility();cameraView(item.camera);}
    if(!reducedMotion.matches)document.querySelector('.lesson-detail').animate([{opacity:.3,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:280});
  }
  syncInputs();
}
lessons.forEach((lesson,i)=>{const option=document.createElement('option');option.value=i;option.textContent=lesson.short;$('focus-select').append(option);});
$('focus-select').onchange=e=>setChapter(Number(e.target.value));
function setPreset(name){
  state.compensate=name==='compensated';state.B=name==='drive'?0:24;state.Y=name==='steer'?0:name==='compensated'?compensatedY(24):8;
  $('compensate').checked=state.compensate;syncInputs();
  document.querySelectorAll('[data-preset]').forEach(b=>{const active=b.dataset.preset===name;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
}
function syncInputs(){
  if(state.compensate)state.Y=compensatedY(state.B);
  $('motor-b').value=state.B;$('motor-y').value=state.Y;$('motor-y').disabled=state.compensate;
  $('zero-y').disabled=state.compensate;
  $('motor-y').setAttribute('aria-valuetext',`${state.Y.toFixed(2)} rpm${state.compensate?'，自动补偿':''}`);
  $('b-value').textContent=state.B.toFixed(1);$('y-value').textContent=state.Y.toFixed(2);
  const velocity=transmission(state.B,state.Y);
  $('steer-output').textContent=velocity.carrier.toFixed(2);$('wheel-output').textContent=(Math.abs(velocity.wheel)<1e-10?0:velocity.wheel).toFixed(2);
  $('motion-note').textContent=state.B===0&&state.Y===0?'静止':state.compensate?'已补偿 · 轮子无相对自转':state.B!==0&&state.Y===0?'仅转向输入 · 轮子仍会自转':state.B===0?'朝向固定 · 轮子独立滚动':'转向 + 滚动';
  const f=value=>(Math.abs(value)<1e-10?0:value).toFixed(2);
  $('stage-reading').textContent=[
    `转向 ${f(velocity.carrier)} / 轮子 ${f(velocity.wheel)} rpm`,
    `B1 ${f(state.B)} → B2 ${f(velocity.B23)} rpm`,
    `B3 ${f(velocity.B23)} → B4 ${f(velocity.carrier)} rpm`,
    `Y1 ${f(state.Y)} → Y2 ${f(velocity.Y23)} rpm`,
    `Y4 相对 ${f(velocity.planet)} / 绝对 ${f(velocity.planetAbsolute)} rpm`,
    `Y5 相对 ${f(velocity.planet)} → 轮 ${f(velocity.wheel)} rpm`,
  ][chapter];
  $('coupling-equation').innerHTML=couplingFormula(state.compensate);
  $('coupling-note').textContent=state.compensate?'中心驱动齿轮与转向架同速，轮子相对轮架不自转。':state.B!==0&&state.Y===0?'Y 停住时，偏心齿轮仍随轮架公转，带动轮子自转。':'ω 表示角速度；B、Y 为两路电机，轮速相对轮架。切换“只转向”和“补偿转向”可对比。';
}
function refreshVisibility(instant=false){
  const focus=view==='cut'?lessons[chapter].roles:null;
  const items=[];
  // Presentation-only offsets in metres; never used by the transmission model.
  const lidPivot=new THREE.Vector3(...(assembly?.parts.find(p=>p.sourceLabel==='upper plate')?.restCenter||[0,0,0]));
  for(const item of partObjects){
    const {object,meta}=item,role=meta.role;
    const mechanical=['plate','motor','hardware','frame'].includes(role);
    const lift=item.lid&&view!=='full',hide=lift||(view==='cut'&&mechanical);
    const rotation=new THREE.Quaternion();
    const position=item.restPosition.clone();
    if(lift){
      rotation.setFromAxisAngle(new THREE.Vector3(1,0,0),-.65);
      position.add(lidPivot).sub(lidPivot.clone().applyQuaternion(rotation)).add(new THREE.Vector3(0,.045,.11));
    }else if(hide)position.z+=role==='motor'?-.025:.025;
    const meshes=[];
    object.traverse(o=>{
      if(!o.isMesh)return;
      const target=view==='cut'?o.userData.teachingMaterial:o.userData.assemblyMaterial;
      const opacity=hide?0:focus&&!focus.includes(role)?.09:role==='fork'&&view==='cut'?.26:1;
      meshes.push({mesh:o,from:o.material.clone(),to:target,opacity});
    });
    object.visible=true;
    items.push({object,from:object.position.clone(),position,rotationFrom:object.quaternion.clone(),rotation,meshes,lift});
  }
  // Re-target from the current displayed state, including interrupted transitions.
  presentationTransition?.items.forEach(item=>item.meshes.forEach(m=>m.from.dispose()));
  presentationTransition={start:performance.now(),items};
  if(instant||reducedMotion.matches)updatePresentation(1);
  beltDots.forEach(o=>o.visible=view==='cut'&&(!focus||focus.includes('belt')));
  tracers.forEach(item=>item.object.visible=view==='cut'&&(!focus||focus.includes(item.role)));
}
function updatePresentation(progress){
  if(!presentationTransition)return;
  const t=ease(progress);
  for(const item of presentationTransition.items){
    item.object.position.lerpVectors(item.from,item.position,t);
    item.object.quaternion.slerpQuaternions(item.rotationFrom,item.rotation,t);
    for(const m of item.meshes){
      const material=m.mesh.material;
      material.color.lerpColors(m.from.color,m.to.color,t);
      material.roughness=THREE.MathUtils.lerp(m.from.roughness,m.to.roughness,t);
      material.metalness=THREE.MathUtils.lerp(m.from.metalness,m.to.metalness,t);
      material.opacity=THREE.MathUtils.lerp(m.from.opacity,m.opacity,item.lift?t*t*t:t);
      const transparent=material.opacity<.999;
      if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}
      material.depthWrite=!transparent;
    }
    item.object.visible=item.meshes.some(m=>m.mesh.material.opacity>.001);
  }
  if(progress===1){presentationTransition.items.forEach(item=>item.meshes.forEach(m=>m.from.dispose()));presentationTransition=null;}
}
function setView(mode){
  view=mode;
  $('show-labels').checked=mode==='cut';
  document.querySelectorAll('[data-view]').forEach(button=>{
    const active=button.dataset.view===mode;
    button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
  });
  if(mode!=='cut'&&chapter!==0)setChapter(0,false);
  $('view-note').textContent=mode==='full'?'完整装配 · 81 个原始零件':mode==='open'?'顶板已移开 · 保留其余装配':'传动透视 · 隐去安装板与外壳';
  refreshVisibility();cameraView(lessons[chapter].camera);
}
function resetMotion(){time=0;angleB=0;angleY=0;$('bevel-result').textContent='点击验证，读取两只齿轮的实际转角。';updatePose();}
function updatePose(){
  if(!ready)return;
  const angles=transmission(angleB+origin.B,angleY+origin.Y);
  for(const name of ['B1','B23','carrier','Y1','Y23','planet'])groups[name].rotation.z=angles[name];
  groups.wheel.quaternion.setFromAxisAngle(axle,angles.wheel);
  heading.rotation.z=angles.carrier;
  if(beltCurve)beltDots.forEach((dot,i)=>dot.position.copy(beltCurve.getPoint(((i/beltDots.length+angleY*.013369/beltCurve.getLength())%1+1)%1)));
  $('elapsed').textContent=time.toFixed(2);
}
function advance(dt){angleB+=rpmToRadians(state.B)*dt;angleY+=rpmToRadians(state.Y)*dt;time+=dt;updatePose();}
function setPlaying(value){playing=value;$('play').textContent=playing?'Ⅱ 暂停':'▶ 播放';$('play').setAttribute('aria-pressed',String(playing));}
function editMotor(key,value){
  state[key]=value;
  document.querySelectorAll('[data-preset]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});
  syncInputs();
}
for(const [id,key] of [['motor-b','B'],['motor-y','Y']]){
  const input=$(id);
  input.min=-motorLimitRpm;input.max=motorLimitRpm;
  let pointerEditing=false;
  input.addEventListener('pointerdown',()=>{pointerEditing=true;});
  window.addEventListener('pointerup',()=>{pointerEditing=false;});
  window.addEventListener('pointercancel',()=>{pointerEditing=false;});
  input.addEventListener('keydown',()=>{pointerEditing=false;});
  input.addEventListener('input',()=>{
    const value=Number(input.value);
    editMotor(key,pointerEditing&&Math.abs(value)<=zeroSnapRpm?0:value);
  });
  $(`zero-${key.toLowerCase()}`).onclick=()=>editMotor(key,0);
}
$('compensate').onchange=e=>{state.compensate=e.target.checked;syncInputs();document.querySelectorAll('[data-preset]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});};
document.querySelectorAll('[data-preset]').forEach(button=>button.onclick=()=>{setPreset(button.dataset.preset);});
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>setView(button.dataset.view));
$('play').onclick=()=>setPlaying(!playing);$('step').onclick=()=>{setPlaying(false);advance(1/30);};$('reset-motion').onclick=()=>{setPlaying(false);resetMotion();};
$('bevel-turn').onclick=()=>{
  setPlaying(false);setPreset('drive');
  // Measure the actual scene transforms, not just the calculated speed readout.
  const beforeY5=groups.planet.rotation.z;
  const beforeY6=groups.wheel.quaternion.clone();
  advance(2*Math.PI/(rpmToRadians(state.Y)*ratios.belt*ratios.spur));
  const turnedY5=Math.abs(groups.planet.rotation.z-beforeY5)*180/Math.PI;
  const turnedY6=beforeY6.angleTo(groups.wheel.quaternion)*180/Math.PI;
  $('bevel-result').textContent=`本次实际自转：Y5 ${turnedY5.toFixed(0)}° · Y6 ${turnedY6.toFixed(0)}°。再点一次继续验证。`;
};
$('reset-camera').onclick=()=>cameraView('iso');
$('top-camera').onclick=()=>{const target=new THREE.Vector3(.015,.018,-.01);moveCamera(target,target.clone().add(new THREE.Vector3(0,-.0001,.24/Math.min(camera.aspect,1))));};
$('side-camera').onclick=()=>{const target=new THREE.Vector3(.015,.01,-.025);moveCamera(target,target.clone().add(new THREE.Vector3(.06,-.27,.015)));};
$('open-details').onclick=()=>$('details-dialog').showModal();
$('close-details').onclick=()=>$('details-dialog').close();
function exitFocus(){if(chapter!==0)setChapter(0);}
$('back-overview').onclick=exitFocus;
document.addEventListener('keydown',e=>{
  if($('details-dialog').open)return;
  if(e.code==='Space'&&e.target===document.body&&ready){e.preventDefault();setPlaying(!playing);}
  // Let editable fields and native dropdowns handle their own Escape first.
  if(e.key==='Escape'&&!e.defaultPrevented&&!e.target.closest('input,select,textarea,[contenteditable="true"]'))exitFocus();
});
let pointerDown;
renderer.domElement.addEventListener('pointerdown',e=>{
  pointerDown=e.button===0&&e.isPrimary?{id:e.pointerId,x:e.clientX,y:e.clientY,dragged:false}:null;
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(pointerDown&&Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y)>5)pointerDown.dragged=true;
});
renderer.domElement.addEventListener('pointercancel',()=>{pointerDown=null;});
renderer.domElement.addEventListener('pointerup',e=>{
  const press=pointerDown;pointerDown=null;
  if(!ready||!press||press.id!==e.pointerId||press.dragged||e.button!==0||Math.hypot(e.clientX-press.x,e.clientY-press.y)>5)return;
  const bounds=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-bounds.left)/bounds.width*2-1,-(e.clientY-bounds.top)/bounds.height*2+1);raycaster.setFromCamera(pointer,camera);
  const hit=raycaster.intersectObjects(pickable,false).find(h=>{let o=h.object;while(o){if(!o.visible)return false;o=o.parent;}return h.object.material.opacity>.2;});
  if(hit){const role=hit.object.userData.partRole;$('selected-part').textContent=roleNames[role]||hit.object.userData.sourceLabel;const lesson=roleLesson[role];if(lesson!==undefined)setChapter(lesson);}
  else exitFocus();
});

function makeBeltFlow(){
  const c1=new THREE.Vector3(...assembly.pivots.Y1),c2=new THREE.Vector3(0,0,0);c1.z=c2.z=.0189;
  const r1=28*.003/(2*Math.PI),r2=20*.003/(2*Math.PI),distance=c1.distanceTo(c2);
  const alpha=Math.atan2(c2.y-c1.y,c2.x-c1.x),beta=Math.acos((r1-r2)/distance);
  const circle=(c,r,a)=>new THREE.Vector3(c.x+r*Math.cos(a),c.y+r*Math.sin(a),c.z);
  const path=new THREE.CurvePath();
  // CCW around each pulley, hence the same positive angular sense as Y1/Y2.
  const a=alpha-beta,b=alpha+beta;
  const p1=circle(c1,r1,a),p2=circle(c2,r2,a),p3=circle(c2,r2,b),p4=circle(c1,r1,b);
  path.add(new THREE.LineCurve3(p1,p2));
  const arc=(c,r,start,end)=>{const pts=Array.from({length:41},(_,i)=>circle(c,r,start+(end-start)*i/40));for(let i=1;i<pts.length;i++)path.add(new THREE.LineCurve3(pts[i-1],pts[i]));};
  arc(c2,r2,a,b);path.add(new THREE.LineCurve3(p3,p4));arc(c1,r1,b,a+2*Math.PI);
  beltCurve=path;
  for(let i=0;i<10;i++){const dot=new THREE.Mesh(new THREE.SphereGeometry(.00065,8,6),new THREE.MeshBasicMaterial({color:0xffe3a3}));scene.add(dot);beltDots.push(dot);}
}
function makeTracers(){
  // Visual witnesses on the faces, independent of tessellation and gear symmetry.
  const markers=[['B1','B1',.0045,.0237],['B23','B23',.014,.0271],['B4','carrier',.030,.0068],['Y1','Y1',.010,.0238],['Y23','Y23',.006,.0231],['Y4','planet',.009,.0133]];
  for(const [role,group,r,z] of markers){
    const dot=new THREE.Mesh(new THREE.SphereGeometry(.00115,12,8),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.65}));dot.position.set(r,0,z);groups[group].add(dot);tracers.push({object:dot,role});
  }
}
async function loadModel(){
  const response=await fetch('./assets/assembly.json');if(!response.ok)throw Error('无法读取装配清单');assembly=await response.json();
  const gltf=await new GLTFLoader().loadAsync('./assets/swerve.glb',event=>{$('load-detail').textContent=`读取几何 · ${(event.loaded/1e6).toFixed(1)} MB${event.total?' / '+(event.total/1e6).toFixed(1)+' MB':''}`;});
  for(const name of ['fixed',...Object.keys(assembly.pivots)]){groups[name]=new THREE.Group();groups[name].name=name;groups[name].position.fromArray(assembly.pivots[name]||[0,0,0]);modelRoot.add(groups[name]);}
  groups.carrier.add(groups.planet,groups.wheel);
  axle=new THREE.Vector3(...assembly.axleDirection).negate().normalize();
  origin=displayOrigin(assembly.axleDirection);
  direction.setDirection(new THREE.Vector3(-assembly.axleDirection[1],assembly.axleDirection[0],0).normalize());
  const imported=new Map();gltf.scene.traverse(o=>{if(o.userData.sourceLabel)imported.set(o.name,o);});
  for(const meta of assembly.parts){
    const object=imported.get(meta.name);if(!object)throw Error(`缺少零件 ${meta.name}`);
    const parent=groups[meta.motionGroup];parent.add(object);object.position.copy(parent.position).negate();object.quaternion.identity();object.scale.setScalar(1);
    object.traverse(o=>{if(!o.isMesh)return;
      // CAD export colors are flat display swatches, not calibrated PBR materials.
      // Use explicit material colors so the complete model retains contrast under
      // the same lighting as the teaching view (especially black rubber and caps).
      const assemblyColor=meta.role.startsWith('B')?0x5696c5:meta.role.startsWith('Y')?0xd4a216:
        meta.role==='wheel'?0x242724:meta.role==='belt'?0x303632:
        meta.sourceLabel==='编码器保护盖'||meta.sourceLabel.includes('M4*25')?0x343b3e:
        meta.role==='plate'||meta.role==='motor'?0x939a9c:0x747d80;
      const rubber=meta.role==='wheel'||meta.role==='belt';
      o.userData.assemblyMaterial=new THREE.MeshStandardMaterial({color:assemblyColor,
        metalness:rubber?.02:.5,roughness:rubber?.85:.38});
      const color=meta.role.startsWith('B')?0x5289e8:meta.role.startsWith('Y')?0xf0be3e:meta.role==='wheel'?0x29332c:meta.role==='belt'?0x3b4540:meta.role==='fork'?0x8aab95:0x9ca6a0;
      o.material=new THREE.MeshStandardMaterial({color,metalness:meta.role==='wheel'||meta.role==='belt'?.02:.32,roughness:meta.role==='wheel'?.76:.32});
      o.userData.teachingMaterial=o.material;
      o.material=o.material.clone();
      o.userData.partRole=meta.role;o.userData.sourceLabel=meta.sourceLabel;pickable.push(o);
    });
    const lid=meta.sourceLabel==='upper plate'||(meta.motionGroup==='fixed'&&meta.sourceLabel.startsWith('Socket button head screw M4')&&meta.restCenter[2]>.02);
    partObjects.push({object,meta,lid,restPosition:object.position.clone()});
    if(roleNames[meta.role]&&['B1','B23','B4','Y1','Y23','Y4','Y5','Y6'].includes(meta.role)){
      const anchor=new THREE.Object3D();const center=new THREE.Vector3(...meta.restCenter);center.z+=meta.role==='Y6'?.008:.007;const anchorParent=['Y4','Y5','Y6'].includes(meta.role)?groups.carrier:groups.fixed;anchor.position.copy(center).sub(anchorParent.position);anchorParent.add(anchor);
      const label=document.createElement('span');label.className='part-label '+(meta.role.startsWith('B')?'blue':'yellow');label.textContent=meta.role==='B23'?'B2 · B3':meta.role==='Y23'?'Y2 · Y3':meta.role;label.setAttribute('aria-hidden','true');$('labels').append(label);const line=document.createElementNS('http://www.w3.org/2000/svg','line');$('label-lines').append(line);labels.push({anchor,label,line,role:meta.role});
    }
  }
  makeBeltFlow();makeTracers();ready=true;refreshVisibility(true);updatePose();$('loading').hidden=true;
  $('asset-status').textContent=`${partObjects.length} 个 CAD 零件`;
  for(const id of ['play','step','reset-motion','bevel-turn'])$(id).disabled=false;
}
setChapter(0,false);syncInputs();
loadModel().catch(error=>{$('loading').innerHTML='<strong>模型没有成功载入</strong><span></span>';$('loading').querySelector('span').textContent=error.message+'。请使用启动脚本打开，不要直接双击 HTML。';$('asset-status').textContent='加载失败';console.error(error);});
// Fixed local offsets keep concentric / coaxial labels apart without reflowing
// rows every frame. Only the projected anchor moves; gear spin is excluded.
const labelOffsets={B1:[30,-24],B23:[0,-42],B4:[-40,22],Y1:[0,-32],Y23:[-26,-34],Y4:[-30,-28],Y5:[30,20],Y6:[24,-24]};
const projected=new THREE.Vector3();let last=performance.now();
renderer.setAnimationLoop(now=>{
  const dt=Math.min((now-last)/1000,.1);last=now;
  if(ready&&playing&&!document.hidden)advance(dt*Number($('speed').value));
  if(cameraTransition){
    const c=cameraTransition,t=ease((now-c.start)/transitionMs);
    camera.position.lerpVectors(c.from,c.to,t);controls.target.lerpVectors(c.targetFrom,c.target,t);
    camera.lookAt(controls.target);
    if(t===1)cameraTransition=null;
  }
  if(presentationTransition)updatePresentation(reducedMotion.matches?1:Math.max(0,Math.min((now-presentationTransition.start)/transitionMs,1)));
  if(!cameraTransition)controls.update();
  scene.updateMatrixWorld();
  // Camera is not a scene child. Project labels with this frame's camera pose,
  // rather than the matrix from the preceding render (especially at handoff).
  camera.updateMatrixWorld();
  for(const entry of labels){
    entry.anchor.getWorldPosition(projected).project(camera);const x=(projected.x*.5+.5)*viewport.clientWidth,y=(-projected.y*.5+.5)*viewport.clientHeight-20;
    const focus=view==='cut'?lessons[chapter].roles:null;
    const visible=$('show-labels').checked&&(!focus||focus.includes(entry.role))&&projected.z<1&&projected.z>-1&&x>0&&x<viewport.clientWidth&&y>0&&y<viewport.clientHeight;
    const [dx,dy]=labelOffsets[entry.role];
    const targetX=THREE.MathUtils.clamp(x+dx,40,viewport.clientWidth-40);
    const targetY=THREE.MathUtils.clamp(y+20+dy,85,viewport.clientHeight-115);
    const blend=reducedMotion.matches?1:1-Math.exp(-dt/.075);
    if(!entry.screen||entry.label.hidden)entry.screen={x:targetX,y:targetY};
    else {entry.screen.x+=(targetX-entry.screen.x)*blend;entry.screen.y+=(targetY-entry.screen.y)*blend;}
    const {x:lx,y:ly}=entry.screen;
    entry.label.hidden=!visible;entry.line.style.display=visible?'':'none';
    if(visible){
      entry.label.style.left=`${lx}px`;entry.label.style.top=`${ly}px`;
      // End at the label border rather than drawing through the text box.
      const vx=x-lx,vy=y+20-ly;
      const edge=Math.min(1,1/Math.max(Math.abs(vx)/(entry.label.offsetWidth/2),Math.abs(vy)/(entry.label.offsetHeight/2)));
      entry.line.setAttribute('x1',lx+vx*edge);entry.line.setAttribute('y1',ly+vy*edge);
      entry.line.setAttribute('x2',x);entry.line.setAttribute('y2',y+20);
    }
  }
  renderer.render(scene,camera);
});

import {Vector3} from 'three';

// The welded CAD export shares normals between the flat wheel-gear disc and
// its teeth. Split those shading seams without changing vertices or triangles.
export function restoreAxialFaceNormals(source,axis){
  const geometry=source.index?source.toNonIndexed():source.clone();
  const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal');
  const a=new Vector3(),b=new Vector3(),c=new Vector3(),normal=new Vector3();
  for(let i=0;i<positions.count;i+=3){
    a.fromBufferAttribute(positions,i);b.fromBufferAttribute(positions,i+1);c.fromBufferAttribute(positions,i+2);
    normal.crossVectors(b.sub(a),c.sub(a)).normalize();
    // Only planar end faces perpendicular to the axle; preserve curved tooth normals.
    if(Math.abs(normal.dot(axis))>0.9999){
      for(let j=0;j<3;j++)normals.setXYZ(i+j,normal.x,normal.y,normal.z);
    }
  }
  normals.needsUpdate=true;
  return geometry;
}

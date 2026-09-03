import * as THREE from 'three';
import fs from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const buf = fs.readFileSync(new URL('../public/engine.glb', import.meta.url));
const gltf = await new Promise((resolve, reject) =>
  loader.parse(buf.buffer, '', resolve, reject)
);
const root = gltf.scene;
root.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(root);
const size = new THREE.Vector3(); box.getSize(size);
const center = new THREE.Vector3(); box.getCenter(center);
console.log('size', size.toArray().map(v=>v.toFixed(3)).join(', '), 'center', center.toArray().map(v=>v.toFixed(3)).join(', '));

let total = 0;
const half = { xPos:0, xNeg:0, yPos:0, yNeg:0, zPos:0, zNeg:0 };
const ext = { xMin:1e9, xMax:-1e9, yMin:1e9, yMax:-1e9, zMin:1e9, zMax:-1e9 };
root.traverse(o => {
  const mesh = o;
  if (mesh.isMesh && mesh.geometry) {
    const pos = mesh.geometry.attributes.position;
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      if (p.x > 0) half.xPos++; else half.xNeg++;
      if (p.y > 0) half.yPos++; else half.yNeg++;
      if (p.z > 0) half.zPos++; else half.zNeg++;
      ext.xMin = Math.min(ext.xMin, p.x); ext.xMax = Math.max(ext.xMax, p.x);
      ext.yMin = Math.min(ext.yMin, p.y); ext.yMax = Math.max(ext.yMax, p.y);
      ext.zMin = Math.min(ext.zMin, p.z); ext.zMax = Math.max(ext.zMax, p.z);
      total++;
    }
  }
});
console.log('verts', total);
console.log('half', JSON.stringify(half));
console.log('extents', ext);

/* Headless landmark renderer. Builds real three.js geometry, projects it, rasterises to PNG
   with flat shading and a painter's sort. No WebGL, no browser — just enough to SEE the shape. */
import * as THREE from 'three';
import zlib from 'node:zlib';
import fs from 'node:fs';

export function render(group, {W=900,H=600,az=42,el=26,dist=null,label='',grid=true}={}){
  group.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(group), c=box.getCenter(new THREE.Vector3());
  const size=box.getSize(new THREE.Vector3()), span=Math.max(size.x,size.z,size.y);
  const D=dist||span*2.4;
  const a=az*Math.PI/180, e=el*Math.PI/180;
  const cam=new THREE.Vector3(c.x+D*Math.cos(e)*Math.cos(a), c.y+D*Math.sin(e)+size.y*0.15, c.z+D*Math.cos(e)*Math.sin(a));
  const M=new THREE.Matrix4().lookAt(cam,c,new THREE.Vector3(0,1,0));
  const V=new THREE.Matrix4().makeBasis(
    new THREE.Vector3().setFromMatrixColumn(M,0),
    new THREE.Vector3().setFromMatrixColumn(M,1),
    new THREE.Vector3().setFromMatrixColumn(M,2)).setPosition(cam).invert();
  const P=new THREE.Matrix4().makePerspective(-1,1,H/W,-H/W,2.6,D*4);
  const MVP=new THREE.Matrix4().multiplyMatrices(P,V);
  const SUN=new THREE.Vector3(-0.6,0.72,0.34).normalize();

  const tris=[];
  group.traverse(o=>{
    if(!o.isMesh||!o.geometry) return;
    const g=o.geometry, pos=g.attributes.position; if(!pos) return;
    const idx=g.index?g.index.array:null;
    const n=idx?idx.length:pos.count;
    const mats=Array.isArray(o.material)?o.material:[o.material];
    const grp=g.groups&&g.groups.length?g.groups:[{start:0,count:n,materialIndex:0}];
    for(const gr of grp){
      const m=mats[gr.materialIndex||0]||mats[0];
      let col=m&&m.userData&&m.userData.dayMats?m.userData.dayMats.color:(m?m.color:null);
      if(m&&m.userData&&m.userData.duskColor!==undefined) col=new THREE.Color(m.userData.duskColor);
      const base=col?[col.r,col.g,col.b]:[0.7,0.7,0.7];
      /* ONE WORLD MATRIX PER DRAWN COPY. A plain Mesh has exactly one; an InstancedMesh has one
         per instance and its own matrixWorld is only the parent transform. Reading matrixWorld
         alone — which this did until an instancing pass on yasBayJetty exposed it — collapses
         every instance onto the same spot, so an instanced structure rendered as a single copy
         and the bench silently disagreed with the scene. */
      const MWs=[];
      if(o.isInstancedMesh){
        const im=new THREE.Matrix4();
        for(let k=0;k<o.count;k++){ o.getMatrixAt(k,im); MWs.push(new THREE.Matrix4().multiplyMatrices(o.matrixWorld,im)); }
      } else MWs.push(o.matrixWorld);
      for(const MW of MWs)
      for(let i=gr.start;i<gr.start+gr.count;i+=3){
        const A=idx?idx[i]:i, B=idx?idx[i+1]:i+1, Cc=idx?idx[i+2]:i+2;
        const v=[A,B,Cc].map(k=>new THREE.Vector3().fromBufferAttribute(pos,k).applyMatrix4(MW));
        const nrm=new THREE.Vector3().subVectors(v[1],v[0]).cross(new THREE.Vector3().subVectors(v[2],v[0])).normalize();
        const lam=Math.max(0,nrm.dot(SUN))*0.78+0.30;
        const p=v.map(q=>{const s=q.clone().applyMatrix4(MVP);return {x:(s.x*0.5+0.5)*W,y:(1-(s.y*0.5+0.5))*H,z:q.distanceTo(cam)};});
        if(p.some(q=>!isFinite(q.x)||!isFinite(q.y))) continue;
        tris.push({p,c:base.map(x=>Math.min(1,x*lam)),z:(p[0].z+p[1].z+p[2].z)/3});
      }
    }
  });
  tris.sort((a,b)=>b.z-a.z);

  const buf=new Uint8Array(W*H*3);
  for(let i=0;i<W*H;i++){const y=Math.floor(i/W)/H;const g=Math.round(238-y*26);buf[i*3]=g;buf[i*3+1]=g;buf[i*3+2]=g+4;}
  if(grid){
    const step=Math.max(1,Math.round(span/10));
    for(let gx=-30;gx<=30;gx+=step)for(let t=-30;t<=30;t+=0.35){
      for(const q of [[gx,t],[t,gx]]){
        const s=new THREE.Vector3(c.x+q[0],0,c.z+q[1]).applyMatrix4(MVP);
        const X=Math.round((s.x*0.5+0.5)*W), Y=Math.round((1-(s.y*0.5+0.5))*H);
        if(X>=0&&X<W&&Y>=0&&Y<H){const k=(Y*W+X)*3;buf[k]=210;buf[k+1]=212;buf[k+2]=214;}
      }
    }
  }
  for(const t of tris){
    const [a,b,cc]=t.p;
    const minx=Math.max(0,Math.floor(Math.min(a.x,b.x,cc.x))), maxx=Math.min(W-1,Math.ceil(Math.max(a.x,b.x,cc.x)));
    const miny=Math.max(0,Math.floor(Math.min(a.y,b.y,cc.y))), maxy=Math.min(H-1,Math.ceil(Math.max(a.y,b.y,cc.y)));
    const d=(b.y-cc.y)*(a.x-cc.x)+(cc.x-b.x)*(a.y-cc.y); if(Math.abs(d)<1e-9) continue;
    const R=Math.round(t.c[0]*255),G=Math.round(t.c[1]*255),B=Math.round(t.c[2]*255);
    for(let y=miny;y<=maxy;y++)for(let x=minx;x<=maxx;x++){
      const w1=((b.y-cc.y)*(x+0.5-cc.x)+(cc.x-b.x)*(y+0.5-cc.y))/d;
      const w2=((cc.y-a.y)*(x+0.5-cc.x)+(a.x-cc.x)*(y+0.5-cc.y))/d;
      if(w1<0||w2<0||w1+w2>1) continue;
      const k=(y*W+x)*3; buf[k]=R;buf[k+1]=G;buf[k+2]=B;
    }
  }
  const raw=Buffer.alloc(H*(W*3+1));
  for(let y=0;y<H;y++){raw[y*(W*3+1)]=0;Buffer.from(buf.buffer,y*W*3,W*3).copy(raw,y*(W*3+1)+1);}
  const crcT=[...Array(256)].map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;return c>>>0;});
  const crc=b=>{let c=0xFFFFFFFF;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;};
  const chunk=(ty,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const body=Buffer.concat([Buffer.from(ty),data]);
    const cr=Buffer.alloc(4);cr.writeUInt32BE(crc(body));return Buffer.concat([len,body,cr]);};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),
    chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}

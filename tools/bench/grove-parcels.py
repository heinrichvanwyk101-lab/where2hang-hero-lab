import json, math, numpy as np
from collections import deque
R='/home/user/where2hang-hero-lab/'
e=json.load(open(R+'data/isle-saadiyat.json')); ex=e['extent']
roads=json.load(open(R+'data/roads-saadiyat.json'))
def iu(m): return ((m[0]-ex['cx'])/7.8, -(m[1]-ex['cy'])/7.8)
X0,X1,Z0,Z1=-470,-258,96,236          # grove zone plus a margin so edge roads count
RES=0.5
W=int((X1-X0)/RES); H=int((Z1-Z0)/RES)
free=np.ones((H,W),bool)
def gx(x): return (x-X0)/RES
def gz(z): return (z-Z0)/RES
CLR={'major':5.0,'minor':3.4,'local':2.4}
def stamp_seg(a,b,r):
    ax,az=gx(a[0]),gz(a[1]); bx,bz=gx(b[0]),gz(b[1]); rr=r/RES
    x0=int(max(0,min(ax,bx)-rr-1)); x1=int(min(W-1,max(ax,bx)+rr+1))
    z0=int(max(0,min(az,bz)-rr-1)); z1=int(min(H-1,max(az,bz)+rr+1))
    if x1<x0 or z1<z0: return
    xs=np.arange(x0,x1+1)[None,:]+0.5; zs=np.arange(z0,z1+1)[:,None]+0.5
    dx,dz=bx-ax,bz-az; L2=dx*dx+dz*dz
    t=((xs-ax)*dx+(zs-az)*dz)/L2 if L2>0 else 0
    t=np.clip(t,0,1)
    px=ax+t*dx; pz=az+t*dz
    d2=(xs-px)**2+(zs-pz)**2
    free[z0:z1+1,x0:x1+1] &= ~(d2<=rr*rr)
for rd in roads['roads']:
    pts=[iu(p) for p in rd['pts']]
    for a,b in zip(pts,pts[1:]): stamp_seg(a,b,CLR[rd['cls']])
# kit zones (non grove) + margin 3, mamsha seats, lake+crescent ellipse
zones=[(-497,-460,158,187),(-388,-355,160,189),(-495,-466,63,87),(-232,-197,156,171),(-227,-213,175,188)]
SB=[[-420,99],[-400,95],[-380,89],[-360,87],[-340,84],[-320,82],[-300,76],[-280,68],[-260,64],[-240,70]]
def shoreZ(x):
    for (a,za),(b,zb) in zip(SB,SB[1:]):
        if a<=x<=b: return za+(zb-za)*(x-a)/(b-a)
    return SB[0][1] if x<-420 else SB[-1][1]
for i in range(8):
    x=-412+i*21; zones.append((x-10,x+10,shoreZ(x)+5,shoreZ(x)+19))
# beach: everything north of shore line + 4 is beach/promenade → occupied
for zn in zones:
    a,b,c,d=zn; free[int(gz(c-3)):int(gz(d+3))+1, int(gx(a-3)):int(gx(b+3))+1]=False
xs=np.arange(W)*RES+X0+RES/2; zs=np.arange(H)*RES+Z0+RES/2
XX,ZZ=np.meshgrid(xs,zs)
shore=np.array([shoreZ(x) for x in xs])[None,:]
free &= ZZ>shore+3
ZX,ZZn=-372,178
roadfree=free.copy()
free &= np.hypot(XX-ZX,(ZZ-ZZn)/1.15)>32.5
free &= (XX>-462)&(XX<-262)&(ZZ>100)&(ZZ<232)
import os; S=os.path.join(os.path.dirname(os.path.abspath(__file__)),'out')+'/'; os.makedirs(S,exist_ok=True)

GR=-0.19
def rect_ok(mask,cx,cz,rot,w,d,frac=0.97):
    c,s=math.cos(rot),math.sin(rot); n=0; ok=0
    for ax in np.arange(-w/2,w/2+1e-6,0.5):
        for az in np.arange(-d/2,d/2+1e-6,0.5):
            x=cx+ax*c+az*s; z=cz-ax*s+az*c
            gi,gj=int(gz(z)),int(gx(x)); n+=1
            if 0<=gi<H and 0<=gj<W and mask[gi,gj]: ok+=1
    return ok/n>=frac
def stamp_rect(mask,cx,cz,rot,w,d,val=False):
    c,s=math.cos(rot),math.sin(rot)
    for ax in np.arange(-w/2,w/2+1e-6,0.25):
        for az in np.arange(-d/2,d/2+1e-6,0.25):
            x=cx+ax*c+az*s; z=cz-ax*s+az*c
            gi,gj=int(gz(z)),int(gx(x))
            if 0<=gi<H and 0<=gj<W: mask[gi,gj]=val
def hashf(x,z): return abs(math.sin(x*12.9898+z*78.233)*43758.5453)%1
occ=free.copy()
out=[]
# 1. galleria: 190 x 80 m (24.4 x 10.3 u) plus the red bar 90 x 26 m at az=+72 m; margin 1.5 u
GW,GD,RB=190/7.8+3,80/7.8+3,26/7.8+3
def gal_ok(x,z):
    c,s=math.cos(GR),math.sin(GR); rx=x+ (72/7.8)*s; rz=z+(72/7.8)*c
    return rect_ok(occ,x,z,GR,GW,GD) and rect_ok(occ,rx,rz,GR,90/7.8+3,RB)
gal=None; best=1e9
for dx in range(-16,17,2):
    for dz in range(-16,17,2):
        x,z=-428+dx,150+dz
        if gal_ok(x,z) and dx*dx+dz*dz<best: best=dx*dx+dz*dz; gal=(x,z)
print('galleria seat',gal)
if gal:
    x,z=gal; c,s=math.cos(GR),math.sin(GR)
    stamp_rect(occ,x,z,GR,GW+1,GD+1); stamp_rect(occ,x+(72/7.8)*s,z+(72/7.8)*c,GR,90/7.8+4,RB+1)
# 2. crescent seats against roads only
cres=[]
for i in range(4):
    a=math.pi*(0.62+i*0.19)+GR; r=28
    x=ZX+math.cos(a)*r; z=ZZn-math.sin(a)*r*1.15
    if rect_ok(roadfree,x,z,a+math.pi/2,70/7.8+1.5,24/7.8+1.5,0.95): cres.append(i); stamp_rect(occ,x,z,a+math.pi/2,70/7.8+3,24/7.8+3)
print('crescent ok',cres)
# 3. primary grid: 11 x 11 u blocks, 2.6 u lanes, GR frame, best of 9 offsets
B,LN=11.0,2.6
c,s=math.cos(GR),math.sin(GR)
def grid_seats(ox,oz,B):
    seats=[]
    for u in np.arange(-130,130,B+LN):
        for v in np.arange(-90,90,B+LN):
            x=-362+ox+u*c+v*s; z=166+oz-u*s+v*c
            if X0<x<X1 and Z0<z<Z1: seats.append((x,z))
    return seats
def kind_of(x,z):
    if z>197 and -392<x<-306: return 'park'
    return 'stone' if x<-447 else 'block'
bestfill=None
for ox in (0,4.5,9):
    for oz in (0,4.5,9):
        placed=[]
        for x,z in grid_seats(ox,oz,B):
            if rect_ok(free,x,z,GR,B,B): placed.append((x,z))
        if bestfill is None or len(placed)>len(bestfill[1]): bestfill=((ox,oz),placed)
print('grid offset',bestfill[0],'primary',len(bestfill[1]))
for x,z in bestfill[1]:
    if not rect_ok(occ,x,z,GR,B,B): continue
    k=kind_of(x,z); h=hashf(x,z)
    st=0 if k=='park' else (2+int(h*2) if k=='stone' else 5+int(h*4))
    out.append([round(x,1),round(z,1),GR,round(B*7.8),round(B*7.8),k,st]); stamp_rect(occ,x,z,GR,B+LN,B+LN)
# 4. infill: smaller blocks in the leftovers, scanning the GR frame at 1 u steps, sizes 8, 6.5, 5
for Bs in (8.0,6.5,5.0):
    for u in np.arange(-130,130,1.0):
        for v in np.arange(-90,90,1.0):
            x=-362+u*c+v*s; z=166-u*s+v*c
            if not (X0<x<X1 and Z0<z<Z1): continue
            if rect_ok(occ,x,z,GR,Bs,Bs,0.99):
                k=kind_of(x,z); h=hashf(x,z)
                st=0 if k=='park' else (2+int(h*2) if k=='stone' else 4+int(h*4))
                out.append([round(x,1),round(z,1),GR,round(Bs*7.8),round(Bs*7.8),k,st]); stamp_rect(occ,x,z,GR,Bs+LN,Bs+LN)
print('cells',len(out),{k:sum(1 for o in out if o[5]==k) for k in ('block','stone','park')})
json.dump({'gal':gal,'cres':cres,'cells':out},open(S+'grove_cells.json','w'))
img=np.zeros((H,W,3),np.uint8); img[roadfree]=(200,190,160); img[~roadfree]=(60,60,60); img[roadfree&~free]=(120,170,190)
def paint(cx,cz,a,w,d,col):
    c,s=math.cos(a),math.sin(a)
    for ax in np.arange(-w/2,w/2,0.5):
        for az in np.arange(-d/2,d/2,0.5):
            x=cx+ax*c+az*s; z=cz-ax*s+az*c; gi,gj=int(gz(z)),int(gx(x))
            if 0<=gi<H and 0<=gj<W: img[gi,gj]=col
for o in out: paint(o[0],o[1],o[2],o[3]/7.8,o[4]/7.8,{'block':(240,240,240),'stone':(200,160,100),'park':(80,160,60)}[o[5]])
if gal: paint(gal[0],gal[1],GR,190/7.8,80/7.8,(120,200,230)); paint(gal[0]+(72/7.8)*s,gal[1]+(72/7.8)*c,GR,90/7.8,26/7.8,(200,60,50))
for i in cres:
    a=math.pi*(0.62+i*0.19)+GR; paint(ZX+math.cos(a)*28,ZZn-math.sin(a)*28*1.15,a+math.pi/2,70/7.8,24/7.8,(255,255,200))
img=img[::-1]
with open(S+'grove_debug.ppm','wb') as f: f.write(b'P6\n%d %d\n255\n'%(W,H)); f.write(img.tobytes())

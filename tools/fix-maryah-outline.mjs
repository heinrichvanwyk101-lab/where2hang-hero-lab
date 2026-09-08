/* AL MARYAH'S OUTLINE, DRAWN RATHER THAN BAKED.

   The baked ring was wrong in both directions and not by a little. tools/bake-city.mjs:107 gives
   the island a generous frame, and pickIsland followed the coastline south across the neck onto
   the bridge-approach reclamation: one ring 2,435 m long for an island that is 1,220, its southern
   half lying over Qasr Al Bahr and reading as if Al Maryah sided Al Nahyan. Its west shore was the
   opposite error — cut 150 m too far east, so Cleveland Clinic and the ADGM/Rosewood end sat in
   open water, and every landmark on the island bunched against one edge.

   Trimming could fix the length and not the width; the ring simply was not the island. So this is
   a hand-drawn shape, checked against the satellite and against the four things everyone knows are
   on it — the Galleria, Cleveland Clinic, Four Seasons, ADGM. That is the right kind of answer
   here: this is a model, and it has to look like Al Maryah, not survey it. Catmull-Rom through the
   control points so the coast reads as a coast rather than a polygon.

   Run:  node tools/fix-maryah-outline.mjs         (report only)
         APPLY=1 node tools/fix-maryah-outline.mjs (writes data/index.json + data/isle-maryah.json)

   A re-bake of this island will overwrite it. Tighten the bbox at bake-city.mjs:107 first, or run
   this again afterwards. */
import fs from 'node:fs';
const R = 6378137, OLAT = 24.49, OLON = 54.42, C = Math.cos(OLAT * Math.PI / 180);
const toM = (lat, lon) => [(lon - OLON) * (Math.PI/180) * R * C, (lat - OLAT) * (Math.PI/180) * R];
const toLat = y => y / ((Math.PI/180) * R) + OLAT, toLon = x => x / ((Math.PI/180) * R * C) + OLON;

/* Clockwise from the north tip. Reading the shore off the satellite: the island is a tapered oval,
   widest across the middle, blunt at the north where the marina and Four Seasons are, and drawn to
   a point at the south past ADGM. */
const CTRL = [
  [24.5071, 54.3890], [24.5065, 54.3905], [24.5050, 54.3917], [24.5030, 54.3925],
  [24.5008, 54.3926], [24.4988, 54.3918], [24.4972, 54.3902], [24.4963, 54.3886],
  [24.4962, 54.3872], [24.4970, 54.3861], [24.4983, 54.3853], [24.4999, 54.3849],
  [24.5018, 54.3851], [24.5038, 54.3860], [24.5055, 54.3872], [24.5066, 54.3881],
];
/* Closed Catmull-Rom, three samples a segment — 48 vertices, about 25 m apart, which is finer
   than the bake managed on this island and still trivial next to Corniche's 1,905. */
function smooth(pts, per = 3){
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++){
    const p0 = pts[(i-1+n)%n], p1 = pts[i], p2 = pts[(i+1)%n], p3 = pts[(i+2)%n];
    for (let s = 0; s < per; s++){
      const t = s / per, t2 = t*t, t3 = t2*t;
      out.push([0,1].map(k => 0.5 * ((2*p1[k]) + (-p0[k]+p2[k])*t +
        (2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t2 + (-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t3)));
    }
  }
  return out;
}
const ring = smooth(CTRL).map(([la, lo]) => toM(la, lo).map(v => Math.round(v*10)/10));

const inPoly = (pt, poly) => { let n = false;
  for (let a = 0, b = poly.length-1; a < poly.length; b = a++){
    const [xa,ya] = poly[a], [xb,yb] = poly[b];
    if ((ya > pt[1]) !== (yb > pt[1]) && pt[0] < (xb-xa)*(pt[1]-ya)/(yb-ya) + xa) n = !n;
  } return n; };

const idx = JSON.parse(fs.readFileSync(new URL('../data/index.json', import.meta.url), 'utf8'));
const isl = JSON.parse(fs.readFileSync(new URL('../data/isle-maryah.json', import.meta.url), 'utf8'));
const entry = idx.islands.find(v => v.id === 'maryah');
const was = entry.extent;

/* cx/cy ARE HELD AT THE BAKE'S ORIGINAL VALUES, AND THAT IS NOT A ROUNDING DECISION.

   extent.cx/cy is the island's LOCAL ORIGIN — islandOrigin() hands it to every converter, so it is
   the zero that the outline, the roads, the footprints, the venue pins AND every hand-authored
   coordinate in w2h-city.js and w2h-world.js are measured from. Al Maryah's KIT_ZONES boxes, the
   Galleria, Cleveland Clinic, Four Seasons, Rosewood and the west-quay promenade are all literals
   in that frame.

   The first version of this script recomputed cx/cy as the centre of the new ring. That moved the
   origin 211 m — 27 units — and every one of those kits went with it, off the island and into the
   water, while the outline itself looked perfect. A shape fix that silently relocates a season of
   hand-placement is a worse bug than the shape it fixes.

   So the origin is pinned and only the SPAN moves. w/d are measured from the pinned origin rather
   than across the ring, so the normalised shape still lands inside +/-1 with the origin off-centre;
   x0..x1/y0..y1 stay the ring's true bounds, because locateReal and the app's own ISLAND_EXTENTS
   use them as a hit box and want the real thing. */
const ORIGIN = { cx: -2952.2, cy: 1354 };
const xs = ring.map(p=>p[0]), ys = ring.map(p=>p[1]);
const ext = { x0:Math.min(...xs), x1:Math.max(...xs), y0:Math.min(...ys), y1:Math.max(...ys) };
ext.cx = ORIGIN.cx; ext.cy = ORIGIN.cy;
ext.w = +(2 * Math.max(...xs.map(x=>Math.abs(x-ext.cx)))).toFixed(1);
ext.d = +(2 * Math.max(...ys.map(y=>Math.abs(y-ext.cy)))).toFixed(1);

console.log('outline ', (Array.isArray(entry.outline[0][0])?entry.outline[0]:entry.outline).length,
            '->', ring.length, 'vertices');
console.log('span    ', Math.round(was.w)+' x '+Math.round(was.d)+' m  ->  '+ext.w+' x '+ext.d+' m   (span about the pinned origin)');
console.log('island  ', Math.round(ext.x1-ext.x0)+' x '+Math.round(ext.y1-ext.y0)+' m   (the real island is about 810 x 1220)');
console.log('origin  ', 'cx '+ext.cx+' cy '+ext.cy+'  — unchanged, so every hand-placed kit stays put');
console.log('lat     ', toLat(was.y0).toFixed(4)+'..'+toLat(was.y1).toFixed(4), '->',
            toLat(ext.y0).toFixed(4)+'..'+toLat(ext.y1).toFixed(4));
console.log('lng     ', toLon(was.x0).toFixed(4)+'..'+toLon(was.x1).toFixed(4), '->',
            toLon(ext.x0).toFixed(4)+'..'+toLon(ext.x1).toFixed(4));

console.log('\non the island now:');
let bad = 0;
for (const [n, la, lo] of [['The Galleria',24.501101,54.388547], ['Cleveland Clinic',24.4995,54.3865],
                           ['Four Seasons',24.5025,54.3882], ['ADGM / Rosewood',24.4978,54.3862],
                           ['Zuma',24.5003,54.3874], ['Beach Rotana (mainland)',24.49567,54.38467]]){
  const on = inPoly(toM(la, lo), ring), want = !n.includes('mainland');
  if (on !== want) bad++;
  console.log('  ', n.padEnd(24), on ? 'on Al Maryah' : 'off it', on === want ? '' : '   <-- WRONG');
}
const kept = isl.buildings.filter(b => inPoly([b.x, b.y], ring));
console.log('\nbuildings', isl.buildings.length, '->', kept.length,
            '(' + (isl.buildings.length-kept.length) + ' were on the reclamation the ring wrongly swallowed)');
if (bad) { console.error('\nrefusing to write: ' + bad + ' landmark(s) on the wrong side'); process.exit(1); }

if (process.env.APPLY){
  entry.outline = ring; entry.extent = ext;
  if (entry.counts) entry.counts.buildings = kept.length;
  isl.buildings = kept;
  if (isl.extent) isl.extent = ext;
  fs.writeFileSync(new URL('../data/index.json', import.meta.url), JSON.stringify(idx));
  fs.writeFileSync(new URL('../data/isle-maryah.json', import.meta.url), JSON.stringify(isl));
  console.log('\nwritten to data/index.json and data/isle-maryah.json');
}

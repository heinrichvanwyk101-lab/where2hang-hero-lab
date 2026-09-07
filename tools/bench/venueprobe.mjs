// What does the bake hold where a venue stands? For each host below: island, island units for
// coordview, and the surveyed footprints within R metres (size, height, OSM name/class). No browser.
//   node tools/bench/venueprobe.mjs [radius]
import fs from 'fs';
const R = +process.argv[2] || 60;
const HOSTS = [
  ['yas',      'Yas Plaza hotels (Crowne Plaza)',       24.465862, 54.597321],
  ['maryah',   'Four Seasons / Coya',                   24.4962,   54.3885],
  ['maryah',   'Galleria (SushiArt, Antonia Chic)',     24.501367, 54.388462],
  ['maryah',   '49ers',                                 24.498507, 54.394646],
  ['reem',     'Boutik Mall (Butcher Shop)',            24.48897,  54.400043],
  ['saadiyat', 'Park Hyatt (Park Grill)',               24.545403, 54.434937],
  ['corniche', 'InterContinental Al Bateen',            24.457741, 54.328598],
  ['corniche', 'Mina strip (Flavors Grill)',            24.527798, 54.363903],
  ['corniche', 'Mina strip (Phosphorus Kadoura)',       24.514192, 54.375307],
  ['corniche', 'Al Bateen cafés (SADDLE)',              24.453539, 54.340096],
  ['corniche', 'Al Bateen cafés (Caffeino)',            24.451912, 54.336146],
  ['corniche', 'Mushrif Mall',                          24.434635, 54.413232],
  ['corniche', 'Downtown (Class Food)',                 24.48399,  54.365395],
  ['corniche', 'Downtown (Bosporus, Al Zahiyah)',       24.495649, 54.383938],
  ['corniche', 'Downtown (Dampa, Electra)',             24.494442, 54.366108],
  ['corniche', 'Novotel Al Bustan (Swiss Butter)',      24.42941,  54.429127],
  ['corniche', 'Mosaic, Al Saadah',                     24.431566, 54.435978],
  ['corniche', 'Marina Mall (Marine Mirage)',           24.473703, 54.316212],
  ['corniche', 'Khalidiyah (Steak Chef)',               24.465771, 54.331387],
  ['corniche', 'Al Nahyan (Jones the Grocer)',          24.463991, 54.38702],
  ['raha',     'Al Raha Beach (Swaikhat)',              24.443624, 54.612411],
  ['raha',     'Al Raha Beach (3B Burger)',             24.443538, 54.609026],
];
const isles = {};
for (const id of ['corniche','maryah','reem','saadiyat','yas','raha']) isles[id] = JSON.parse(fs.readFileSync(`data/isle-${id}.json`,'utf8'));
for (const [id, label, lat, lng] of HOSTS){
  const x = (lng - 54.42) * 101320, y = (lat - 24.49) * 111320;
  const d = isles[id], e = d.extent;
  const inside = x >= e.x0 && x <= e.x1 && y >= e.y0 && y <= e.y1;
  const ux = ((x - e.cx) / 7.8).toFixed(1), uz = (-(y - e.cy) / 7.8).toFixed(1);
  const near = d.buildings.map(b => ({ b, dist: Math.hypot(b.x - x, b.y - y) })).filter(o => o.dist <= R).sort((a, b) => a.dist - b.dist).slice(0, 6);
  const lm = Object.entries(d.landmarks || {}).map(([k, v]) => [k, Math.hypot(v.x - x, v.y - y)]).filter(([, dd]) => dd < 400).sort((a, b) => a[1] - b[1]).slice(0, 3);
  console.log(`\n## ${label}  [${id}${inside ? '' : ' OUTSIDE EXTENT'}]  metres (${x.toFixed(0)}, ${y.toFixed(0)})  units (${ux}, ${uz})`);
  if (lm.length) console.log('   landmarks near: ' + lm.map(([k, dd]) => `${k} ${dd.toFixed(0)}m`).join(' · '));
  if (!near.length) console.log('   no footprint within ' + R + ' m');
  for (const { b, dist } of near) console.log(`   ${dist.toFixed(0).padStart(3)} m  ${b.w.toFixed(0)}x${b.d.toFixed(0)} m  h ${b.h ?? '?'}  ${b.cls || ''}${b.sub ? '/' + b.sub : ''}  ${b.osm || ''}`);
}

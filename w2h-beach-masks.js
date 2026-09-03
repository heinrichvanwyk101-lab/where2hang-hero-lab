/* BEACH MASKS — where the beach is trimmed or confined, drawn on a real map.

   HOW TO USE, FROM A PHONE.
     1. Open geojson.io, draw a polygon over the stretch of coast to change.
     2. In the feature's properties table, add two rows:
          island   one of: corniche, maryah, reem, saadiyat, yas, raha
          mode     remove   — no beach inside this polygon
                   only     — beach ONLY inside polygons marked "only" for this island
     3. Copy the GeoJSON and paste it over the FeatureCollection below. Several features are fine;
        several islands in one collection are fine.
     4. Bump nothing else. This file is fetched with the same cache-buster as every other module.

   COORDINATES ARE PLAIN LON/LAT, exactly as geojson.io emits them. The conversion into the model
   happens at build time in w2h-world.js using the same projection the bake used — see
   tools/pin.mjs for the transform and its self-test. Nothing here needs translating by hand.

   RULES. A "remove" polygon wins over an "only" one where they overlap. An island with no "only"
   polygons keeps its beach everywhere except inside its "remove" polygons. An island with at
   least one "only" polygon has beach nowhere else. Polygons may extend over the sea or over land
   freely — only the beach band is affected, nothing else in the scene reads this file. */
export const BEACH_MASKS = {
  "type": "FeatureCollection",
  "features": []
};

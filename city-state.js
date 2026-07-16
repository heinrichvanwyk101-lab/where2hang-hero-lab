// PASTE TARGET: where2hang-hero-lab/city-state.js
// Where2Hang — city-hero data seam (lab). Same logic as the app's lib/cityState.ts,
// as plain JS. Mock now → in the app this becomes a Supabase read (live check-ins).

export function getCityState(venueCount = 0) {
  const d = new Date();
  const hr = d.getHours();
  const day = d.getDay();                 // 0 Sun … 6 Sat
  const weekend = day === 5 || day === 6; // Fri/Sat (UAE)

  let tod = "night";
  if (hr >= 5 && hr < 8) tod = "dawn";
  else if (hr >= 8 && hr < 17) tod = "day";
  else if (hr >= 17 && hr < 20) tod = "sunset";

  let busyness = hr >= 18 && hr < 24 ? 0.7 : hr >= 12 && hr < 18 ? 0.4 : 0.15;
  if (weekend) busyness = Math.min(1, busyness + 0.25);

  const hotIndex = busyness > 0.62 && venueCount > 0 ? 0 : -1;
  return { tod, busyness, hotIndex };
}

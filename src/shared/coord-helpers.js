// coord-helpers.js - Distance computation, coordinate/elevation interpolation
// Requires: CONFIG.courseCoords, CONFIG.elevations, CONFIG.totalMiles, CONFIG.totalGain
// For multi-lap (Sleeping Giant): CONFIG.loopMiles is set

// Build distance array for each coordinate (cumulative miles)
var coordDistances = [0];
(function() {
  var coords = CONFIG.courseCoords;
  for (var i = 1; i < coords.length; i++) {
    var x1 = coords[i - 1][0], y1 = coords[i - 1][1];
    var x2 = coords[i][0], y2 = coords[i][1];
    var dLng = (x2 - x1) * Math.cos((y1 + y2) / 2 * Math.PI / 180) * 69.172;
    var dLat = (y2 - y1) * 69.172;
    coordDistances.push(coordDistances[i - 1] + Math.sqrt(dLng * dLng + dLat * dLat));
  }
  // Normalize to loop/total miles
  var normMiles = CONFIG.loopMiles || CONFIG.totalMiles;
  var rawTotal = coordDistances[coordDistances.length - 1];
  for (var i = 0; i < coordDistances.length; i++) {
    coordDistances[i] = (coordDistances[i] / rawTotal) * normMiles;
  }
})();

// Build elevation profile indexed by distance (in feet)
var eleProfile = CONFIG.elevations.map(function(e, i) {
  var normMiles = CONFIG.loopMiles || CONFIG.totalMiles;
  return {
    d: (i / (CONFIG.elevations.length - 1)) * normMiles,
    e: e * 3.28084 // meters to feet
  };
});

// Distance wrapping for loop courses
function loopDist(dist) {
  if (!CONFIG.loopMiles) return dist;
  return dist % CONFIG.loopMiles;
}

function getEleAtDist(dist) {
  var d = CONFIG.loopMiles ? loopDist(dist) : dist;
  for (var i = 1; i < eleProfile.length; i++) {
    if (eleProfile[i].d >= d) {
      var p0 = eleProfile[i - 1], p1 = eleProfile[i];
      var dRange = p1.d - p0.d;
      var t = dRange > 0 ? (d - p0.d) / dRange : 0;
      return p0.e + (p1.e - p0.e) * t;
    }
  }
  return eleProfile[eleProfile.length - 1].e;
}

function getGradeAtDist(dist) {
  var delta = 0.05;
  var totalM = CONFIG.totalMiles;
  if (typeof TOTAL_MILES !== 'undefined') totalM = TOTAL_MILES;
  var e1 = getEleAtDist(Math.max(0, dist - delta));
  var e2 = getEleAtDist(Math.min(totalM, dist + delta));
  var dDist = delta * 2 * 5280;
  return dDist > 0 ? ((e2 - e1) / dDist) * 100 : 0;
}

function getGainAtDist(dist) {
  var totalM = CONFIG.totalMiles;
  var totalG = CONFIG.totalGain;
  if (typeof TOTAL_MILES !== 'undefined') { totalM = TOTAL_MILES; totalG = TOTAL_GAIN; }
  return (dist / totalM) * totalG;
}

function getCoordAtDist(dist) {
  var d = CONFIG.loopMiles ? loopDist(dist) : dist;
  var coords = CONFIG.courseCoords;
  for (var i = 1; i < coordDistances.length; i++) {
    if (coordDistances[i] >= d) {
      var t = (d - coordDistances[i - 1]) / (coordDistances[i] - coordDistances[i - 1]);
      var c0 = coords[i - 1], c1 = coords[i];
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t];
    }
  }
  return coords[coords.length - 1];
}

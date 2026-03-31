// Weather UI — exposure zone overlay for elevation profile canvas
// Called before the elevation fill to draw colored vertical bands behind the profile.
// No-op when weather data is not present.

function drawExposureZones(ctx, padding, chartW, chartH, exposureSegments, maxDist) {
  if (!exposureSegments || !exposureSegments.length) return;

  var colors = {
    exposed: 'rgba(249,168,37,0.15)',
    partial: 'rgba(33,150,243,0.08)',
    shaded: 'rgba(76,175,80,0.10)'
  };

  for (var i = 0; i < exposureSegments.length; i++) {
    var seg = exposureSegments[i];
    var color = colors[seg.type];
    if (!color) continue;

    var x1 = padding.left + (seg.startMile / maxDist) * chartW;
    var x2 = padding.left + (seg.endMile / maxDist) * chartW;

    ctx.fillStyle = color;
    ctx.fillRect(x1, padding.top, x2 - x1, chartH);
  }
}

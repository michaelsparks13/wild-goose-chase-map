// elevation-profile.js - drawElevationProfile (parameterized by CONFIG.colors)
// Requires: CONFIG, eleProfile

function drawElevationProfile() {
  var canvas = document.getElementById('profileCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  var w = rect.width;
  var h = rect.height;
  var padding = { top: 10, right: 10, bottom: 25, left: 40 };
  var chartW = w - padding.left - padding.right;
  var chartH = h - padding.top - padding.bottom;

  var maxDist = CONFIG.profileMaxDist || CONFIG.totalMiles;
  var maxEle = CONFIG.profileMaxEle;
  var minEle = CONFIG.profileMinEle;

  // Draw grid
  ctx.strokeStyle = CONFIG.colors.profileGrid;
  ctx.lineWidth = 1;
  for (var i = 0; i <= 4; i++) {
    var y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
  }

  // Draw elevation area
  var elevations = CONFIG.elevations;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top + chartH);
  elevations.forEach(function(ele, i) {
    var x = padding.left + (i / (elevations.length - 1)) * chartW;
    var y = padding.top + chartH - ((ele - minEle) / (maxEle - minEle)) * chartH;
    ctx.lineTo(x, y);
  });
  ctx.lineTo(padding.left + chartW, padding.top + chartH);
  ctx.closePath();
  var gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
  gradient.addColorStop(0, CONFIG.colors.profileFillTop);
  gradient.addColorStop(1, CONFIG.colors.profileFillBottom);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw elevation line
  ctx.beginPath();
  elevations.forEach(function(ele, i) {
    var x = padding.left + (i / (elevations.length - 1)) * chartW;
    var y = padding.top + chartH - ((ele - minEle) / (maxEle - minEle)) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = CONFIG.colors.primary;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw labels
  ctx.fillStyle = CONFIG.colors.profileLabel;
  ctx.font = '10px ' + CONFIG.fontFamily;
  ctx.textAlign = 'center';
  var step = CONFIG.profileMileStep || 3;
  for (var m = 0; m <= maxDist; m += step) {
    var x = padding.left + (m / maxDist) * chartW;
    ctx.fillText(m + ' mi', x, h - 8);
  }
  ctx.textAlign = 'right';
  // Convert meters to feet for display
  var minFt = Math.round(minEle * 3.28084);
  var midEle = (minEle + maxEle) / 2;
  var midFt = Math.round(midEle * 3.28084);
  var maxFt = Math.round(maxEle * 3.28084);
  ctx.fillText(minFt.toLocaleString() + ' ft', padding.left - 5, padding.top + chartH);
  ctx.fillText(midFt.toLocaleString() + ' ft', padding.left - 5, padding.top + chartH / 2);
  ctx.fillText(maxFt.toLocaleString() + ' ft', padding.left - 5, padding.top + 10);
}

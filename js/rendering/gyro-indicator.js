// ═══════════════════════════════════════════════════ GYRO INDICATOR
class GyroIndicator {
  constructor(canvas) {
    this.canvas = canvas;
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = 110; this.canvas.height = 110;
  }
  render(tdc, sub) {
    if (!this.ctx) return;
    const ctx = this.ctx, w = 110, h = 110, cx = w/2, cy = h/2, r = 46;
    ctx.clearRect(0, 0, w, h);
    // Background ring
    ctx.strokeStyle = '#1a3535'; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
    // Gyro arc
    const gyro = tdc.gyroAngle ?? 0;
    const qual = tdc.solutionQuality;
    const arcCol = qual > 0.7 ? '#7be08f' : qual > 0.4 ? '#f0c35a' : '#e36b5d';
    const startAngle = -Math.PI/2;
    const endAngle = startAngle + (gyro / 180) * Math.PI;
    ctx.strokeStyle = arcCol; ctx.lineWidth = 10;
    ctx.beginPath();
    if (Math.abs(gyro) > 0.5) {
      ctx.arc(cx, cy, r, startAngle, endAngle, gyro < 0);
    }
    ctx.stroke();
    // Center info
    ctx.fillStyle = '#d7f5e7'; ctx.font = 'bold 13px Consolas'; ctx.textAlign = 'center';
    ctx.fillText(gyro !== null ? `${gyro > 0 ? '+' : ''}${gyro.toFixed(0)}°` : '--', cx, cy + 5);
    ctx.font = '9px Consolas'; ctx.fillStyle = '#86a99b';
    ctx.fillText('GYRO', cx, cy + 18);
    // Solution quality label
    ctx.fillStyle = arcCol; ctx.font = 'bold 10px Consolas';
    ctx.fillText(`SOL ${Math.round(qual*100)}%`, cx, cy - 30);
    ctx.textAlign = 'left';
  }
}

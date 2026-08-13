// ═══════════════════════════════════════════════════ PARTICLE SYSTEM
// Hard ceilings are a last line of defence for 4 GB Android tablets during a
// convoy attack with wakes, gunfire and depth charges all active at once.
const PARTICLE_MAX=420,SPARK_MAX=120;
class ParticleSystem {
  constructor() { this.particles = []; this.sparks = []; }

  trimBudgets(){
    if(this.particles.length>PARTICLE_MAX)this.particles.splice(0,this.particles.length-PARTICLE_MAX);
    if(this.sparks.length>SPARK_MAX)this.sparks.splice(0,this.sparks.length-SPARK_MAX);
  }

  spawnExplosion(xNm, yNm, scale=1, isHit=true) {
    const count = isHit ? 28 : 14;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.3 + Math.random() * 0.8) * scale;
      this.particles.push({
        xNm, yNm,
        vx: Math.cos(angle) * speed * 0.0008,
        vy: Math.sin(angle) * speed * 0.0008,
        life: 1, maxLife: 0.6 + Math.random() * 0.8,
        size: (1 + Math.random() * 2.5) * scale,
        type: isHit ? (Math.random() < 0.3 ? 'smoke' : 'fire') : 'dc',
        ageSec: 0
      });
    }
    // Sparks
    if (isHit) {
      for (let i = 0; i < 12; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.001 + Math.random() * 0.002;
        this.sparks.push({
          xNm, yNm,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1, ageSec: 0, maxLife: 0.4 + Math.random() * 0.3
        });
      }
    }
    this.trimBudgets();
  }

  update(dt) {
    for (const p of this.particles) {
      p.ageSec += dt; p.xNm += p.vx * dt; p.yNm += p.vy * dt;
      p.life = 1 - p.ageSec / p.maxLife;
      p.vx *= 0.96; p.vy *= 0.96;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const s of this.sparks) {
      s.ageSec += dt; s.xNm += s.vx * dt; s.yNm += s.vy * dt;
      s.life = 1 - s.ageSec / s.maxLife;
    }
    this.sparks = this.sparks.filter(s => s.life > 0);
  }

  draw(ctx, w2s) {
    for (const p of this.particles) {
      const pos = w2s(p.xNm, p.yNm);
      const sz = p.size * (0.5 + p.life * 0.5);
      ctx.globalAlpha = p.life * 0.85;
      if (p.type === 'fire') {
        const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, sz * 6);
        g.addColorStop(0, `rgba(255,220,80,${p.life})`);
        g.addColorStop(0.5, `rgba(240,100,30,${p.life * 0.7})`);
        g.addColorStop(1, `rgba(220,50,0,0)`);
        ctx.fillStyle = g;
      } else if (p.type === 'smoke') {
        const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, sz * 8);
        g.addColorStop(0, `rgba(80,80,80,${p.life * 0.5})`);
        g.addColorStop(1, `rgba(40,40,40,0)`);
        ctx.fillStyle = g;
      } else {
        const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, sz * 5);
        g.addColorStop(0, `rgba(215,245,231,${p.life * 0.7})`);
        g.addColorStop(1, `rgba(123,224,143,0)`);
        ctx.fillStyle = g;
      }
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, sz * (p.type === 'smoke' ? 8 : 6), 0, Math.PI * 2);
      ctx.fill();
    }
    // Sparks
    ctx.globalAlpha = 1;
    for (const s of this.sparks) {
      const pos = w2s(s.xNm, s.yNm);
      ctx.strokeStyle = `rgba(255,200,50,${s.life})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(pos.x - s.vx * 800, pos.y - s.vy * 800);
      ctx.stroke();
    }
  }

  // Ship wake particles
  spawnWake(xNm, yNm, heading, speedKnots) {
    if (speedKnots < 1 || Math.random() > 0.3) return;
    const backRad = degToRad(heading + 180);
    const spread = 0.08;
    for (let side = -1; side <= 1; side += 2) {
      const perpRad = degToRad(heading + 90 * side);
      this.particles.push({
        xNm: xNm + Math.cos(backRad) * 0.02 + Math.cos(perpRad) * 0.015,
        yNm: yNm + Math.sin(backRad) * 0.02 + Math.sin(perpRad) * 0.015,
        vx: Math.cos(backRad) * 0.0002 * speedKnots + (Math.random() - 0.5) * 0.0001,
        vy: Math.sin(backRad) * 0.0002 * speedKnots + (Math.random() - 0.5) * 0.0001,
        life: 1, maxLife: 3 + Math.random() * 4,
        size: 0.4 + Math.random() * 0.6,
        type: 'wake', ageSec: 0
      });
    }
    this.trimBudgets();
  }
}

const particles = new ParticleSystem();

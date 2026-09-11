// ═══════════════════════════════════════════════════ SHIP RECOGNITION MANUAL UI
/* Phase 5.1: Interactive in-game ship recognition manual (ONI-208 / Flottenkalender)
   allowing the captain to browse silhouette classes, compare composite mast/funnel
   codes, inspect masthead heights and drafts, and formally identify targets. */

const RecognitionManual = {
  container: null,
  game: null,
  selectedCategory: 'ALL',
  selectedClassId: 'flower-corvette',
  isOpen: false,

  ensure(game) {
    this.game = game || this.game;
    if (this.container) return;

    const el = document.createElement('div');
    el.id = 'recManualModal';
    el.className = 'rec-manual-modal hidden';
    el.innerHTML = `
      <div class="rec-manual-veil"></div>
      <div class="rec-manual-window">
        <div class="rec-manual-header">
          <div class="rec-manual-title">
            <span class="rec-doc-code">ONI-208 / FM 30-50</span>
            <h3>SHIP RECOGNITION MANUAL</h3>
          </div>
          <button type="button" class="rec-manual-close" id="recManualCloseBtn" aria-label="Close Manual">✕</button>
        </div>
        
        <div class="rec-manual-tabs" id="recManualTabs">
          <button type="button" class="rec-tab-btn active" data-cat="ALL">ALL</button>
          <button type="button" class="rec-tab-btn" data-cat="WARSHIP">WARSHIPS</button>
          <button type="button" class="rec-tab-btn" data-cat="ESCORT">ESCORTS</button>
          <button type="button" class="rec-tab-btn" data-cat="MERCHANT">MERCHANTS</button>
          <button type="button" class="rec-tab-btn" data-cat="TANKER">TANKERS</button>
        </div>

        <div class="rec-manual-body">
          <div class="rec-manual-list-col" id="recManualList"></div>
          <div class="rec-manual-detail-col" id="recManualDetail"></div>
        </div>

        <div class="rec-manual-footer" id="recManualFooter"></div>
      </div>
    `;

    document.body.appendChild(el);
    this.container = el;

    // Event listeners
    el.querySelector('.rec-manual-veil')?.addEventListener('click', () => this.close());
    el.querySelector('#recManualCloseBtn')?.addEventListener('click', () => this.close());

    el.querySelectorAll('.rec-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.rec-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedCategory = btn.dataset.cat;
        this.renderList();
      });
    });

    // Keyboard 'm' toggle
    window.addEventListener('keydown', (e) => {
      if (e.key === 'm' || e.key === 'M') {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (this.isOpen) this.close();
        else this.open();
      }
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  },

  open(game) {
    this.ensure(game);
    this.isOpen = true;
    this.container.classList.remove('hidden');

    // Auto-select category or class matching current target if available
    const s = this.game?.getSnapshot?.();
    const targetId = s?.tdc?.targetId || s?.tactical?.selectedTrackId;
    const track = targetId ? s?.world?.contactTracks?.[targetId] : null;
    const contact = targetId ? (s?.world?.contacts || []).find(c => c.id === targetId) : null;

    if (track?.identifiedClassId) {
      this.selectedClassId = track.identifiedClassId;
    } else if (contact && typeof inferShipClassFromContact === 'function') {
      const inf = inferShipClassFromContact(contact);
      if (inf) this.selectedClassId = inf.id;
    }

    this.renderList();
    this.renderDetail();
    this.renderFooter();

    if (this.game) {
      this.game.dispatch({ type: 'PAUSE_FOR_MODAL' });
    }
  },

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.container?.classList.add('hidden');
    if (this.game) {
      this.game.dispatch({ type: 'RESUME_FROM_MODAL' });
    }
  },

  renderList() {
    const listEl = this.container.querySelector('#recManualList');
    if (!listEl || typeof getAllRecognitionClasses !== 'function') return;

    const classes = getAllRecognitionClasses(this.selectedCategory);
    if (!classes.some(c => c.id === this.selectedClassId) && classes.length > 0) {
      this.selectedClassId = classes[0].id;
    }

    listEl.innerHTML = classes.map(c => `
      <div class="rec-card-item ${c.id === this.selectedClassId ? 'selected' : ''}" data-id="${c.id}">
        <div class="rec-card-sil">
          <svg viewBox="0 0 140 40" class="rec-sil-svg">
            <path d="${c.silhouetteSvg}" fill="currentColor"/>
          </svg>
        </div>
        <div class="rec-card-info">
          <div class="rec-card-name">${c.name}</div>
          <div class="rec-card-meta">
            <span class="rec-tag-code">${c.compositeCode}</span>
            <span class="rec-tag-navy">${c.navy}</span>
          </div>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.rec-card-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectedClassId = item.dataset.id;
        listEl.querySelectorAll('.rec-card-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        this.renderDetail();
        this.renderFooter();
      });
    });
  },

  renderDetail() {
    const detailEl = this.container.querySelector('#recManualDetail');
    if (!detailEl || typeof getShipRecognitionClass !== 'function') return;

    const c = getShipRecognitionClass(this.selectedClassId);
    if (!c) {
      detailEl.innerHTML = '<div class="rec-empty">No class selected</div>';
      return;
    }

    const d = c.dimensions;
    detailEl.innerHTML = `
      <div class="rec-detail-view">
        <div class="rec-detail-hero">
          <svg viewBox="0 0 140 40" class="rec-hero-svg">
            <path d="${c.silhouetteSvg}" fill="var(--ink, #d6e2dd)"/>
          </svg>
        </div>

        <div class="rec-detail-name">${c.name}</div>
        <div class="rec-detail-sub">${c.navy} · ${c.category} · ${c.compositeCode}</div>

        <div class="rec-specs-grid">
          <div class="rec-spec-box">
            <span class="rec-spec-lbl">LENGTH</span>
            <strong class="rec-spec-val">${d.lengthFt} ft <small>(${(d.lengthFt * 0.3048).toFixed(0)}m)</small></strong>
          </div>
          <div class="rec-spec-box highlight">
            <span class="rec-spec-lbl">MASTHEAD (STADIMETER)</span>
            <strong class="rec-spec-val">${d.mastheadHeightFt} ft <small>(${(d.mastheadHeightFt * 0.3048).toFixed(0)}m)</small></strong>
          </div>
          <div class="rec-spec-box highlight">
            <span class="rec-spec-lbl">DRAFT (TORP DEPTH)</span>
            <strong class="rec-spec-val">${d.draftFt} ft <small>(${(d.draftFt * 0.3048).toFixed(1)}m)</small></strong>
          </div>
          <div class="rec-spec-box">
            <span class="rec-spec-lbl">BEAM</span>
            <strong class="rec-spec-val">${d.beamFt} ft</strong>
          </div>
          <div class="rec-spec-box">
            <span class="rec-spec-lbl">TONNAGE</span>
            <strong class="rec-spec-val">${c.tonnage.toLocaleString()} t</strong>
          </div>
          <div class="rec-spec-box">
            <span class="rec-spec-lbl">MAX SPEED</span>
            <strong class="rec-spec-val">${c.speedMaxKnots.toFixed(1)} kn</strong>
          </div>
        </div>

        <div class="rec-detail-section">
          <h4>COMPOSITE CLASSIFICATION & PROFILE</h4>
          <p><strong>Code:</strong> ${c.compositeCode} &nbsp;|&nbsp; <strong>Profile:</strong> ${c.deckProfile.replace(/_/g, ' ')}</p>
          <p><strong>Armament:</strong> ${c.armament}</p>
        </div>

        <div class="rec-detail-section">
          <h4>RECOGNITION POINTERS</h4>
          <p class="rec-notes">${c.recognitionNotes}</p>
        </div>
      </div>
    `;
  },

  renderFooter() {
    const footerEl = this.container.querySelector('#recManualFooter');
    if (!footerEl || typeof getShipRecognitionClass !== 'function') return;

    const s = this.game?.getSnapshot?.();
    const targetId = s?.tdc?.targetId || s?.tactical?.selectedTrackId;
    const c = getShipRecognitionClass(this.selectedClassId);

    if (!targetId || !c) {
      footerEl.innerHTML = `
        <div class="rec-footer-status muted">No contact currently locked in scope or TDC. Select a target to assign identification.</div>
        <button type="button" class="rec-action-btn secondary" id="recDismissBtn">DISMISS</button>
      `;
      footerEl.querySelector('#recDismissBtn')?.addEventListener('click', () => this.close());
      return;
    }

    const tr = s?.world?.contactTracks?.[targetId];
    const isAlreadyIdent = tr?.identifiedClassId === c.id;
    const statusTxt = isAlreadyIdent
      ? `Target ${targetId} currently confirmed as ${c.name}.`
      : `Target ${targetId} locked in TDC. Assign classification?`;

    footerEl.innerHTML = `
      <div class="rec-footer-status">
        <strong>TARGET ${targetId}:</strong> <span>${statusTxt}</span>
      </div>
      <div class="rec-footer-actions">
        <button type="button" class="rec-action-btn secondary" id="recDismissBtn">BACK</button>
        <button type="button" class="rec-action-btn primary" id="recAssignBtn" ${isAlreadyIdent ? 'disabled' : ''}>
          IDENTIFY TARGET AS ${c.name.toUpperCase()}
        </button>
      </div>
    `;

    footerEl.querySelector('#recDismissBtn')?.addEventListener('click', () => this.close());
    footerEl.querySelector('#recAssignBtn')?.addEventListener('click', () => {
      this.game.dispatch({
        type: 'IDENTIFY_CONTACT_CLASS',
        trackId: targetId,
        classId: c.id
      });
      globalThis.Toast?.ok?.(`Target ${targetId} classified as ${c.name}.`);
      this.close();
    });
  }
};

globalThis.RecognitionManual = RecognitionManual;

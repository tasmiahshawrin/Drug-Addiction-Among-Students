/**
 * Student Addiction Risk Dynamics - Interactive D3 Visualization Script (script.js)
 * Visualizes:
 *  1. Dynamic Key Trends and Insights Section
 *  2. Diagram 1: Beeswarm Dot Density Plot (Individual Cohort Vulnerability Spectrum)
 *  3. Diagram 2: Pairwise Factor Matrix / Bubble Chart (with "Burst into" Drill-Down & Bar Chart)
 */

const ALL_FACTORS = [
  'Experimentation',
  'Academic_Performance_Decline',
  'Social_Isolation',
  'Financial_Issues',
  'Physical_Mental_Health_Problems',
  'Legal_Consequences',
  'Relationship_Strain',
  'Risk_Taking_Behavior',
  'Withdrawal_Symptoms',
  'Denial_and_Resistance_to_Treatment'
];

const METADATA = {
  Experimentation: { shortLabel: 'Experimentation', displayName: 'Substance Experimentation' },
  Academic_Performance_Decline: { shortLabel: 'Academic Decline', displayName: 'Academic Performance Decline' },
  Social_Isolation: { shortLabel: 'Social Isolation', displayName: 'Social Isolation' },
  Financial_Issues: { shortLabel: 'Financial Strain', displayName: 'Financial Issues' },
  Physical_Mental_Health_Problems: { shortLabel: 'Health Problems', displayName: 'Physical & Mental Health Problems' },
  Legal_Consequences: { shortLabel: 'Legal Troubles', displayName: 'Legal Consequences' },
  Relationship_Strain: { shortLabel: 'Relationship Strain', displayName: 'Interpersonal Relationship Strain' },
  Risk_Taking_Behavior: { shortLabel: 'Risk Taking', displayName: 'Risk-Taking Behavior' },
  Withdrawal_Symptoms: { shortLabel: 'Withdrawal', displayName: 'Withdrawal Symptoms' },
  Denial_and_Resistance_to_Treatment: { shortLabel: 'Treatment Denial', displayName: 'Denial & Treatment Resistance' }
};

// Global Application State (Beeswarm = D1, Matrix = D2)
const AppState = {
  theme: 'light',
  records: [],
  d1Factors: new Set(ALL_FACTORS),
  d2Factors: new Set(['Experimentation', 'Academic_Performance_Decline', 'Social_Isolation', 'Financial_Issues', 'Physical_Mental_Health_Problems']),
  d2SelectedPair: { f1: 'Relationship_Strain', f2: 'Social_Isolation' }
};

/* -------------------------------------------------------------
   HIGH-SPEED STREAMING CSV PARSER (Zero-GC, Instant Execution)
   ------------------------------------------------------------- */
function parseCSV(text) {
  const rows = [];
  const len = text.length;
  let start = 0;
  let headers = null;

  while (start < len) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = len;
    const line = text.slice(start, end).trim();
    start = end + 1;

    if (!line) continue;

    if (!headers) {
      headers = line.split(',').map(h => h.trim());
      continue;
    }

    const parts = line.split(',');
    if (parts.length === headers.length) {
      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = parts[j].trim();
      }
      rows.push(obj);
    }
  }
  return rows;
}

async function loadData() {
  // 1. Standalone dataset from dataset.js (100% Offline, Zero CORS issues on file:/// or localhost)
  if (typeof window.STUDENT_DATASET_CSV === 'string' && window.STUDENT_DATASET_CSV.length > 100) {
    return parseCSV(window.STUDENT_DATASET_CSV);
  }

  // 2. Embedded script tag in index.html
  const tag = document.getElementById('embedded-csv');
  if (tag && tag.textContent.trim().length > 100) {
    return parseCSV(tag.textContent);
  }

  // 3. If running on a web server (e.g. VS Code Live Server), fetch directly
  try {
    const response = await fetch('student_addiction_dataset_train_cleaned.csv');
    if (response.ok) {
      const text = await response.text();
      return parseCSV(text);
    }
  } catch (e) {
    // Expected when running directly as local file:/// URI without server
  }

  throw new Error('Unable to load student dataset.');
}

/* -------------------------------------------------------------
   TOOLTIP CONTROLLER
   ------------------------------------------------------------- */
const Tooltip = {
  el: null,
  titleEl: null,
  rowsEl: null,
  hintEl: null,

  init() {
    this.el = document.getElementById('narrative-tooltip');
    this.titleEl = document.getElementById('tt-title');
    this.rowsEl = document.getElementById('tt-rows');
    this.hintEl = document.getElementById('tt-hint');
  },

  show(event, title, rows, hint) {
    if (!this.el) this.init();
    if (!this.el) return;
    this.titleEl.textContent = title;
    this.rowsEl.innerHTML = rows.map(r =>
      `<div class="tooltip-row"><span class="lbl">${r.label}</span><span class="val ${r.isRed ? 'red' : ''}">${r.val}</span></div>`
    ).join('');
    this.hintEl.textContent = hint || 'Click for deeper breakdown.';
    this.el.classList.add('visible');
    this.move(event);
  },

  move(event) {
    if (!this.el) return;
    let x = event.clientX;
    let y = event.clientY - 12;
    const b = this.el.getBoundingClientRect();
    if (x - b.width / 2 < 12) x = b.width / 2 + 12;
    if (x + b.width / 2 > window.innerWidth - 12) x = window.innerWidth - b.width / 2 - 12;
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
  },

  hide() {
    if (!this.el) return;
    this.el.classList.remove('visible');
  }
};

/* =============================================================
   1. KEY TRENDS AND INSIGHTS COMPUTATION (DYNAMIC FROM DATASET)
   ============================================================= */
function renderInsights(records) {
  const container = document.getElementById('insights-grid');
  if (!container || !records || records.length === 0) return;

  const totalStudents = records.length;
  let totalAddicted = 0;
  records.forEach(r => {
    if (r.Addiction_Class === 'Yes') totalAddicted++;
  });
  const baselineRate = (totalAddicted / totalStudents) * 100;

  // 1. Single factor with strongest addiction correlation
  let bestFactor = null;
  let bestFactorRate = -1;
  let bestFactorCount = 0;

  ALL_FACTORS.forEach(f => {
    let yesCount = 0;
    let yesAddicted = 0;
    records.forEach(r => {
      if (r[f] === 'Yes') {
        yesCount++;
        if (r.Addiction_Class === 'Yes') yesAddicted++;
      }
    });
    const rate = yesCount > 0 ? (yesAddicted / yesCount) * 100 : 0;
    if (rate > bestFactorRate) {
      bestFactorRate = rate;
      bestFactor = f;
      bestFactorCount = yesCount;
    }
  });

  // 2. Most common factor combination (highest dual Yes count)
  let topPair = { f1: null, f2: null, count: -1, addRate: 0 };
  let highestRatePair = { f1: null, f2: null, count: 0, addRate: -1 };

  for (let i = 0; i < ALL_FACTORS.length; i++) {
    for (let j = i + 1; j < ALL_FACTORS.length; j++) {
      const f1 = ALL_FACTORS[i];
      const f2 = ALL_FACTORS[j];
      let pairYes = 0;
      let pairAdd = 0;
      records.forEach(r => {
        if (r[f1] === 'Yes' && r[f2] === 'Yes') {
          pairYes++;
          if (r.Addiction_Class === 'Yes') pairAdd++;
        }
      });
      const pairRate = pairYes > 0 ? (pairAdd / pairYes) * 100 : 0;

      if (pairYes > topPair.count) {
        topPair = { f1, f2, count: pairYes, addRate: pairRate };
      }
      if (pairRate > highestRatePair.addRate && pairYes >= 100) {
        highestRatePair = { f1, f2, count: pairYes, addRate: pairRate };
      }
    }
  }

  // 3. Notable gap between groups (High symptom burden vs Low symptom burden)
  let highVulnCount = 0, highVulnAdd = 0;
  let lowVulnCount = 0, lowVulnAdd = 0;
  records.forEach(r => {
    let yesCount = 0;
    ALL_FACTORS.forEach(f => { if (r[f] === 'Yes') yesCount++; });
    if (yesCount >= 5) {
      highVulnCount++;
      if (r.Addiction_Class === 'Yes') highVulnAdd++;
    } else if (yesCount <= 2) {
      lowVulnCount++;
      if (r.Addiction_Class === 'Yes') lowVulnAdd++;
    }
  });
  const highVulnRate = highVulnCount > 0 ? (highVulnAdd / highVulnCount) * 100 : 0;
  const lowVulnRate = lowVulnCount > 0 ? (lowVulnAdd / lowVulnCount) * 100 : 0;
  const rateGap = highVulnRate - lowVulnRate;
  const vulnMultiplier = lowVulnRate > 0 ? (highVulnRate / lowVulnRate).toFixed(1) : '1.0';

  const getLabel = (f) => METADATA[f] ? METADATA[f].shortLabel : f;

  container.innerHTML = `
    <div class="insight-card">
      <div class="insight-card-tag">Overall Prevalence</div>
      <div class="insight-card-val highlight">${baselineRate.toFixed(1)}%</div>
      <div class="insight-card-desc">
        Across <strong>${totalStudents.toLocaleString()}</strong> surveyed students, <strong>${totalAddicted.toLocaleString()}</strong> are confirmed under Addiction Class.
      </div>
    </div>

    <div class="insight-card">
      <div class="insight-card-tag">Strongest Individual Factor</div>
      <div class="insight-card-val">${getLabel(bestFactor)}</div>
      <div class="insight-card-desc">
        Students reporting <strong>${getLabel(bestFactor)}</strong> exhibit the highest single-factor addiction rate at <strong>${bestFactorRate.toFixed(1)}%</strong> (${bestFactorCount.toLocaleString()} students).
      </div>
    </div>

    <div class="insight-card">
      <div class="insight-card-tag">Most Common Factor Pair</div>
      <div class="insight-card-val">${getLabel(topPair.f1)} & ${getLabel(topPair.f2)}</div>
      <div class="insight-card-desc">
        Dual positive response in <strong>${topPair.count.toLocaleString()} students</strong>, carrying a <strong>${topPair.addRate.toFixed(1)}%</strong> joint addiction probability.
      </div>
    </div>

    
  `;
}

/* =============================================================
   DEDICATED FACTORS PANEL CONTROLLER
   ============================================================= */
function renderDiagramFactorsPanel(diagramNum, factorSet, onUpdateCallback) {
  const container = document.getElementById(`d${diagramNum}-chips-row`);
  const countEl = document.getElementById(`d${diagramNum}-count`);
  if (!container) return;

  container.innerHTML = '';
  if (countEl) countEl.textContent = `${factorSet.size} of ${ALL_FACTORS.length}`;

  ALL_FACTORS.forEach(f => {
    const meta = METADATA[f];
    const isSelected = factorSet.has(f);

    const chip = document.createElement('button');
    chip.className = 'factor-chip ' + (isSelected ? 'active' : '');
    chip.innerHTML = `<span class="chip-dot"></span>${meta.shortLabel}`;

    chip.addEventListener('click', () => {
      if (factorSet.has(f)) {
        if (factorSet.size > 2) factorSet.delete(f);
      } else {
        factorSet.add(f);
      }
      renderDiagramFactorsPanel(diagramNum, factorSet, onUpdateCallback);
      onUpdateCallback();
    });

    container.appendChild(chip);
  });
}

/* =============================================================
   DIAGRAM 1: BEESWARM DOT DENSITY PLOT (SWAPPED TO FIRST)
   ============================================================= */
function initDiagram1() {
  const container = document.getElementById('d1-beeswarm-container');
  if (!container) return;
  container.innerHTML = '';

  const margin = { top: 35, right: 40, bottom: 55, left: 50 };
  const svg = d3.select(container).append('svg');
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([0, 100]);
  const zonesG = g.append('g').attr('class', 'beeswarm-zones');
  const guidesG = g.append('g').attr('class', 'beeswarm-guides');
  const xAxisG = g.append('g').attr('class', 'axis x-axis');
  const labelsG = g.append('g').attr('class', 'beeswarm-cluster-labels');
  const dotsG = g.append('g').attr('class', 'beeswarm-dots');
  const meanG = g.append('g').attr('class', 'beeswarm-mean-group');

  function update() {
    const factors = Array.from(AppState.d1Factors);
    const containerW = Math.max(container.clientWidth || 0, 750);
    const width = containerW - margin.left - margin.right;
    const height = 280;

    svg.attr('viewBox', `0 0 ${containerW} ${height + margin.top + margin.bottom}`)
      .attr('style', 'max-width: 100%; height: auto;');

    x.range([25, width - 25]);
    const isDark = AppState.theme === 'dark';

    // Risk Level Background Zones
    const zones = [
      { name: 'Low Risk', min: 0, max: 25, fill: isDark ? 'rgba(255, 182, 193, 0.03)' : 'rgba(253, 240, 243, 0.5)' },
      { name: 'Moderate', min: 25, max: 50, fill: isDark ? 'rgba(255, 182, 193, 0.06)' : 'rgba(247, 202, 214, 0.35)' },
      { name: 'Elevated', min: 50, max: 75, fill: isDark ? 'rgba(255, 105, 180, 0.08)' : 'rgba(244, 172, 183, 0.35)' },
      { name: 'Critical', min: 75, max: 100, fill: isDark ? 'rgba(255, 77, 109, 0.12)' : 'rgba(229, 107, 143, 0.22)' }
    ];

    const zoneRects = zonesG.selectAll('.beeswarm-zone-rect').data(zones);
    zoneRects.exit().remove();
    zoneRects.enter().append('rect')
      .attr('class', 'beeswarm-zone-rect')
      .merge(zoneRects)
      .attr('x', d => x(d.min))
      .attr('width', d => x(d.max) - x(d.min))
      .attr('y', 0)
      .attr('height', height)
      .attr('fill', d => d.fill);

    const zoneLabels = zonesG.selectAll('.beeswarm-zone-label').data(zones);
    zoneLabels.exit().remove();
    zoneLabels.enter().append('text')
      .attr('class', 'beeswarm-zone-label')
      .merge(zoneLabels)
      .attr('x', d => (x(d.min) + x(d.max)) / 2)
      .attr('y', 14)
      .attr('text-anchor', 'middle')
      .text(d => d.name);

    // Compute tick marks
    const numDistinctScores = factors.length + 1;
    const isFewFactors = numDistinctScores <= 5;

    let tickValues = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    if (isFewFactors) {
      tickValues = [];
      for (let k = 0; k <= factors.length; k++) {
        tickValues.push((k / factors.length) * 100);
      }
    }

    const xAxis = d3.axisBottom(x)
      .tickValues(tickValues)
      .tickFormat(d => `${d.toFixed(0)}%`);

    xAxisG.attr('transform', `translate(0,${height})`)
      .transition().duration(400)
      .call(xAxis);

    // Background Guides
    const guideLines = guidesG.selectAll('.beeswarm-guide-line').data(tickValues);
    guideLines.exit().remove();
    guideLines.enter().append('line')
      .attr('class', 'beeswarm-guide-line')
      .merge(guideLines)
      .attr('x1', d => x(d))
      .attr('x2', d => x(d))
      .attr('y1', 20)
      .attr('y2', height);

    // Sample points for beeswarm
    const sampleRate = Math.floor(AppState.records.length / 140);
    const points = [];
    const scoreCounts = {};
    tickValues.forEach(v => { scoreCounts[v.toFixed(1)] = 0; });

    let totalScoreSum = 0;
    let sampleStudentCount = 0;

    const bucketWidth = (width / numDistinctScores);
    const maxJitterSpread = isFewFactors ? bucketWidth * 0.32 : bucketWidth * 0.15;

    for (let i = 0; i < AppState.records.length; i += sampleRate) {
      const r = AppState.records[i];
      let yesCnt = 0;
      factors.forEach(f => { if (r[f] === 'Yes') yesCnt++; });
      const score = (yesCnt / factors.length) * 100;
      const scoreKey = score.toFixed(1);
      scoreCounts[scoreKey] = (scoreCounts[scoreKey] || 0) + 1;

      totalScoreSum += score;
      sampleStudentCount++;

      const jitterOffset = (Math.random() - 0.5) * maxJitterSpread;

      points.push({
        id: i,
        score,
        targetX: x(score) + jitterOffset,
        yesCnt,
        isAddicted: r.Addiction_Class === 'Yes',
        color: r.Addiction_Class === 'Yes'
          ? (isDark ? '#FF4D6D' : '#C9184A')
          : (isDark ? '#FFF0F3' : '#1F1619')
      });
    }

    const meanScore = sampleStudentCount > 0 ? (totalScoreSum / sampleStudentCount) : 50;

    // Cluster sample count labels
    if (isFewFactors) {
      const clusterLabelData = tickValues.map(tv => {
        const key = tv.toFixed(1);
        const countSampled = scoreCounts[key] || 0;
        const estimatedPopulation = Math.round(countSampled * sampleRate);
        return { score: tv, count: estimatedPopulation };
      });

      const clusterLabels = labelsG.selectAll('.beeswarm-cluster-label').data(clusterLabelData);
      clusterLabels.exit().remove();
      clusterLabels.enter().append('text')
        .attr('class', 'beeswarm-cluster-label')
        .merge(clusterLabels)
        .transition().duration(400)
        .attr('x', d => x(d.score))
        .attr('y', height - 8)
        .text(d => d.count > 0 ? `n=${d.count.toLocaleString()}` : '');
    } else {
      labelsG.selectAll('.beeswarm-cluster-label').remove();
    }

    const dotRadius = isFewFactors ? 4.2 : 4.6;
    const simulation = d3.forceSimulation(points)
      .force('x', d3.forceX(d => d.targetX).strength(1.4))
      .force('y', d3.forceY(height / 2).strength(0.18))
      .force('collide', d3.forceCollide(dotRadius + 1.1).iterations(3))
      .stop();

    for (let i = 0; i < 110; ++i) simulation.tick();

    const dots = dotsG.selectAll('.beeswarm-dot').data(points, d => d.id);
    dots.exit().transition().duration(250).attr('r', 0).remove();

    const dotsEnter = dots.enter().append('circle')
      .attr('class', 'beeswarm-dot')
      .attr('r', 0)
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)
      .attr('fill', d => d.color)
      .attr('stroke', isDark ? '#22161C' : '#FFFFFF')
      .attr('stroke-width', 1.1)
      .attr('fill-opacity', 0.92);

    dotsEnter.merge(dots)
      .transition().duration(500).ease(d3.easeCubicOut)
      .attr('r', dotRadius)
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)
      .attr('fill', d => d.color)
      .attr('stroke', isDark ? '#22161C' : '#FFFFFF');

    meanG.selectAll('*').remove();
    const meanX = x(meanScore);
    meanG.append('line')
      .attr('class', 'beeswarm-mean-line')
      .attr('x1', meanX).attr('x2', meanX)
      .attr('y1', 25).attr('y2', height);

    meanG.append('text')
      .attr('class', 'beeswarm-mean-badge')
      .attr('x', meanX + 5)
      .attr('y', 36)
      .text(`Mean: ${meanScore.toFixed(1)}%`);

    dotsG.selectAll('.beeswarm-dot')
      .on('mouseover', function (event, d) {
        Tooltip.show(
          event,
          `Student Vulnerability: ${d.score.toFixed(1)}%`,
          [
            { label: 'Positive Factors', val: `${d.yesCnt} of ${factors.length} Active ('Yes')` },
            { label: 'Addiction Status', val: d.isAddicted ? 'Confirmed Addicted (Yes)' : 'Non-Addicted (No)', isRed: d.isAddicted },
            { label: 'Cohort Weight', val: `~${sampleRate} students represented` }
          ],
          'Individual student particles clustered with organic density spread.'
        );
      })
      .on('mousemove', e => Tooltip.move(e))
      .on('mouseout', () => Tooltip.hide());
  }

  // Quick Action Buttons for Diagram 1
  const btnAll = document.getElementById('d1-btn-all');
  if (btnAll) {
    btnAll.onclick = () => {
      AppState.d1Factors = new Set(ALL_FACTORS);
      renderDiagramFactorsPanel(1, AppState.d1Factors, update);
      update();
    };
  }

  const btnRel = document.getElementById('d1-btn-relational');
  if (btnRel) {
    btnRel.onclick = () => {
      AppState.d1Factors = new Set(['Relationship_Strain', 'Social_Isolation', 'Physical_Mental_Health_Problems', 'Withdrawal_Symptoms']);
      renderDiagramFactorsPanel(1, AppState.d1Factors, update);
      update();
    };
  }

  const btnBeh = document.getElementById('d1-btn-behavioral');
  if (btnBeh) {
    btnBeh.onclick = () => {
      AppState.d1Factors = new Set(['Experimentation', 'Risk_Taking_Behavior', 'Denial_and_Resistance_to_Treatment', 'Academic_Performance_Decline']);
      renderDiagramFactorsPanel(1, AppState.d1Factors, update);
      update();
    };
  }

  renderDiagramFactorsPanel(1, AppState.d1Factors, update);
  update();
}

/* =============================================================
   DIAGRAM 2: PAIRWISE FACTOR MATRIX & BURST-INTO (SWAPPED TO SECOND)
   Bubble radius scaled by calculated addiction rate (%)
   ============================================================= */
function initDiagram2() {
  const container = document.getElementById('d2-matrix-container');
  if (!container) return;
  container.innerHTML = '';

  const margin = { top: 30, right: 30, bottom: 95, left: 145 };
  const svg = d3.select(container).append('svg');
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scalePoint().padding(0.6);
  const y = d3.scalePoint().padding(0.6);
  const rScale = d3.scaleSqrt();
  const colorScale = d3.scaleSequential();

  const gridG = g.append('g').attr('class', 'matrix-grid');
  const bubblesG = g.append('g').attr('class', 'matrix-bubbles');
  const xAxisG = g.append('g').attr('class', 'axis matrix-x-axis');
  const yAxisG = g.append('g').attr('class', 'axis matrix-y-axis');

  function update() {
    const factors = Array.from(AppState.d2Factors);
    const containerW = Math.max(container.clientWidth || 0, 560);
    const gridDim = Math.min(containerW - margin.left - margin.right, 460);

    const totalW = gridDim + margin.left + margin.right;
    const totalH = gridDim + margin.top + margin.bottom;

    svg.attr('viewBox', `0 0 ${totalW} ${totalH}`)
      .attr('style', 'max-width: 100%; height: auto;');

    x.range([0, gridDim]).domain(factors);
    y.range([gridDim, 0]).domain(factors);

    const isDark = AppState.theme === 'dark';

    const matrixData = [];
    let minRate = 100, maxRate = 0;
    let maxVolume = 0;

    for (let i = 0; i < factors.length; i++) {
      for (let j = 0; j < factors.length; j++) {
        const f1 = factors[i];
        const f2 = factors[j];
        let bothYes = 0, bothYesAdd = 0;
        AppState.records.forEach(r => {
          if (r[f1] === 'Yes' && r[f2] === 'Yes') {
            bothYes++;
            if (r.Addiction_Class === 'Yes') bothYesAdd++;
          }
        });
        const rateBoth = bothYes > 0 ? (bothYesAdd / bothYes) * 100 : 0;
        if (rateBoth < minRate) minRate = rateBoth;
        if (rateBoth > maxRate) maxRate = rateBoth;
        if (bothYes > maxVolume) maxVolume = bothYes;

        matrixData.push({ f1, f2, bothYes, rateBoth, bothYesAdd });
      }
    }

    // Radius proportional to calculated addiction rate (d3.scaleSqrt)
    const maxBubbleRadius = (gridDim / factors.length) * 0.44;
    const minBubbleRadius = Math.max(3.5, maxBubbleRadius * 0.28);
    rScale.domain([Math.max(25, minRate - 2), Math.max(minRate + 5, maxRate)])
      .range([minBubbleRadius, maxBubbleRadius]);

    // Color proportional to dual Yes student volume
    colorScale
      .domain([0, maxVolume])
      .interpolator(isDark
        ? d3.interpolateRgb('#5E3D4D', '#FF6584')
        : d3.interpolateRgb('#E8B4C0', '#D81E48'));

    xAxisG.attr('transform', `translate(0,${gridDim})`)
      .transition().duration(400)
      .call(d3.axisBottom(x).tickFormat(d => METADATA[d].shortLabel))
      .selectAll('text')
      .attr('transform', 'rotate(-35)')
      .style('text-anchor', 'end')
      .attr('dx', '-0.5em')
      .attr('dy', '0.5em')
      .attr('font-weight', '600')
      .attr('font-size', '11px')
      .attr('fill', isDark ? '#FFF0F3' : '#1F1619');

    yAxisG.transition().duration(400)
      .call(d3.axisLeft(y).tickFormat(d => METADATA[d].shortLabel))
      .selectAll('text')
      .attr('font-weight', '600')
      .attr('font-size', '11px')
      .attr('fill', isDark ? '#FFF0F3' : '#1F1619');

    const hLines = gridG.selectAll('.matrix-grid-h').data(factors, d => d);
    hLines.exit().remove();
    hLines.enter().append('line').attr('class', 'matrix-grid-line matrix-grid-h')
      .merge(hLines)
      .attr('x1', 0).attr('x2', gridDim)
      .attr('y1', d => y(d)).attr('y2', d => y(d));

    const vLines = gridG.selectAll('.matrix-grid-v').data(factors, d => d);
    vLines.exit().remove();
    vLines.enter().append('line').attr('class', 'matrix-grid-line matrix-grid-v')
      .merge(vLines)
      .attr('y1', 0).attr('y2', gridDim)
      .attr('x1', d => x(d)).attr('x2', d => x(d));

    const bubbles = bubblesG.selectAll('.matrix-bubble')
      .data(matrixData, d => `${d.f1}-${d.f2}`);

    bubbles.exit().remove();

    const bubblesEnter = bubbles.enter().append('circle')
      .attr('class', 'matrix-bubble')
      .attr('cx', d => x(d.f2))
      .attr('cy', d => y(d.f1))
      .attr('r', 0)
      .attr('fill', d => colorScale(d.bothYes))
      .attr('stroke', isDark ? '#170F13' : '#FFFFFF')
      .attr('stroke-width', 1.5);

    const bubblesMerge = bubblesEnter.merge(bubbles);

    bubblesMerge.classed('selected-bubble', d =>
      (d.f1 === AppState.d2SelectedPair.f1 && d.f2 === AppState.d2SelectedPair.f2) ||
      (d.f1 === AppState.d2SelectedPair.f2 && d.f2 === AppState.d2SelectedPair.f1)
    );

    bubblesMerge.transition().duration(500)
      .attr('cx', d => x(d.f2))
      .attr('cy', d => y(d.f1))
      .attr('r', d => rScale(d.rateBoth))
      .attr('fill', d => colorScale(d.bothYes))
      .attr('stroke', isDark ? '#170F13' : '#FFFFFF');

    bubblesMerge
      .on('mouseover', function (event, d) {
        Tooltip.show(
          event,
          `${METADATA[d.f1].shortLabel} ✕ ${METADATA[d.f2].shortLabel}`,
          [
            { label: 'Joint Addiction Rate (Bubble Size)', val: d.rateBoth.toFixed(1) + '%', isRed: d.rateBoth >= 40.0 },
            { label: 'Dual Positive Volume (Bubble Color)', val: d.bothYes.toLocaleString() + ' students' },
            { label: 'Addiction Lift vs Baseline (38.8%)', val: ((d.rateBoth - 38.78) >= 0 ? '+' : '') + (d.rateBoth - 38.78).toFixed(1) + '%' }
          ],
          'Click bubble to burst into right-hand detail panel & bar chart.'
        );
      })
      .on('mousemove', e => Tooltip.move(e))
      .on('mouseout', () => Tooltip.hide())
      .on('click', function (event, d) {
        AppState.d2SelectedPair = { f1: d.f1, f2: d.f2 };
        bubblesMerge.classed('selected-bubble', b =>
          (b.f1 === d.f1 && b.f2 === d.f2) || (b.f1 === d.f2 && b.f2 === d.f1)
        );
        updateBurstSketchBox(d.f1, d.f2);
      });
  }

  // Quick Action Buttons for Diagram 2
  const btnTop5 = document.getElementById('d2-btn-top5');
  if (btnTop5) {
    btnTop5.onclick = () => {
      AppState.d2Factors = new Set(['Experimentation', 'Academic_Performance_Decline', 'Social_Isolation', 'Financial_Issues', 'Physical_Mental_Health_Problems']);
      renderDiagramFactorsPanel(2, AppState.d2Factors, update);
      update();
    };
  }

  const btnAll = document.getElementById('d2-btn-all');
  if (btnAll) {
    btnAll.onclick = () => {
      AppState.d2Factors = new Set(ALL_FACTORS);
      renderDiagramFactorsPanel(2, AppState.d2Factors, update);
      update();
    };
  }

  const btnTop3 = document.getElementById('d2-btn-top3');
  if (btnTop3) {
    btnTop3.onclick = () => {
      AppState.d2Factors = new Set(['Relationship_Strain', 'Social_Isolation', 'Physical_Mental_Health_Problems']);
      renderDiagramFactorsPanel(2, AppState.d2Factors, update);
      update();
    };
  }

  renderDiagramFactorsPanel(2, AppState.d2Factors, update);
  update();
  updateBurstSketchBox(AppState.d2SelectedPair.f1, AppState.d2SelectedPair.f2);
}

/* =============================================================
   BURST-INTO BOX & BAR CHART CONTROLLER
   ============================================================= */
function updateBurstSketchBox(f1, f2) {
  const m1 = METADATA[f1] || { shortLabel: f1 };
  const m2 = METADATA[f2] || { shortLabel: f2 };
  const total = AppState.records.length;

  let bothYes = 0, bothYesAdd = 0;
  let f1Only = 0, f1OnlyAdd = 0;
  let f2Only = 0, f2OnlyAdd = 0;
  let neither = 0, neitherAdd = 0;
  let unknownCount = 0;

  AppState.records.forEach(r => {
    const is1 = r[f1] === 'Yes';
    const is2 = r[f2] === 'Yes';
    const isU1 = r[f1] === 'Unknown';
    const isU2 = r[f2] === 'Unknown';
    const isAdd = r.Addiction_Class === 'Yes';

    if (isU1 || isU2) unknownCount++;

    if (is1 && is2) {
      bothYes++;
      if (isAdd) bothYesAdd++;
    } else if (is1 && !is2) {
      f1Only++;
      if (isAdd) f1OnlyAdd++;
    } else if (!is1 && is2) {
      f2Only++;
      if (isAdd) f2OnlyAdd++;
    } else {
      neither++;
      if (isAdd) neitherAdd++;
    }
  });

  const singleYes = f1Only + f2Only;
  const singleYesAdd = f1OnlyAdd + f2OnlyAdd;

  const rateBoth = bothYes > 0 ? (bothYesAdd / bothYes) * 100 : 0;
  const rateSingle = singleYes > 0 ? (singleYesAdd / singleYes) * 100 : 0;
  const rateNeither = neither > 0 ? (neitherAdd / neither) * 100 : 0;
  const delta = (rateBoth - 38.78).toFixed(1);

  const titleEl = document.getElementById('burst-title');
  if (titleEl) {
    titleEl.textContent = (f1 === f2)
      ? `${m1.shortLabel} Profile`
      : `${m1.shortLabel} ✕ ${m2.shortLabel}`;
  }

  const m1El = document.getElementById('burst-m1');
  if (m1El) m1El.textContent = bothYes.toLocaleString();

  const m2El = document.getElementById('burst-m2');
  if (m2El) m2El.textContent = rateBoth.toFixed(1) + '%';

  const tbody = document.getElementById('burst-table-body');
  if (tbody) {
    tbody.innerHTML = `
      <tr class="highlight">
        <td class="highlight"><strong>Both Yes (■ Black)</strong></td>
        <td>${bothYes.toLocaleString()} (${((bothYes / total) * 100).toFixed(1)}%)</td>
        <td class="highlight">${rateBoth.toFixed(1)}%</td>
      </tr>
      <tr>
        <td>${m1.shortLabel} Only (■ Red)</td>
        <td>${f1Only.toLocaleString()}</td>
        <td>${f1Only > 0 ? ((f1OnlyAdd / f1Only) * 100).toFixed(1) : 0}%</td>
      </tr>
      <tr>
        <td>${m2.shortLabel} Only (■ Red)</td>
        <td>${f2Only.toLocaleString()}</td>
        <td>${f2Only > 0 ? ((f2OnlyAdd / f2Only) * 100).toFixed(1) : 0}%</td>
      </tr>
      <tr>
        <td>Neither / Unknown (□ Blush)</td>
        <td>${neither.toLocaleString()}</td>
        <td>${rateNeither.toFixed(1)}%</td>
      </tr>
    `;
  }

  const summaryEl = document.getElementById('burst-summary-text');
  if (summaryEl) {
    summaryEl.innerHTML = `
      When <strong>${m1.shortLabel}</strong> and <strong>${m2.shortLabel}</strong> co-occur, addiction probability reaches <strong>${rateBoth.toFixed(1)}%</strong> (${delta >= 0 ? '+' : ''}${delta}% vs baseline).
    `;
  }

  // 1. Render Circle Bubbles
  renderSketchBurstCircles({
    yesCount: bothYes,
    noCount: singleYes,
    unknownCount: unknownCount
  });

  // 2. Render Bar Chart under Burst Panel
  renderBurstBarChart([
    { label: 'Both Positive', count: bothYes, rate: rateBoth, color: 'var(--color-yes)' },
    { label: 'Single Positive', count: singleYes, rate: rateSingle, color: 'var(--color-no)' },
    { label: 'Neither / Unknown', count: neither, rate: rateNeither, color: 'var(--color-unknown)' }
  ]);
}

function renderSketchBurstCircles(data) {
  const svg = d3.select('#burst-sketch-svg');
  if (svg.empty()) return;
  svg.selectAll('*').remove();

  const w = 320;
  const h = 150;
  svg.attr('viewBox', `0 0 ${w} ${h}`).attr('style', 'width: 100%; height: 100%;');

  const isDark = AppState.theme === 'dark';

  const items = [
    { label: 'Yes', count: data.yesCount, fill: isDark ? '#FFF0F3' : '#1F1619', stroke: isDark ? '#FFB3C6' : '#1F1619', textFill: isDark ? '#170F13' : '#FFF', x: 80, y: 75, r: 44 },
    { label: 'No', count: data.noCount, fill: isDark ? '#FF4D6D' : '#C9184A', stroke: '#C9184A', textFill: '#FFF', x: 195, y: 88, r: 38 },
    { label: 'Unknown', count: data.unknownCount, fill: isDark ? '#38242E' : '#F3DBE2', stroke: isDark ? '#754E60' : '#CFA6B2', textFill: isDark ? '#FFF0F3' : '#1F1619', x: 260, y: 45, r: 24 }
  ];

  const g = svg.selectAll('.sketch-circle-group')
    .data(items)
    .enter()
    .append('g')
    .attr('transform', d => `translate(${d.x},${d.y})`);

  g.append('circle')
    .attr('r', 0)
    .attr('fill', d => d.fill)
    .attr('stroke', d => d.stroke)
    .attr('stroke-width', 2)
    .transition().duration(600).ease(d3.easeElasticOut.amplitude(1).period(0.6))
    .attr('r', d => d.r);

  g.append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '-0.15em')
    .attr('font-size', d => Math.max(10, d.r / 3) + 'px')
    .attr('font-weight', '700')
    .attr('font-family', 'JetBrains Mono, monospace')
    .attr('fill', d => d.textFill)
    .text(d => d.count.toLocaleString());

  g.append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '1.15em')
    .attr('font-size', d => Math.max(9, d.r / 4) + 'px')
    .attr('font-weight', '600')
    .attr('fill', d => d.textFill)
    .text(d => d.label);
}

/* -------------------------------------------------------------
   5. BAR CHART UNDER THE BURST PANEL
   ------------------------------------------------------------- */
function renderBurstBarChart(barData) {
  const svg = d3.select('#burst-barchart-svg');
  if (svg.empty()) return;
  svg.selectAll('*').remove();

  const width = 340;
  const height = 135;
  const margin = { top: 10, right: 85, bottom: 15, left: 100 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  svg.attr('viewBox', `0 0 ${width} ${height}`)
    .attr('style', 'width: 100%; height: 100%;');

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const maxVal = d3.max(barData, d => d.count) || 1;
  const x = d3.scaleLinear().domain([0, maxVal]).range([0, innerW]);
  const y = d3.scaleBand().domain(barData.map(d => d.label)).range([0, innerH]).padding(0.32);

  const isDark = AppState.theme === 'dark';

  // Category Labels
  g.selectAll('.bar-cat-label')
    .data(barData)
    .enter().append('text')
    .attr('class', 'bar-cat-label')
    .attr('x', -8)
    .attr('y', d => y(d.label) + y.bandwidth() / 2)
    .attr('dy', '0.35em')
    .attr('text-anchor', 'end')
    .attr('font-size', '10px')
    .attr('font-weight', '600')
    .attr('fill', isDark ? '#E2BAC8' : '#5C3E49')
    .text(d => d.label);

  // Background Tracks
  g.selectAll('.bar-track')
    .data(barData)
    .enter().append('rect')
    .attr('class', 'bar-track')
    .attr('x', 0)
    .attr('y', d => y(d.label))
    .attr('width', innerW)
    .attr('height', y.bandwidth())
    .attr('rx', 3)
    .attr('fill', isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)');

  // Bar Fills
  g.selectAll('.bar-fill')
    .data(barData)
    .enter().append('rect')
    .attr('class', 'bar-fill')
    .attr('x', 0)
    .attr('y', d => y(d.label))
    .attr('height', y.bandwidth())
    .attr('rx', 3)
    .attr('fill', d => d.color)
    .attr('stroke', d => d.color === 'var(--color-unknown)' ? (isDark ? '#754E60' : '#CFA6B2') : 'none')
    .attr('stroke-width', 1)
    .attr('width', 0)
    .transition().duration(600).ease(d3.easeCubicOut)
    .attr('width', d => Math.max(4, x(d.count)));

  // Value & Addiction Rate Labels
  g.selectAll('.bar-val-label')
    .data(barData)
    .enter().append('text')
    .attr('class', 'bar-val-label')
    .attr('x', d => x(d.count) + 6)
    .attr('y', d => y(d.label) + y.bandwidth() / 2)
    .attr('dy', '0.35em')
    .attr('font-size', '10.5px')
    .attr('font-family', 'JetBrains Mono, monospace')
    .attr('font-weight', '700')
    .attr('fill', d => d.label.includes('Both') ? 'var(--accent-red)' : (isDark ? '#FFF0F3' : '#1F1619'))
    .text(d => `${d.count.toLocaleString()} (${d.rate.toFixed(1)}%)`);
}

/* =============================================================
   GLOBAL CONTROLS & LIFECYCLE
   ============================================================= */
function setupGlobalControls() {
  const themeBtn = document.getElementById('btn-theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const nextTheme = AppState.theme === 'light' ? 'dark' : 'light';
      AppState.theme = nextTheme;
      document.documentElement.setAttribute('data-theme', nextTheme);
      const icon = themeBtn.querySelector('.theme-icon');
      if (icon) icon.textContent = nextTheme === 'light' ? '◐' : '◑';

      initDiagram1();
      initDiagram2();
    });
  }

  const resetBtn = document.getElementById('btn-global-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      AppState.d1Factors = new Set(ALL_FACTORS);
      AppState.d2Factors = new Set(['Experimentation', 'Academic_Performance_Decline', 'Social_Isolation', 'Financial_Issues', 'Physical_Mental_Health_Problems']);
      AppState.d2SelectedPair = { f1: 'Relationship_Strain', f2: 'Social_Isolation' };

      renderDiagramFactorsPanel(1, AppState.d1Factors, () => initDiagram1());
      renderDiagramFactorsPanel(2, AppState.d2Factors, () => initDiagram2());
      initDiagram1();
      initDiagram2();
    });
  }
}

let isInitialized = false;
async function init() {
  if (isInitialized) return;
  isInitialized = true;

  try {
    AppState.records = await loadData();
    console.log('Successfully loaded', AppState.records.length, 'records.');

    setupGlobalControls();

    // 1. Render computed Key Trends & Insights
    renderInsights(AppState.records);

    // 2. Launch Diagrams (D1 = Beeswarm, D2 = Matrix)
    initDiagram1();
    initDiagram2();

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        initDiagram1();
        initDiagram2();
      }, 150);
    });

  } catch (err) {
    console.error('Initialization error:', err);
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<div style="background:#fee2e2; border:2px solid #ef4444; color:#991b1b; padding:1.5rem; margin:1rem; border-radius:8px; font-weight:bold;">Error initializing visualization: ' + err.message + '</div>'
    );
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
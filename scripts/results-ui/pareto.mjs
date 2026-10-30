const NS = 'http://www.w3.org/2000/svg';
const node = (tag, attrs, text) => {
  const el = document.createElementNS(NS,tag);
  for (const [name,value] of Object.entries(attrs)) el.setAttribute(name,value);
  if (text != null) el.textContent = text;
  return el;
};
export const compactNumber = value => new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(value);
export const dollarNumber = value => '$' + new Intl.NumberFormat('en-US',{maximumSignificantDigits:6}).format(value);
export const releaseDateNumber = value => new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(value);
export function releaseAxis(values, tickCount = 5) {
  const day = 86400000;
  const minimum = Math.min(...values), maximum = Math.max(...values);
  const padding = Math.max(2*day,(maximum-minimum)*.04);
  const low = minimum-padding, high = maximum+padding;
  return {log:false,project:value=>(value-low)/(high-low),
    ticks:Array.from({length:tickCount},(_,i)=>low+(high-low)*i/(tickCount-1))};
}
export function consumptionAxis(values, requested = 'log', tickCount = 5) {
  const log = requested === 'log' && values.length > 0 && values.every(v=>v > 0);
  const maximum = Math.max(...values,0) || 1;
  const minimum = log ? Math.min(...values)*.8 : 0;
  const low = log ? Math.log10(minimum) : 0;
  const high = log ? Math.log10(maximum*1.2) : maximum*1.1;
  return {log,project:value=>((log ? Math.log10(value) : value)-low)/(high-low),
    ticks:Array.from({length:tickCount},(_,i)=>log ? 10**(low+(high-low)*i/(tickCount-1)) : high*i/(tickCount-1))};
}

const intersects = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
function crossesBox([a,b], box) {
  let start = 0, end = 1;
  for (const [axis,low,high] of [['x',box.left,box.right],['y',box.top,box.bottom]]) {
    const delta = b[axis]-a[axis];
    if (delta === 0) { if (a[axis]<low || a[axis]>high) return false; continue; }
    const t1 = (low-a[axis])/delta, t2 = (high-a[axis])/delta;
    start = Math.max(start,Math.min(t1,t2)); end = Math.min(end,Math.max(t1,t2));
    if (start>end) return false;
  }
  return true;
}
const ADJACENT = 10, CONNECTOR = 16, GAPS = [10,16,24,34,46,60,78,100,126];
function ring(label, gap, adjacentOnly) {
  const {x,y,width,height} = label, out = [];
  const add = (left,top) => out.push({left,top,right:left+width,bottom:top+height,gap});
  for (const dy of [-height/2,-height-6,6]) { add(x+gap,y+dy); add(x-width-gap,y+dy); }
  add(x-width/2,y-height-gap); add(x-width/2,y+gap);
  if (adjacentOnly) return out;
  const d = gap*.7;
  add(x+d,y-height-d); add(x-width-d,y-height-d); add(x+d,y+d); add(x-width-d,y+d);
  add(x,y-height-gap); add(x-width,y-height-gap); add(x,y+gap); add(x-width,y+gap);
  return out;
}
function connector(label, box) {
  const ex = Math.min(Math.max(label.x,box.left),box.right), ey = Math.min(Math.max(label.y,box.top),box.bottom);
  const length = Math.hypot(ex-label.x,ey-label.y);
  if (length < 8) return null;
  const trim = 7;
  return {x1:label.x+(ex-label.x)*trim/length,y1:label.y+(ey-label.y)*trim/length,x2:ex,y2:ey};
}
export function layoutLabels(labels, points, bounds, segments = []) {
  // Frontier labels are always placed: beside the point if possible, else farther out with a short connector.
  // Other labels sit beside their point only where nothing frontier-related is covered; the rest show on hover/focus.
  const placed = [], leaders = [];
  const inside = b => b.left>=bounds.left && b.right<=bounds.right && b.top>=bounds.top && b.bottom<=bounds.bottom;
  const freeOfLabels = b => !placed.some(p=>intersects(b,{left:p.left-4,right:p.right+4,top:p.top-2,bottom:p.bottom+2}));
  const freeOfLines = b => ![...segments,...leaders].some(s=>crossesBox(s,{left:b.left-3,right:b.right+3,top:b.top-3,bottom:b.bottom+3}));
  const freeOfPoints = (b,label,which) => !points.some(p=>(which ? which(p) : true)
    && intersects(b,p.x===label.x && p.y===label.y ? {left:p.x-3,right:p.x+3,top:p.y-3,bottom:p.y+3} : {left:p.x-6,right:p.x+6,top:p.y-6,bottom:p.y+6}));
  const keep = (label,box) => {
    const entry = {...label,...box};
    delete entry.gap;
    const leader = box.gap > CONNECTOR && connector(label,box);
    if (leader) {
      entry.leader = leader;
      leaders.push([{x:leader.x1,y:leader.y1},{x:leader.x2,y:leader.y2}]);
    }
    placed.push(entry);
  };
  const frontierPoint = p => labels.some(l=>l.efficient && l.x===p.x && l.y===p.y);
  const near = GAPS.filter(g=>g<=CONNECTOR), short = GAPS.filter(g=>g>CONNECTOR && g<=34);
  const tiers = [
    [near,(b,l)=>freeOfLabels(b) && freeOfLines(b) && freeOfPoints(b,l)],
    [short,(b,l)=>freeOfLabels(b) && freeOfLines(b) && freeOfPoints(b,l)],
    [near,(b,l)=>freeOfLabels(b) && freeOfPoints(b,l)],
    [GAPS,(b,l)=>freeOfLabels(b) && freeOfLines(b) && freeOfPoints(b,l)],
    [GAPS,(b,l)=>freeOfLabels(b) && freeOfPoints(b,l)],
    [GAPS,(b,l)=>freeOfLabels(b) && freeOfPoints(b,l,frontierPoint)]
  ];
  for (const label of labels.filter(l=>l.efficient)) {
    let box = null;
    for (const [gaps,ok] of tiers) {
      box = gaps.flatMap(gap=>ring(label,gap,false)).find(b=>inside(b) && ok(b,label));
      if (box) break;
    }
    keep(label,box || fallback(label,bounds,placed));
  }
  for (const label of labels.filter(l=>!l.efficient)) {
    const box = ring(label,ADJACENT,true).find(b=>inside(b) && freeOfLabels(b) && freeOfLines(b) && freeOfPoints(b,label));
    if (box) keep(label,box);
  }
  return placed;
}
function fallback(label, bounds, placed) {
  const {width,height} = label;
  const clamp = (value,low,high) => Math.max(low,Math.min(value,Math.max(low,high)));
  const options = GAPS.flatMap(gap=>ring(label,gap,false)).map(b=>{
    const left = clamp(b.left,bounds.left,bounds.right-width), top = clamp(b.top,bounds.top,bounds.bottom-height);
    return {left,top,right:left+width,bottom:top+height,gap:Math.max(b.gap,Math.hypot(left-b.left,top-b.top)+b.gap)};
  });
  const overlap = b => placed.reduce((n,p)=>n+Math.max(0,Math.min(b.right,p.right)-Math.max(b.left,p.left))
    *Math.max(0,Math.min(b.bottom,p.bottom)-Math.max(b.top,p.top)),0);
  return options.reduce((best,b)=>overlap(b)<overlap(best) ? b : best);
}

export class ParetoChart {
  constructor(host, data, metric, onSelect, label, scale = 'log', harness = p => p.harness) {
    this.host = host; this.data = data; this.metric = metric; this.onSelect = onSelect; this.label = label;
    this.selected = null;
    this.scale = scale;
    this.harness = harness;
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(host); this.render();
    document.fonts.ready.then(()=>{ if (!this.destroyed) this.render(); });
  }
  select(id) { this.selected = id; this.render(); }
  render() {
    const width = Math.max(280,this.host.clientWidth), height = 580;
    const left = 48, right = width-22, top = 22, bottom = height-60;
    const released = this.metric === 'release_date';
    const values = this.data.points.map(p=>p.x), ticks = width < 600 ? 3 : 5;
    const axis = released ? releaseAxis(values,ticks) : consumptionAxis(values,this.scale,ticks);
    const x = v => left + axis.project(v)*(right-left), y = v => bottom - v*(bottom-top);
    const svg = node('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':released ? 'Score versus model release date' : 'Score versus mean '+(this.metric === 'cost' ? 'API-equivalent USD' : 'tokens')+' per run'});
    svg.append(node('title',{},released ? 'Earlier release and higher score are preferred. Frontier shows the best score available by each date among displayed configurations.' : 'Lower consumption and higher score are preferred. Frontier is among displayed configurations only.'));
    for (const value of [0,.25,.5,.75,1]) {
      svg.append(node('line',{x1:left,x2:right,y1:y(value),y2:y(value),class:value === .5 ? 'pareto-reference' : 'chart-grid'}));
      svg.append(node('text',{x:left-10,y:y(value)+5,'text-anchor':'end',class:'chart-tick'},value.toFixed(2)));
    }
    for (let i=0; i<axis.ticks.length; i++) {
      const value = axis.ticks[i];
      svg.append(node('line',{x1:x(value),x2:x(value),y1:top,y2:bottom,class:'chart-grid vertical'}));
      svg.append(node('text',{x:x(value),y:bottom+27,'text-anchor':i === 0 ? 'start' : i === axis.ticks.length-1 ? 'end' : 'middle',class:'chart-tick','data-axis':released ? 'release_date' : 'consumption'},released ? releaseDateNumber(value) : this.metric === 'cost' ? '$'+new Intl.NumberFormat('en-US',{maximumSignificantDigits:3}).format(value) : compactNumber(value)));
    }
    const frontier = [...new Map(this.data.frontier.map(p=>[JSON.stringify([p.x,p.score]),p])).values()];
    if (frontier.length > 1) {
      const path = frontier.map((p,i) => `${i ? 'L' : 'M'}${x(p.x)},${y(p.score)}`).join('');
      svg.append(node('path',{d:path,class:'pareto-frontier',fill:'none'}));
    }
    const groups = new Map();
    this.data.points.forEach(point => {
      const id = point.participant.participant_id;
      const efficient = this.data.frontier.includes(point);
      const selected = id === this.selected;
      const group = node('g',{class:`pareto-point${selected ? ' selected' : ''}`,tabindex:'0',role:'button',
        'data-participant':id,'aria-pressed':String(selected),'aria-label':`${this.label(point.participant)} (${point.participant.effort}), ${this.harness(point.participant)}, score ${point.score.toFixed(2)}, ${released ? 'released '+point.release.released_at : (this.metric === 'cost' ? dollarNumber(point.x) : compactNumber(point.x))+' per run'}`,transform:`translate(${x(point.x)},${y(point.score)})`});
      group.append(node('circle',{r:20,class:'pareto-target'}));
      group.append(node('circle',{r:efficient ? 6 : 3.5,class:efficient ? 'pareto-dot efficient' : 'pareto-dot'}));
      const show = () => this.tooltip(point, x(point.x), y(point.score), released, width);
      group.addEventListener('pointerenter',show);
      group.addEventListener('focus',show);
      group.addEventListener('pointerleave',() => this.tooltip(null));
      group.addEventListener('blur',() => this.tooltip(null));
      const choose = () => { this.selected = id; this.onSelect(point); this.render(); this.host.querySelector(`[data-participant="${CSS.escape(id)}"]`)?.focus({preventScroll:true}); };
      group.addEventListener('click',choose);
      group.addEventListener('keydown',event => { if (['Enter',' '].includes(event.key)) { event.preventDefault(); choose(); } });
      svg.append(group);
      groups.set(id,group);
    });
    const measure = document.createElement('canvas').getContext('2d');
    const font = getComputedStyle(this.host).getPropertyValue('--result-mono');
    measure.font = `12px ${font}`;
    const points = this.data.points.map(point=>({x:x(point.x),y:y(point.score),point}));
    const labels = points.filter(({point})=>width>=600 || point.participant.participant_id===this.selected || this.data.frontier.includes(point))
      .map(p=>({...p,id:p.point.participant.participant_id,title:`${this.label(p.point.participant)} (${p.point.participant.effort})`,efficient:this.data.frontier.includes(p.point)}))
      .sort((a,b)=>Number(b.efficient)-Number(a.efficient));
    for (const label of labels) {
      label.width = Math.ceil(measure.measureText(label.title).width)+4;
      label.height = 28;
    }
    const segments = frontier.slice(1).map((p,i)=>[{x:x(frontier[i].x),y:y(frontier[i].score)},{x:x(p.x),y:y(p.score)}]);
    for (const label of layoutLabels(labels,points,{left,top,right,bottom},segments)) {
      const dx = label.left-label.x, dy = label.top-label.y;
      if (label.leader) groups.get(label.id).append(node('line',{x1:label.leader.x1-label.x,y1:label.leader.y1-label.y,
        x2:label.leader.x2-label.x,y2:label.leader.y2-label.y,class:'pareto-leader',stroke:'#5d6a70','stroke-width':1}));
      const text = node('text',{x:dx,y:dy+12,class:`pareto-label${label.efficient ? ' efficient' : ''}`});
      text.append(node('tspan',{x:dx},label.title));
      text.append(node('tspan',{x:dx,dy:15,class:'pareto-harness'},this.harness(label.point.participant)));
      groups.get(label.id).append(text);
    }
    this.tip = document.createElement('div');
    this.tip.className = 'pareto-tooltip';
    this.tip.setAttribute('role','tooltip');
    Object.assign(this.tip.style,{position:'absolute',display:'none',pointerEvents:'none',zIndex:'2',padding:'6px 9px',
      borderRadius:'6px',border:'1px solid rgba(160,176,182,.35)',background:'rgba(13,17,19,.96)',
      font:`12px/1.45 ${font}`,whiteSpace:'nowrap',boxShadow:'0 4px 14px rgba(0,0,0,.35)'});
    if (getComputedStyle(this.host).position === 'static') this.host.style.position = 'relative';
    this.host.replaceChildren(svg,this.tip);
  }
  tooltip(point, px, py, released, width) {
    if (!this.tip) return;
    if (!point) { this.tip.style.display = 'none'; return; }
    const value = released ? 'released '+point.release.released_at
      : (this.metric === 'cost' ? dollarNumber(point.x) : compactNumber(point.x)+' tokens')+' per run';
    const rows = [[`${this.label(point.participant)} (${point.participant.effort})`,'font-weight:600'],
      [this.harness(point.participant),'opacity:.75'], [`score ${point.score.toFixed(2)} / ${value}`,'']];
    this.tip.replaceChildren(...rows.map(([text,style]) => {
      const line = document.createElement('div'); line.textContent = text; line.style.cssText = style; return line; }));
    this.tip.style.display = 'block';
    const scale = this.host.clientWidth/width, tipWidth = this.tip.offsetWidth;
    const left = px*scale+12+tipWidth > this.host.clientWidth ? px*scale-12-tipWidth : px*scale+12;
    this.tip.style.left = Math.max(0,left)+'px';
    this.tip.style.top = Math.max(0,py*scale-this.tip.offsetHeight-8)+'px';
  }
  destroy() { this.destroyed = true; this.observer.disconnect(); }
}

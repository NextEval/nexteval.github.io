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
export function layoutLabels(labels, points, bounds, segments = []) {
  const placed = [];
  for (const label of labels) {
    const {x,y,width,height} = label;
    const candidates = [];
    const add = (left,top) => candidates.push({left,top,right:left+width,bottom:top+height});
    for (const dy of [-height/2,-height-12,12]) {
      add(x+12,y+dy); add(x-width-12,y+dy);
    }
    const localCount = candidates.length;
    // Prefer aligned, adjacent labels before searching elsewhere in a dense cluster.
    for (let top=bounds.top; top+height<=bounds.bottom; top+=8) {
      for (let left=bounds.left; left+width<=bounds.right; left+=12) add(left,top);
    }
    const distance = b => Math.hypot(Math.max(b.left-x,0,x-b.right),Math.max(b.top-y,0,y-b.bottom));
    const local = candidates.splice(0,localCount);
    candidates.sort((a,b)=>distance(a)-distance(b) || Math.abs(a.top+height/2-y)-Math.abs(b.top+height/2-y));
    candidates.unshift(...local);
    const box = candidates.find(b => b.left>=bounds.left && b.right<=bounds.right && b.top>=bounds.top && b.bottom<=bounds.bottom
      && !placed.some(p=>intersects(b,{left:p.left-5,right:p.right+5,top:p.top-5,bottom:p.bottom+5}))
      && !segments.some(s=>crossesBox(s,{left:b.left-3,right:b.right+3,top:b.top-3,bottom:b.bottom+3}))
      && !points.some(p=>intersects(b,{left:p.x-10,right:p.x+10,top:p.y-10,bottom:p.y+10})));
    if (box) placed.push({...label,...box,leader:distance(box)>20});
  }
  return placed;
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
    const leaders = node('g',{'aria-hidden':'true',class:'pareto-leaders'});
    svg.append(leaders);
    const groups = new Map();
    this.data.points.forEach(point => {
      const id = point.participant.participant_id;
      const efficient = this.data.frontier.includes(point);
      const selected = id === this.selected;
      const group = node('g',{class:`pareto-point${selected ? ' selected' : ''}`,tabindex:'0',role:'button',
        'data-participant':id,'aria-pressed':String(selected),'aria-label':`${this.label(point.participant)} (${point.participant.effort}), ${this.harness(point.participant)}, score ${point.score.toFixed(2)}, ${released ? 'released '+point.release.released_at : (this.metric === 'cost' ? dollarNumber(point.x) : compactNumber(point.x))+' per run'}`,transform:`translate(${x(point.x)},${y(point.score)})`});
      group.append(node('circle',{r:20,class:'pareto-target'}));
      group.append(node('circle',{r:efficient ? 6 : 3.5,class:efficient ? 'pareto-dot efficient' : 'pareto-dot'}));
      group.append(node('title',{},`${this.label(point.participant)} / ${point.participant.harness} / ${point.participant.effort}`));
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
      if (label.leader) leaders.append(node('line',{x1:label.x,y1:label.y,x2:Math.max(label.left,Math.min(label.x,label.right)),y2:Math.max(label.top,Math.min(label.y,label.bottom))}));
      const text = node('text',{x:dx,y:dy+12,class:`pareto-label${label.efficient ? ' efficient' : ''}`});
      text.append(node('tspan',{x:dx},label.title));
      text.append(node('tspan',{x:dx,dy:15,class:'pareto-harness'},this.harness(label.point.participant)));
      groups.get(label.id).append(text);
    }
    this.host.replaceChildren(svg);
  }
  destroy() { this.destroyed = true; this.observer.disconnect(); }
}

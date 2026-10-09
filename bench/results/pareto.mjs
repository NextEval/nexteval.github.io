const NS = 'http://www.w3.org/2000/svg';
const node = (tag, attrs, text) => {
  const el = document.createElementNS(NS,tag);
  for (const [name,value] of Object.entries(attrs)) el.setAttribute(name,value);
  if (text != null) el.textContent = text;
  return el;
};
export const compactNumber = value => new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(value);
export const dollarNumber = value => '$' + new Intl.NumberFormat('en-US',{maximumSignificantDigits:6}).format(value);
export function consumptionAxis(values, requested = 'log', tickCount = 5) {
  const log = requested === 'log' && values.length > 0 && values.every(v=>v > 0);
  const maximum = Math.max(...values,0) || 1;
  const minimum = log ? Math.min(...values)*.8 : 0;
  const low = log ? Math.log10(minimum) : 0;
  const high = log ? Math.log10(maximum*1.2) : maximum*1.1;
  return {log,project:value=>((log ? Math.log10(value) : value)-low)/(high-low),
    ticks:Array.from({length:tickCount},(_,i)=>log ? 10**(low+(high-low)*i/(tickCount-1)) : high*i/(tickCount-1))};
}

export class ParetoChart {
  constructor(host, data, metric, onSelect, label, scale = 'log') {
    this.host = host; this.data = data; this.metric = metric; this.onSelect = onSelect; this.label = label;
    this.selected = data.points[0]?.participant.participant_id;
    this.scale = scale;
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(host); this.render();
  }
  select(id) { this.selected = id; this.render(); }
  render() {
    const width = Math.max(280,this.host.clientWidth), height = 410;
    const left = 48, right = width-22, top = 22, bottom = height-60;
    const axis = consumptionAxis(this.data.points.map(p=>p.x),this.scale,width < 600 ? 3 : 5);
    const x = v => left + axis.project(v)*(right-left), y = v => bottom - v*(bottom-top);
    const svg = node('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':'Score versus mean '+(this.metric === 'cost' ? 'API-equivalent USD' : 'tokens')+' per run'});
    svg.append(node('title',{},'Lower consumption and higher score are preferred. Frontier is among displayed configurations only.'));
    for (const value of [0,.25,.5,.75,1]) {
      svg.append(node('line',{x1:left,x2:right,y1:y(value),y2:y(value),class:value === .5 ? 'pareto-reference' : 'chart-grid'}));
      svg.append(node('text',{x:left-10,y:y(value)+5,'text-anchor':'end',class:'chart-tick'},value.toFixed(2)));
    }
    for (let i=0; i<axis.ticks.length; i++) {
      const value = axis.ticks[i];
      svg.append(node('line',{x1:x(value),x2:x(value),y1:top,y2:bottom,class:'chart-grid vertical'}));
      svg.append(node('text',{x:x(value),y:bottom+27,'text-anchor':i === 0 ? 'start' : i === axis.ticks.length-1 ? 'end' : 'middle',class:'chart-tick','data-axis':'consumption'},this.metric === 'cost' ? '$'+new Intl.NumberFormat('en-US',{maximumSignificantDigits:3}).format(value) : compactNumber(value)));
    }
    const frontier = [...new Map(this.data.frontier.map(p=>[JSON.stringify([p.x,p.score]),p])).values()];
    if (frontier.length > 1) {
      const path = frontier.map((p,i) => i ? `H${x(p.x)}V${y(p.score)}` : `M${x(p.x)},${y(p.score)}`).join('');
      svg.append(node('path',{d:path,class:'pareto-frontier',fill:'none'}));
    }
    this.data.points.forEach((point,index) => {
      const id = point.participant.participant_id;
      const efficient = this.data.frontier.includes(point);
      const selected = id === this.selected;
      const group = node('g',{class:`pareto-point${selected ? ' selected' : ''}`,tabindex:'0',role:'button',
        'data-participant':id,'aria-pressed':String(selected),'aria-label':`${this.label(point.participant)}, score ${point.score.toFixed(2)}, ${this.metric === 'cost' ? dollarNumber(point.x) : compactNumber(point.x)} per run`,transform:`translate(${x(point.x)},${y(point.score)})`});
      group.append(node('circle',{r:20,class:'pareto-target'}));
      group.append(node('circle',{r:efficient ? 10 : 7,class:efficient ? 'pareto-dot efficient' : 'pareto-dot'}));
      group.append(node('title',{},`${this.label(point.participant)} / ${point.participant.harness} / ${point.participant.effort}`));
      const choose = () => { this.selected = id; this.onSelect(point); this.render(); this.host.querySelector(`[data-participant="${CSS.escape(id)}"]`)?.focus({preventScroll:true}); };
      group.addEventListener('click',choose);
      group.addEventListener('keydown',event => { if (['Enter',' '].includes(event.key)) { event.preventDefault(); choose(); } });
      group.addEventListener('pointerenter',() => this.onSelect(point));
      group.addEventListener('focus',() => this.onSelect(point));
      svg.append(group);
    });
    // Place only legible labels; the full keyed configuration list remains selectable.
    const occupied = [];
    const overlaps = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const indices = this.data.points.map((point,index)=>({point,index})).sort((a,b)=>
      Number(b.point.participant.participant_id === this.selected)-Number(a.point.participant.participant_id === this.selected)
      || Number(this.data.frontier.includes(b.point))-Number(this.data.frontier.includes(a.point)));
    for (const {point,index} of indices) {
      if (width < 600 && point.participant.participant_id !== this.selected && !this.data.frontier.includes(point)) continue;
      const px = x(point.x), py = y(point.score), text = String(index+1), labelWidth = text.length*9;
      for (const [dx,dy] of [[13,-13],[-labelWidth-13,-13],[13,25],[-labelWidth-13,25],[0,-27]]) {
        const box = {left:px+dx-2,right:px+dx+labelWidth+2,top:py+dy-14,bottom:py+dy+3};
        const pointCollision = this.data.points.some(other=>other !== point && overlaps(box,{left:x(other.x)-10,right:x(other.x)+10,top:y(other.score)-10,bottom:y(other.score)+10}));
        if (box.left < left || box.right > right || box.top < top || box.bottom > bottom || pointCollision || occupied.some(other=>overlaps(box,other))) continue;
        occupied.push(box);
        svg.append(node('text',{x:px+dx,y:py+dy,class:'pareto-number'},text));
        break;
      }
    }
    this.host.replaceChildren(svg);
  }
  destroy() { this.observer.disconnect(); }
}

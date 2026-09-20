const NS='http://www.w3.org/2000/svg';
const COLORS=['#67d9ce','#e9b86c','#91aceb','#df91b1','#b5d582','#ec9683','#a49aeb','#8dc9e5'];
const DASHES=['','7 4','3 3','10 3 2 3'];
const el=(name,attrs={},text='')=>{const node=document.createElementNS(NS,name);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,String(v));if(text)node.textContent=text;return node;};
export function formatNumber(value){if(!Number.isFinite(value))return 'not available';if(value===0)return '0';if(Math.abs(value)>=1e5||Math.abs(value)<.001)return value.toExponential(2);return new Intl.NumberFormat('en',{maximumSignificantDigits:4}).format(value);}
export function stepIndex(xs,x){let a=0,b=xs.length;while(a<b){const m=(a+b)>>>1;if(xs[m]<=x)a=m+1;else b=m;}return a-1;}
export function stepPath(xs,ys,X,Y){let path='',active=false;for(let i=0;i<xs.length;i++){if(!Number.isFinite(ys[i])){active=false;continue;}const x=X(xs[i]),y=Y(ys[i]);if(!Number.isFinite(x)||!Number.isFinite(y)){active=false;continue;}path+=active?`H${x}V${y}`:`M${x},${y}`;active=true;}return path;}
export function rawX(kind,x){return kind==='performance'?2**x:kind==='data'?2**x-1:x;}
export function historyView(data,repeat){
  const series=data.series.map(s=>({label:s.label,...s.repetitions[repeat]}));
  const values=series.flatMap(s=>s.y.filter(v=>Number.isFinite(v)));
  const positive=values.length>0&&values.every(v=>v>0);
  return {series,x_domain:[1,Math.max(1,...series.map(s=>s.n_evals))],
    y_domain:values.length?[Math.min(...values),Math.max(...values)]:[0,1],
    positive,kind:'history',repeat,metric:data.metric};
}

// Group only presentation keys, never the underlying evaluations or statistics.
export function legendGroups(series){
  const groups=new Map();
  series.forEach((s,i)=>{
    const key=s.legend_key??i;
    if(!groups.has(key))groups.set(key,{label:s.label,indices:[]});
    groups.get(key).indices.push(i);
  });
  return [...groups.values()];
}

export class ScientificChart{
  constructor(host){this.host=host;this.hidden=new Set();this.observer=new ResizeObserver(()=>this.draw());this.observer.observe(host);}
  set(data,kind){this.data=data;this.kind=kind;this.hidden.clear();this.log=kind==='history'&&data.positive&&data.y_domain[1]/data.y_domain[0]>100;this.draw();}
  draw(){
    if(!this.data||this.host.clientWidth<20)return;
    const data=this.data,kind=this.kind,width=this.host.clientWidth,height=width<560?325:440;
    const left=width<560?61:76,right=18,top=24,bottom=57,w=width-left-right,h=height-top-bottom;
    const[xmin,xmax0]=data.x_domain,xmax=xmax0===xmin?xmin+1:xmax0;
    let[ymin,ymax]=kind==='history'?data.y_domain:[0,1];
    const transform=v=>this.log?Math.log10(v):v;
    let lo=transform(ymin),hi=transform(ymax);
    if(lo===hi){const pad=this.log ? .5 : Math.max(Math.abs(lo)*.05,1e-6);lo-=pad;hi+=pad;}
    if(kind==='history'){const pad=(hi-lo)*.045;lo-=pad;hi+=pad;}
    const X=x=>left+(x-xmin)/(xmax-xmin)*w,Y=y=>top+h-(transform(y)-lo)/(hi-lo)*h;
    this.host.replaceChildren();
    const groups=legendGroups(data.series),styles=[];
    groups.forEach((group,i)=>group.indices.forEach((index,j)=>{styles[index]={color:COLORS[i%COLORS.length],dash:DASHES[(i+Math.floor(i/COLORS.length)+j)%DASHES.length]};}));
    const toolbar=document.createElement('div');toolbar.className='chart-legend';
    groups.forEach(group=>{
      const b=document.createElement('button'),visible=group.indices.some(i=>!this.hidden.has(i));
      b.className='series-key';b.setAttribute('aria-pressed',String(visible));
      b.title=`Show or hide ${group.label}${group.indices.length>1?` (${group.indices.length} separate recorded curves)`:''}; comparison set stays fixed`;
      const evidence=[...new Set(group.indices.map(i=>data.series[i].evidence).filter(Boolean))];
      if(evidence.length)b.title+='\n'+evidence.join('\n');
      const swatches=document.createElement('span');swatches.className='series-swatches';
      for(const index of group.indices){
        const style=styles[index],swatch=el('svg',{class:'series-swatch',viewBox:'0 0 30 10',width:30,height:10,style:'width:30px;height:10px;flex:0 0 30px;overflow:visible','aria-hidden':'true'});
        swatch.append(el('line',{x1:1,x2:29,y1:5,y2:5,stroke:style.color,'stroke-width':3,'stroke-linecap':'butt','stroke-dasharray':style.dash||'none'}),el('circle',{cx:15,cy:5,r:2.5,fill:style.color}));
        swatches.append(swatch);
      }
      b.append(swatches,document.createTextNode(group.label));
      b.onclick=()=>{for(const i of group.indices)visible?this.hidden.add(i):this.hidden.delete(i);this.draw();};toolbar.append(b);
    });
    this.host.append(toolbar);
    if(kind==='history'&&data.positive){const modes=document.createElement('div');modes.className='chart-scale';for(const mode of ['Linear','Log']){const b=document.createElement('button');b.textContent=mode;b.setAttribute('aria-pressed',String(this.log===(mode==='Log')));b.onclick=()=>{this.log=mode==='Log';this.draw();};modes.append(b);}this.host.append(modes);}
    const frame=document.createElement('div');frame.className='chart-frame';
    const svg=el('svg',{viewBox:`0 0 ${width} ${height}`,width,height,role:'img',tabindex:0,'aria-label':`${kind} chart. Arrow keys inspect values. Legend visibility does not change scoring.`});
    svg.append(el('title',{},kind==='history'?data.metric:`${kind} profile, tolerance 1e-6`));
    const yticks=kind==='history'?Array.from({length:5},(_,i)=>lo+(hi-lo)*i/4):[0,.2,.4,.6,.8,1];
    yticks.forEach(t=>{const value=this.log?10**t:t;const y=Y(value);svg.append(el('line',{x1:left,x2:width-right,y1:y,y2:y,class:'chart-grid'}),el('text',{x:left-10,y:y+4,'text-anchor':'end',class:'chart-tick'},kind==='history'?formatNumber(value):`${Math.round(value*100)}%`));});
    let xticks=kind==='history'?Array.from(new Set([1,...Array.from({length:4},(_,i)=>Math.round(xmax*(i+1)/4))])):data.x_ticks;
    if(width<560&&xticks.length>5)xticks=xticks.filter((_,i)=>i%Math.ceil(xticks.length/5)===0);
    xticks.forEach(t=>{if(t<xmin||t>xmax)return;const x=X(t);svg.append(el('line',{x1:x,x2:x,y1:top,y2:top+h,class:'chart-grid vertical'}),el('text',{x,y:top+h+23,'text-anchor':'middle',class:'chart-tick'},formatNumber(rawX(kind,t))));});
    svg.append(el('text',{x:left,y:12,class:'chart-unit'},kind==='history'?`Clean objective · lower is better${this.log?' · log scale':''}`:'Fraction of problems solved · higher is better'));
    svg.append(el('text',{x:left+w/2,y:height-9,'text-anchor':'middle',class:'chart-axis'},kind==='performance'?'Performance ratio':kind==='data'?'Objective evaluations / (dimension + 1)':'Objective evaluations'));
    const id=`clip-${this.host.id}`;const defs=el('defs');const clip=el('clipPath',{id});clip.append(el('rect',{x:left,y:top,width:w,height:h}));defs.append(clip);svg.append(defs);
    const lines=el('g',{'clip-path':`url(#${id})`});
    data.series.forEach((s,i)=>{if(this.hidden.has(i))return;const color=styles[i].color;if(s.lower){const low=stepPath(s.x,s.lower,X,Y);const upper=stepPath(s.x,s.upper,X,Y);if(low&&upper){const points=[];for(let j=0;j<s.x.length;j++){if(j)points.push([X(s.x[j]),Y(s.upper[j-1])]);points.push([X(s.x[j]),Y(s.upper[j])]);}for(let j=s.x.length-1;j>=0;j--){points.push([X(s.x[j]),Y(s.lower[j])]);if(j)points.push([X(s.x[j]),Y(s.lower[j-1])]);}lines.append(el('path',{d:'M'+points.map(p=>p.join(',')).join('L')+'Z',fill:color,opacity:.09}));}}
      lines.append(el('path',{d:stepPath(s.x,s.y,X,Y),fill:'none',stroke:color,'stroke-width':2,'stroke-dasharray':styles[i].dash,'vector-effect':'non-scaling-stroke'}));
      const j=s.y.findLastIndex(Number.isFinite);if(j>=0)lines.append(el('circle',{cx:X(s.x[j]),cy:Y(s.y[j]),r:3.1,fill:color}));});
    svg.append(lines);
    const cross=el('line',{y1:top,y2:top+h,stroke:'#9ea7a4','stroke-dasharray':'3 4',visibility:'hidden'});svg.append(cross);
    const tip=document.createElement('div');tip.className='chart-tooltip';tip.hidden=true;tip.setAttribute('role','status');
    const inspect=(pixel)=>{const x=Math.max(xmin,Math.min(xmax,xmin+(pixel-left)/w*(xmax-xmin)));const px=X(x);cross.setAttribute('x1',px);cross.setAttribute('x2',px);cross.setAttribute('visibility','visible');tip.replaceChildren();const title=document.createElement('strong');title.textContent=`${kind==='history'?'Evaluation':kind==='performance'?'Ratio':'Evaluations / (n + 1)'} ${formatNumber(kind==='history'?Math.floor(x):rawX(kind,x))}`;tip.append(title);
      data.series.forEach((s,i)=>{if(this.hidden.has(i))return;const row=document.createElement('div');const j=stepIndex(s.x,x);const missing=j<0||!Number.isFinite(s.y[j])||(kind==='history'&&x>s.n_evals+.001);const value=missing?(kind==='history'&&x>s.n_evals?'run ended':'no finite value'):kind==='history'?formatNumber(s.y[j]):`${(s.y[j]*100).toFixed(2)}%`;row.style.color=styles[i].color;row.textContent=`${s.label}: ${value}${s.source_label?` [source: ${s.source_label}]`:''}`;if(!missing&&s.lower)row.textContent+=` [${(s.lower[j]*100).toFixed(2)}, ${(s.upper[j]*100).toFixed(2)}]%`;tip.append(row);});tip.hidden=false;tip.style.left=`${Math.max(0,Math.min(width-265,px+12))}px`;tip.style.top=`${top+12}px`;};
    let cursor=left;svg.addEventListener('pointermove',event=>{cursor=(event.clientX-svg.getBoundingClientRect().left)*width/svg.getBoundingClientRect().width;inspect(cursor);});svg.addEventListener('pointerleave',()=>{cross.setAttribute('visibility','hidden');tip.hidden=true;});svg.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();cursor=event.key==='Home'?left:event.key==='End'?left+w:Math.max(left,Math.min(left+w,cursor+(event.key==='ArrowRight'?1:-1)*w/50));inspect(cursor);}});
    frame.append(svg,tip);this.host.append(frame);
  }
  destroy(){this.observer.disconnect();}
}

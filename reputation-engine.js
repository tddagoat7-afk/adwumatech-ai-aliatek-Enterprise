const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,n));

const POS={
  'world class':4,'top ranked':4,'highly ranked':4,'prestigious':4,'excellent':3,'outstanding':3,'trusted':3,'respected':3,'leader':2,'leading':2,'innovative':2,'breakthrough':3,'award':2,'wins':2,'success':2,'growth':1.5,'strong':1.5,'improved':2,'recommended':3,'best':3,'quality':2,'impact':2,'achievement':2,'admired':3,'renowned':4,'elite':3,'historic':1.5,'scholarship':1.5,'research':1.5,'opportunity':1.5,'positive':2,'satisfied':2,'love':2.5,'great':2.5,'amazing':3
};
const NEG={
  'fraud':-5,'scandal':-5,'lawsuit':-3,'investigation':-3,'breach':-4,'crisis':-4,'controversy':-2.5,'discrimination':-4,'harassment':-4,'unsafe':-4,'failure':-3,'failed':-3,'poor':-2.5,'worst':-4,'decline':-2,'loss':-1.5,'layoff':-2,'layoffs':-2,'complaint':-2,'criticized':-2,'criticism':-2,'concern':-1.5,'risk':-1.5,'warning':-2,'negative':-2,'disappointed':-3,'hate':-3,'expensive':-1,'protest':-1.5
};
const NEGATORS=new Set(['not','never','no','hardly','without','isnt','wasnt','arent','werent','dont','doesnt','didnt']);
const INTENSIFIERS={very:1.35,extremely:1.7,highly:1.4,deeply:1.35,major:1.4,severe:1.7,serious:1.5};

const BRAND_PRIORS={
  'harvard':95,'harvard university':95,'mit':95,'massachusetts institute of technology':95,'stanford':94,'stanford university':94,'oxford':94,'university of oxford':94,'cambridge':94,'university of cambridge':94,
  'yale':92,'princeton':93,'morehouse college':86,'johns hopkins':91,'mayo clinic':94,'nasa':95,'apple':91,'microsoft':90,'google':89,'openai':84
};

function normalize(s=''){return String(s).toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9\s.-]/g,' ').replace(/\s+/g,' ').trim()}
function sourceWeight(source='',provider=''){
  const s=`${source} ${provider}`.toLowerCase();
  if(/reuters|associated press|apnews|bbc|bloomberg|financial times|ft.com|wall street journal|wsj|sec.gov|.edu\b|nature.com|science.org/.test(s))return 1.35;
  if(/cnbc|cnn|forbes|time.com|guardian|new york times|washington post|businesswire|prnewswire/.test(s))return 1.18;
  if(/reddit|bluesky|youtube|hacker news/.test(s))return .72;
  return 1;
}
function scoreText(text=''){
  const t=normalize(text),words=t.split(' ');let score=0,hits=0;
  const phrases=[...Object.entries(POS),...Object.entries(NEG)].sort((a,b)=>b[0].length-a[0].length);
  for(const [phrase,val] of phrases){if(!t.includes(phrase))continue;let mult=1;const i=t.indexOf(phrase),before=t.slice(Math.max(0,i-35),i).split(' ').filter(Boolean);if(before.some(w=>NEGATORS.has(w)))mult*=-1;for(const w of before.slice(-3))if(INTENSIFIERS[w])mult*=INTENSIFIERS[w];score+=val*mult;hits++;}
  const caps=(String(text).match(/\b[A-Z]{3,}\b/g)||[]).length;if(caps>2)score*=1.08;
  return {raw:score,hits,normalized:hits?clamp(50+score*7):50};
}
function classifyItem(item){
  const text=`${item.title||''}. ${item.description||''}`;const r=scoreText(text);const weight=sourceWeight(item.source,item.provider)*(item.confidence?(.65+item.confidence/285):1);const weighted=(r.normalized-50)*weight;
  const sentiment=weighted>6?'positive':weighted<-6?'negative':'neutral';
  return {...item,sentiment,sentimentScore:Math.round(clamp(50+weighted)),sentimentWeight:Number(weight.toFixed(2)),sentimentHits:r.hits};
}
function priorFor(company=''){
  const q=normalize(company);for(const [name,score] of Object.entries(BRAND_PRIORS))if(q===name||q.includes(name))return score;
  if(/university|college|institute|academy/.test(q))return 72;
  return 65;
}
function calculateReputation(items,company){
  const prior=priorFor(company);if(!items.length)return {reputation:prior,publicSentiment:50,brandPrior:prior,evidenceWeight:0};
  let weightedSum=0,totalWeight=0,pos=0,neg=0,neu=0;
  for(const x of items){const w=(x.sentimentWeight||1)*(.55+(x.authority||70)/155);weightedSum+=(x.sentimentScore||50)*w;totalWeight+=w;if(x.sentiment==='positive')pos++;else if(x.sentiment==='negative')neg++;else neu++;}
  const publicSentiment=totalWeight?weightedSum/totalWeight:50;
  const evidenceStrength=clamp(Math.log10(items.length+1)/2.5,0,1);
  const recentWeight=.18+.32*evidenceStrength;
  const reputation=clamp(Math.round(prior*(1-recentWeight)+publicSentiment*recentWeight));
  return {reputation,publicSentiment:Math.round(publicSentiment),brandPrior:prior,evidenceWeight:Math.round(recentWeight*100),counts:{positive:pos,neutral:neu,negative:neg}};
}

export {classifyItem,calculateReputation,scoreText,priorFor};

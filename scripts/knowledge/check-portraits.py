"""Collect Commons rights metadata. This records candidates, never approves them."""
import json,urllib.request,urllib.parse,re,html,concurrent.futures,datetime
from pathlib import Path
rows=json.loads(Path('docs/knowledge/portrait-candidates.json').read_text())
def plain(value):return html.unescape(re.sub('<[^>]+>',' ',str(value))).strip()
def collect(row):
 try:
  overrides={'harvey-milk':'Harvey_Milk_1975.jpg','gilbert-baker':'Gilbert_Baker_smiling_during_SF_Pride_2012_(hi-res).jpg'}
  image=('https://commons.wikimedia.org/wiki/Special:FilePath/'+overrides[row['slug']] if row['slug'] in overrides else row['image_url']);path=urllib.parse.unquote(urllib.parse.urlsplit(image).path)
  if 'Special:FilePath/' in path:filename=path.split('Special:FilePath/',1)[1]
  else:
   parts=path.split('/commons/',1)[1].split('/')
   filename=parts[3] if parts[0]=='thumb' else parts[2]
  if row['slug']=='harvey-milk':filename='Harvey Milk 1975.jpg'
  url='https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','format':'json','titles':'File:'+filename,'prop':'imageinfo','iiprop':'url|size|extmetadata','redirects':1})
  request=urllib.request.Request(url,headers={'User-Agent':'queer.guide editorial audit (https://queer.guide)'})
  with urllib.request.urlopen(request,timeout=25) as response:data=json.load(response)
  page=next(iter(data['query']['pages'].values()));info=page['imageinfo'][0];meta=info['extmetadata']
  get=lambda key:plain(meta.get(key,{}).get('value',''))
  license=get('LicenseShortName');creator=get('Artist');license_url=get('LicenseUrl')
  return {'slug':row['slug'],'status':('candidate' if info['width']>=400 and info['height']>=600 else 'unresolved'),'url':info['url'].split('?')[0],'source_url':info['descriptionurl'],'creator':creator,'license':license,'license_url':license_url,'attribution':f'{creator} / {license}','alt':f"Portrait of {row['name']}",'caption':row['name'],'width':info['width'],'height':info['height'],'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'evidence':{'commons_title':page['title'],'copyrighted':get('Copyrighted'),'restrictions':get('Restrictions'),'usage_terms':get('UsageTerms'),'source_description':get('ImageDescription')[:600],'review':'Check subject identity, suitability, licence and non-copyright restrictions before approval.'},'error':('Insufficient source resolution; obtain a better portrait without upscaling.' if info['width']<400 or info['height']<600 else (None if license and creator else 'Missing recoverable licence or creator'))}
 except Exception as error:return {'slug':row['slug'],'status':'unresolved','url':row['image_url'],'error':str(error)}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:results=list(executor.map(collect,rows))
Path('docs/knowledge/portrait-rights.json').write_text(json.dumps(results,indent=2,ensure_ascii=False)+'\n')
print(json.dumps([{'slug':r['slug'],'license':r.get('license'),'error':r.get('error')} for r in results],indent=2))

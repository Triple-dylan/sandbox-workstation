"""Bounded OOXML preview extraction. No macros, scripts, external links or Office execution."""
from __future__ import annotations
import base64, io, posixpath, re, zipfile
from xml.etree import ElementTree as ET

NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main','p':'http://schemas.openxmlformats.org/presentationml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
MAX_FILE=15*1024*1024
MAX_EXPANDED=64*1024*1024
class PreviewError(ValueError): pass

def xml(z,path):
    data=z.read(path)
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper(): raise PreviewError('XML declarations are not supported.')
    return ET.fromstring(data)
def text(el,tag): return ''.join(el.itertext()) if tag is None else ''.join(x.text or '' for x in el.findall('.//'+tag,NS))
def rels(z,part):
    path=posixpath.join(posixpath.dirname(part),'_rels',posixpath.basename(part)+'.rels')
    if path not in z.namelist(): return {}
    result={}
    for r in xml(z,path):
        if r.get('TargetMode')=='External': continue
        target=r.get('Target','');target=target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join(posixpath.dirname(part),target))
        if not target.startswith('../'): result[r.get('Id')]=target
    return result

def docx(z):
    body=xml(z,'word/document.xml').find('w:body',NS);blocks=[]
    for child in body:
        if len(blocks)>=10000: raise PreviewError('Document is too long for a local preview.')
        if child.tag.endswith('}p'):
            value=text(child,'w:t');style=child.find('w:pPr/w:pStyle',NS);style=style.get('{'+NS['w']+'}val','') if style is not None else ''
            heading=re.search(r'(?:heading|title)(\d*)',style,re.I)
            blocks.append({'type':'heading' if heading else 'paragraph','level':int(heading.group(1) or 1) if heading else 0,'text':value,'list':child.find('w:pPr/w:numPr',NS) is not None})
        elif child.tag.endswith('}tbl'):
            rows=[[text(cell,'w:t') for cell in row.findall('w:tc',NS)] for row in child.findall('w:tr',NS)]
            blocks.append({'type':'table','rows':rows})
    return {'kind':'document','body':'\n\n'.join(b.get('text','') for b in blocks),'document':{'blocks':blocks},'previewLimit':'Text, headings and tables are shown. Complex layout and embedded objects may differ.'}

def xlsx(z):
    shared=[]
    if 'xl/sharedStrings.xml' in z.namelist(): shared=[text(si,'s:t') for si in xml(z,'xl/sharedStrings.xml')]
    styles=[]
    if 'xl/styles.xml' in z.namelist():
        root=xml(z,'xl/styles.xml');fonts=root.find('s:fonts',NS);bolds=[f.find('s:b',NS) is not None for f in fonts] if fonts is not None else []
        xfs=root.find('s:cellXfs',NS)
        if xfs is not None:
            for xf in xfs:
                index=int(xf.get('fontId','0'));styles.append({'bold':bolds[index] if index<len(bolds) else False,'format':int(xf.get('numFmtId','0'))})
    wb=xml(z,'xl/workbook.xml');relations=rels(z,'xl/workbook.xml');sheets=[];count=0
    for s in wb.findall('s:sheets/s:sheet',NS):
        part=relations.get(s.get('{'+NS['r']+'}id'))
        if not part or part not in z.namelist(): continue
        root=xml(z,part);cells={}
        for c in root.findall('.//s:sheetData/s:row/s:c',NS):
            count+=1
            if count>100000: raise PreviewError('Workbook exceeds the local preview cell limit.')
            ref=c.get('r','');raw=c.find('s:v',NS);value=raw.text if raw is not None else '';typ=c.get('t');formula=c.find('s:f',NS)
            if typ=='s':
                try: value=shared[int(value)]
                except (ValueError,IndexError): value=''
            elif typ=='inlineStr': value=text(c,'s:t')
            elif typ=='b': value=value=='1'
            elif typ not in ('str','e'):
                try: value=float(value);value=int(value) if value.is_integer() else value
                except (ValueError,TypeError): value=value or ''
            entry={'value':value};style=int(c.get('s','0'))
            if style<len(styles): entry.update(styles[style])
            if formula is not None and formula.text: entry.update(formula=formula.text,cached=value)
            if re.fullmatch('[A-Z]+[1-9][0-9]*',ref): cells[ref]=entry
        columns=[]
        for col in root.findall('s:cols/s:col',NS):
            lo,hi=int(col.get('min','1')),min(200,int(col.get('max','1')))
            while len(columns)<hi: columns.append(104)
            for index in range(lo-1,hi): columns[index]=max(36,min(400,round(float(col.get('width','13'))*7.2)))
        sheets.append({'name':s.get('name','Sheet'),'cells':cells,'columns':columns,'merges':[m.get('ref') for m in root.findall('s:mergeCells/s:mergeCell',NS)]})
    if not sheets: raise PreviewError('No readable worksheets found.')
    return {'kind':'spreadsheet','body':'','workbook':{'sheets':sheets},'previewLimit':'Cells and basic formulas are shown. Charts, pivots, macros and advanced formatting are not rendered.'}

def pptx(z):
    p=xml(z,'ppt/presentation.xml');sz=p.find('p:sldSz',NS);width=int(sz.get('cx','12192000'));height=int(sz.get('cy','6858000'));slides=[];relations=rels(z,'ppt/presentation.xml')
    for sid in p.findall('p:sldIdLst/p:sldId',NS):
        if len(slides)>500: raise PreviewError('Too many slides for a local preview.')
        part=relations.get(sid.get('{'+NS['r']+'}id'));root=xml(z,part);rmap=rels(z,part);elements=[];background=root.find('p:cSld/p:bg/p:bgPr/a:solidFill/a:srgbClr',NS)
        for shape in root.findall('p:cSld/p:spTree/*',NS):
            transform=shape.find('p:spPr/a:xfrm',NS)
            if transform is None: continue
            off,ext=transform.find('a:off',NS),transform.find('a:ext',NS)
            if off is None or ext is None: continue
            rect={'x':float(off.get('x','0'))/width*100,'y':float(off.get('y','0'))/height*100,'w':float(ext.get('cx','0'))/width*100,'h':float(ext.get('cy','0'))/height*100}
            if shape.tag.endswith('}pic'):
                blip=shape.find('p:blipFill/a:blip',NS);image=rmap.get(blip.get('{'+NS['r']+'}embed')) if blip is not None else None
                if image and image in z.namelist() and image.lower().endswith(('.png','.jpg','.jpeg','.gif','.webp')):
                    data=z.read(image);extname=image.rsplit('.',1)[-1].lower();mime='jpeg' if extname in ('jpg','jpeg') else extname
                    if len(data)<4*1024*1024: elements.append(dict(rect,type='image',src='data:image/'+mime+';base64,'+base64.b64encode(data).decode()))
            else:
                paras=shape.findall('p:txBody/a:p',NS);value='\n'.join(text(pa,'a:t') for pa in paras)
                if not value: continue
                rp=shape.find('.//a:rPr',NS);dp=shape.find('.//a:defRPr',NS);props=rp if rp is not None else dp;font=int(props.get('sz','2400'))/100 if props is not None else 24
                color=shape.find('.//a:rPr/a:solidFill/a:srgbClr',NS);alignment=shape.find('.//a:pPr',NS)
                elements.append(dict(rect,type='text',text=value,size=font/(width/12700)*100,bold=props.get('b')=='1' if props is not None else False,color='#'+color.get('val') if color is not None else '#222222',align=alignment.get('algn','l') if alignment is not None else 'l'))
        notes=''
        for target in rmap.values():
            if '/notesSlides/' in target and target in z.namelist(): notes=text(xml(z,target),'a:t')
        slides.append({'elements':elements,'background':'#'+background.get('val') if background is not None else '#ffffff','notes':notes})
    if not slides: raise PreviewError('No readable slides found.')
    return {'kind':'presentation','body':'','presentation':{'ratio':width/height,'slides':slides},'previewLimit':'Text and supported images are shown. Themes, charts, grouped shapes and animations may differ.'}

def parse_office(data,filename):
    if len(data)>MAX_FILE: raise PreviewError('Choose a file smaller than 15 MB.')
    if not filename.lower().endswith(('.docx','.xlsx','.pptx')): raise PreviewError('Supported Office previews: DOCX, XLSX and PPTX.')
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            if len(z.infolist())>10000 or sum(i.file_size for i in z.infolist())>MAX_EXPANDED: raise PreviewError('The expanded file exceeds the preview limit.')
            result=docx(z) if filename.lower().endswith('.docx') else xlsx(z) if filename.lower().endswith('.xlsx') else pptx(z)
            result['source']={'name':filename,'format':filename.rsplit('.',1)[-1].upper(),'mode':'preview'}
            return result
    except (zipfile.BadZipFile,KeyError,ET.ParseError,TypeError,ZeroDivisionError,OverflowError,AttributeError,IndexError) as e: raise PreviewError('This file could not be previewed. It may be encrypted, damaged, or use an unsupported structure.') from e

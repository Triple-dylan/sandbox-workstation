from pathlib import Path
from docx import Document
from openpyxl import Workbook
from openpyxl.styles import Font
from pptx import Presentation
from pptx.util import Inches, Pt
ROOT=Path(__file__).parent/'fixtures';ROOT.mkdir(exist_ok=True)
doc=Document();doc.add_heading('Project brief',0);doc.add_paragraph('A shared place for the work, the evidence, and the next decision.');doc.add_heading('What we are testing',1);doc.add_paragraph('Keep coordination on the canvas. Keep navigation in the rail.');t=doc.add_table(rows=1,cols=2);t.rows[0].cells[0].text='Owner';t.rows[0].cells[1].text='Focus';r=t.add_row();r.cells[0].text='Maya';r.cells[1].text='Research';doc.save(ROOT/'project-brief.docx')
w=Workbook();s=w.active;s.title='Plan'
for row in [['Workstream','Hours','Owner'],['Research',12,'Maya'],['Design',18,'Alex'],['Build',24,'Dylan'],['Total','=SUM(B2:B4)','']]:s.append(row)
for c in s[1]:c.font=Font(bold=True)
s.column_dimensions['A'].width=21;s.column_dimensions['B'].width=14;s.column_dimensions['C'].width=18
s=w.create_sheet('Assumptions');s.append(['Assumption','Value']);s.append(['Working days',5]);w.save(ROOT/'working-plan.xlsx')
p=Presentation();p.slide_width=Inches(13.333333);p.slide_height=Inches(7.5)
for title,body in [('Project review','From scattered work to shared understanding.'),('One shared context','Conversations, references, and goals stay connected.'),('The next decision','Review the evidence. Choose the next experiment.')]:
    slide=p.slides.add_slide(p.slide_layouts[6]);box=slide.shapes.add_textbox(Inches(1),Inches(1.3),Inches(11),Inches(1.5));run=box.text_frame.paragraphs[0].add_run();run.text=title;run.font.size=Pt(44);run.font.bold=True
    box=slide.shapes.add_textbox(Inches(1),Inches(3.4),Inches(10.8),Inches(1.5));box.text_frame.text=body;box.text_frame.paragraphs[0].runs[0].font.size=Pt(24)
p.save(ROOT/'project-review.pptx')
print('Created DOCX/XLSX/PPTX fixtures in',ROOT)

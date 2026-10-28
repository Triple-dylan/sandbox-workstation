import io, sys, unittest, zipfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from office_import import parse_office, PreviewError, MAX_EXPANDED
FIXTURES=Path(__file__).parent/'fixtures'
class OfficePreviewTests(unittest.TestCase):
    def test_docx(self):
        value=parse_office((FIXTURES/'project-brief.docx').read_bytes(),'project-brief.docx')
        self.assertEqual(value['kind'],'document')
        self.assertTrue(any(b['type']=='heading' and b['text']=='Project brief' for b in value['document']['blocks']))
        self.assertTrue(any(b['type']=='table' for b in value['document']['blocks']))
    def test_xlsx(self):
        value=parse_office((FIXTURES/'working-plan.xlsx').read_bytes(),'working-plan.xlsx')
        sheets=value['workbook']['sheets']
        self.assertEqual([s['name'] for s in sheets],['Plan','Assumptions'])
        self.assertEqual(sheets[0]['cells']['B5']['formula'],'SUM(B2:B4)')
        self.assertEqual(sheets[0]['cells']['A2']['value'],'Research')
    def test_pptx(self):
        value=parse_office((FIXTURES/'project-review.pptx').read_bytes(),'project-review.pptx')
        self.assertEqual(len(value['presentation']['slides']),3)
        self.assertAlmostEqual(value['presentation']['ratio'],16/9,places=3)
        self.assertTrue(any('Project review' in e.get('text','') for e in value['presentation']['slides'][0]['elements']))
    def test_invalid_zip(self):
        with self.assertRaises(PreviewError):parse_office(b'not a zip','bad.docx')
    def test_unsupported(self):
        with self.assertRaises(PreviewError):parse_office(b'not a zip','bad.exe')
    def test_xml_entity(self):
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,'w') as z:z.writestr('word/document.xml','<!DOCTYPE x [<!ENTITY x "unsafe">]><x/>')
        with self.assertRaises(PreviewError):parse_office(buf.getvalue(),'entity.docx')
if __name__=='__main__':unittest.main()

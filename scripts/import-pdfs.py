#!/usr/bin/env python3
"""Import the supplied Chinese CTFL PDFs using Poppler and ImageMagick.

Usage: python scripts/import-pdfs.py --source-dir /path/to/pdfs
Coordinates, source hashes and original crops make imports auditable.
"""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {'p': 'http://www.w3.org/1999/xhtml'}
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/questions'
SCALE = 160 / 72
# Questions whose layout conveys information: preserve the entire stem as images.
RICH = {'A': {'14', '21', '22', '23', '33', '34', 'A6', 'A20'},
        'B': {'22', '23', '31', '32', '38'},
        'C': {'21', '22', '23', '24', '31', '32'},
        'D': {'21', '22', '23', '29', '31', '32'}}


def run(*args):
    return subprocess.run(args, capture_output=True, text=True, check=True).stdout


def read_pdf(pdf, folder):
    xml = folder / (pdf.stem + '.html')
    run('pdftotext', '-bbox-layout', str(pdf), str(xml))
    pages = []
    for index, page in enumerate(ET.parse(xml).getroot().findall('.//p:page', NS)):
        height = float(page.get('height'))
        lines = []
        for line in page.findall('.//p:line', NS):
            d = {k: float(line.get(k)) for k in ['xMin', 'xMax', 'yMin', 'yMax']}
            d.update(text=' '.join(w.text or '' for w in line), page=index)
            if (45 if '答案' in pdf.name else 74) < d['yMin'] < height - 65:
                lines.append(d)
        pages.append({'width': float(page.get('width')), 'height': height,
                      'lines': sorted(lines, key=lambda x: (round(x['yMin'] / 3), x['xMin']))})
    return pages


def rows(lines):
    result = []
    for line in sorted(lines, key=lambda x: (x['page'], x['yMin'], x['xMin'])):
        if result and result[-1][0]['page'] == line['page'] and abs(result[-1][0]['yMin'] - line['yMin']) < 3:
            result[-1].append(line)
        else:
            result.append([line])
    return [(r[0]['page'], min(l['yMin'] for l in r), ' '.join(l['text'] for l in sorted(r, key=lambda l: l['xMin']))) for r in result]


def text_of(lines):
    result = ''
    previous = None
    for page, y, text in rows(lines):
        text = text.replace('\uf0b7', '•').strip()
        if not text:
            continue
        if previous:
            pp, py, pt = previous
            newpara = (page != pp or y - py > 25 or re.match(r'^(?:[a-e][)）]|[ivx]+[.、]|[•●]|\d+[.、]|TC\s*\d)', text, re.I)
                       or re.search(r'[。？！：:]$', pt))
            result += '\n' if newpara else (' ' if re.search(r'[A-Za-z0-9]$', pt) and re.match(r'[A-Za-z0-9]', text) else '')
        result += text
        previous = (page, y, text)
    return result.strip()


def pos(line, offset=0):
    return line['page'], line['yMin'] + offset


def between(pages, start, end):
    return [l for p in pages for l in p['lines'] if start <= pos(l) < end]


def render_ranges(pdf, pages, start, end, prefix, folder, xbounds=None):
    assets = []
    for page in range(start[0], min(end[0] + 1, len(pages))):
        top = max(76, start[1] if page == start[0] else 76)
        bottom = min(pages[page]['height'] - 66, end[1] if page == end[0] else pages[page]['height'] - 66)
        content = [l for l in pages[page]['lines'] if top - 3 <= l['yMin'] < bottom]
        if not content or bottom - top < 5:
            continue
        # Trim trailing white space while retaining vector diagrams between text lines.
        bottom = min(bottom, max(l['yMax'] for l in content) + 8)
        cache = folder / f'{pdf.stem}-{page + 1}'
        raster = Path(str(cache) + '.png')
        if not raster.exists():
            run('pdftoppm', '-f', str(page + 1), '-l', str(page + 1), '-r', '160', '-singlefile', '-png', str(pdf), str(cache))
        left, right = xbounds or (50, pages[page]['width'] - 49)
        name = f'{prefix}-{page + 1}.webp'
        geometry = f'{round((right-left)*SCALE)}x{round((bottom-top)*SCALE)}+{round(left*SCALE)}+{round(top*SCALE)}'
        run('magick', str(raster), '-crop', geometry, '+repage', '-quality', '90', str(OUT / name))
        assets.append('/' + (OUT / name).relative_to(ROOT / 'public').as_posix())
    return assets


def metadata(pdf):
    text = run('pdftotext', '-layout', str(pdf), '-')
    rx = r'\b(A?\d{1,2})\s+([a-e](?:\s*[,，]\s*[a-e])*)\s+(FL-[\d.]+)\s+(K[123])\s+(\d)'
    data = {}
    for number, answer, lo, level, score in re.findall(rx, text):
        entry = {'correctAnswers': re.findall('[a-e]', answer.upper(), re.I), 'learningObjective': lo, 'level': level, 'points': int(score)}
        entry['correctAnswers'] = [s.upper() for s in entry['correctAnswers']]
        if number in data:
            assert data[number] == entry, f'Conflicting reference answer: {pdf.name} {number}'
        data[number] = entry
    return data


def explanations(pdf, pages, paper, numbers, folder):
    # Only explanation tables, never the two-column reference tables.
    eligible = []
    page_columns = {}
    for i, page in enumerate(pages):
        headers = [l for l in page['lines'] if re.sub(r'\s+', '', l['text']) in {'说明/理由', '解释理由'} and l['yMin'] < 140]
        lo = [l['xMin'] for l in page['lines'] if '学习目标' in l['text'] and l['xMin'] > 500 and l['yMin'] < 140]
        if not headers or not lo:
            continue
        page_columns[i] = (180 if paper in 'AB' else 210, min(lo) - 6, max(l['yMax'] for l in headers) + 2)
        eligible.extend(page['lines'])
    starts = []
    expected = 0
    for l in sorted(eligible, key=lambda l: pos(l)):
        if expected >= len(numbers):
            break
        if l['text'].strip() == numbers[expected] and l['xMin'] < 140:
            same = [a for a in eligible if a['page'] == l['page'] and abs(a['yMin'] - l['yMin']) < 10]
            if any(re.fullmatch(r'[a-e](?:\s*[,，]\s*[a-e])*', a['text'], re.I) and 125 < a['xMin'] < 205 for a in same):
                starts.append(l)
                expected += 1
    assert expected == len(numbers), f'{paper}: explanation rows {expected}/{len(numbers)}'
    result = {}
    # D repeats all explanation rows after its second reference table. Stop at the first copy.
    last_page = starts[-1]['page']
    while last_page + 1 in page_columns:
        next_lines = pages[last_page + 1]['lines']
        if any(l['xMin'] < 140 and l['text'] == '1' for l in next_lines):
            break
        last_page += 1
    for i, start in enumerate(starts):
        end = pos(starts[i+1], -8) if i + 1 < len(starts) else (last_page, pages[last_page]['height'] - 66)
        # A: formal question 40 ends before the supplementary section heading.
        lines = []
        for l in between(pages, pos(start, -8), end):
            if l['page'] not in page_columns:
                continue
            left, right, header_bottom = page_columns[l['page']]
            if left <= l['xMin'] < right and l['yMin'] > header_bottom and not re.search('附录：|附加模拟题答案|答案解析', l['text']):
                lines.append(l)
        result[numbers[i]] = {'explanation': text_of(lines), 'answerPages': sorted({l['page'] + 1 for l in lines}),
                              'answerImages': render_ranges(pdf, pages, pos(start, -8), end, f'{paper}-{numbers[i]}-answer', folder)}
    return result


def import_paper(paper, source, folder):
    question_pdf = next(source.glob(f'*模拟卷{paper}问题*中文版*.pdf'))
    answer_pdf = next(source.glob(f'*模拟卷{paper}答案*中文版*.pdf'))
    qpages = read_pdf(question_pdf, folder)
    apages = read_pdf(answer_pdf, folder)
    numbers = [str(x) for x in range(1,41)] + ([f'A{x}' for x in range(1,27)] if paper == 'A' else [])
    info = metadata(answer_pdf)
    assert set(info) == set(numbers), f'{paper}: metadata count {len(info)}'
    answers = explanations(answer_pdf, apages, paper, numbers, folder)
    starts = []
    for p in qpages[7:]:
        for l in sorted(p['lines'], key=lambda l: (l['yMin'], l['xMin'])):
            m = re.match(r'^(A?\d{1,2})[.．]\s*', l['text'])
            if m and l['xMin'] < 70 and len(starts) < len(numbers) and m[1] == numbers[len(starts)]:
                starts.append(l)
    assert len(starts) == len(numbers), f'{paper}: question starts {len(starts)}/{len(numbers)}'
    result = []
    for i, start in enumerate(starts):
        number = numbers[i]
        end = pos(starts[i+1], -3) if i+1 < len(starts) else (len(qpages)-1, qpages[-1]['height']-66)
        lines = between(qpages, pos(start, -1), end)
        lines = [l for l in lines if not re.search('附录[：:]|附加模拟题|^问题$', l['text'])]
        labels = [l for l in lines if re.fullmatch('[A-E]', l['text']) and l['xMin'] < 92]
        # Left-hand scenario labels can also be letters; use the final contiguous A..D/E set.
        candidates = []
        for k, l in enumerate(labels):
            if l['text'] == 'A':
                seq = [l]
                for following in labels[k+1:]:
                    if following['text'] == chr(ord('A')+len(seq)):
                        seq.append(following)
                    else:
                        break
                if len(seq) >= 4:
                    candidates.append(seq)
        assert candidates, f'{paper}-{number}: no options'
        labels = candidates[-1]
        above = [l for l in lines if l['page'] == labels[0]['page'] and labels[0]['yMin']-23 < l['yMin'] < labels[0]['yMin']-3 and l['xMin'] > 95]
        shift = labels[0]['yMin'] - min(l['yMin'] for l in above) if above else 0
        first_option = pos(labels[0], -shift-2)
        stemlines = [l.copy() for l in lines if pos(l) < first_option]
        if stemlines:
            stemlines[0]['text'] = re.sub(r'^'+number+r'[.．]\s*', '', stemlines[0]['text'])
        stemlines = [l for l in stemlines if l['text']]
        opts = []
        for k, label in enumerate(labels):
            a = pos(label, -shift-2)
            b = pos(labels[k+1], -shift-2) if k+1 < len(labels) else end
            content = [l for l in lines if a <= pos(l) < b and l not in labels]
            opts.append({'id': label['text'], 'text': text_of(content)})
        rich = number in RICH[paper]
        item = {'id': f'{paper}-{number}', 'paper': paper, 'number': number, 'supplementary': number.startswith('A'),
                'chapter': int(info[number]['learningObjective'].split('-')[1].split('.')[0]),
                'stem': text_of(stemlines), 'options': opts, **info[number], **answers[number],
                'selectionCount': len(info[number]['correctAnswers']),
                'sourcePages': sorted({l['page'] + 1 for l in lines}),
                'sourceImages': render_ranges(question_pdf, qpages, pos(start, -3), end, f'{paper}-{number}-question', folder),
                'stemImages': render_ranges(question_pdf, qpages, pos(start, -3), first_option, f'{paper}-{number}-stem', folder) if rich else []}
        assert item['stem'] and all(o['text'] for o in opts) and item['explanation'], f'{paper}-{number}: empty content'
        result.append(item)
    return result, {'paper': paper, 'questionFile': question_pdf.name, 'answerFile': answer_pdf.name,
                    'questionSha256': hashlib.sha256(question_pdf.read_bytes()).hexdigest(),
                    'answerSha256': hashlib.sha256(answer_pdf.read_bytes()).hexdigest()}


def main():
    global OUT
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', required=True, type=Path)
    parser.add_argument('--bank-version', required=True, help='New unpublished major.minor.patch version')
    args = parser.parse_args()
    if not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', args.bank_version):
        parser.error('bank version must be major.minor.patch')
    if (ROOT / 'public/data/banks' / (args.bank_version + '.json')).exists():
        parser.error('this bank version is already frozen; choose a new version')
    OUT = ROOT / 'public/questions' / args.bank_version
    OUT.mkdir(parents=True, exist_ok=False)
    questions, sources = [], []
    with tempfile.TemporaryDirectory(prefix='istqb-pdf-') as directory:
        for paper in 'ABCD':
            q, source = import_paper(paper, args.source_dir, Path(directory))
            questions.extend(q)
            sources.append(source)
            print(f'{paper}: {len(q)} questions imported', flush=True)
    # Import into the working copy only; frozen releases are published separately.
    payload = {'version': 1, 'bankVersion': args.bank_version, 'syllabus': 'CTFL 4.0.1', 'sources': sources, 'questions': questions}
    pdf_out = ROOT / 'public/sources'
    pdf_out.mkdir(parents=True, exist_ok=True)
    for source in sources:
        for key in ['questionFile', 'answerFile']:
            original = args.source_dir / source[key]
            destination = pdf_out / source[key]
            if original.resolve() != destination.resolve():
                if destination.exists() and original.read_bytes() != destination.read_bytes():
                    raise ValueError(f'Refusing to overwrite an existing source PDF: {destination.name}')
                shutil.copyfile(original, destination)
    (ROOT / 'public/data/questions.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2)+'\n')
    print(f'Imported {len(questions)} questions')


if __name__ == '__main__':
    main()
